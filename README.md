# ASO Keyword Validator

Un tool ASO (App Store Optimization) composto da due pezzi:

- **Frontend** — SPA Vite+React che analizza keyword per iOS usando l'iTunes Search API pubblica.
- **MCP Server** — espone lo stesso motore di analisi come MCP server remoto, usabile da Claude.

La logica di scoring (opportunity, popularity, difficulty, distribution, related keywords, ASO suggestions) è unificata in `src/lib/aso/` e condivisa tra frontend e server.

## Struttura

```
src/lib/aso/     # logica pura (analyze, suggestions, scoring, expand, constants, types, itunes)
src/server/      # MCP server Node/TS (+ tools)
app.jsx          # frontend entry
```

## Sviluppo locale

### Frontend

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/
npm run preview
```

### MCP Server

```bash
cp .env.example .env   # setta MCP_BEARER_TOKEN con un token lungo random
npm run dev:server     # tsx watch src/server/index.ts
# oppure:
npm run build:server && npm run start:server
```

Endpoint:
- `GET  /healthz` → status
- `ALL  /mcp` → MCP JSON-RPC over Streamable HTTP (richiede `Authorization: Bearer <MCP_BEARER_TOKEN>`)

### Connessione da MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```
Transport: Streamable HTTP · URL: `http://localhost:8787/mcp` · Header: `Authorization: Bearer <token>`

## Tool MCP esposti

### `aso_keyword_check`
Input: `{ keywords: string[] (1-20), country?: string, store?: "app_store" }`
Output: `{ results: [{ keyword, country, popularity, difficulty, apps_in_ranking, updated_at }] }`
Popularity e difficulty sono derivate dalla logica di `analyzeResults()` (iTunes API) — scala 1-100.

### `aso_top_apps_for_keyword`
Input: `{ keyword: string, country?: string, limit?: number (1-50) }`
Output: lista top-N app con rank, rating, rating_count, publisher, icon_url, app_store_url, price_info, last_updated.

### `aso_app_details`
Input: `{ app_id: string (numerico), country?: string }`
Output: dettagli iTunes Lookup (descrizione, rating, prezzo, versione, screenshots, categoria). Non include `keyword_rankings` (richiederebbe API a pagamento).

### `aso_keyword_suggestions`
Input: `{ seed: string, country?: string, limit?: number (1-25) }`
Output: `{ seed, country, source: "hints" | "related", suggestions: string[] }`
Primario: Apple search hints. Fallback: related keywords estratte dai titoli delle app che rankano per il seed.

## Deploy su Coolify

Il `docker-compose.yaml` contiene **solo il servizio `api`** (MCP server). Il frontend React si sviluppa in locale con `npm run dev` ma non va in produzione.

1. DNS: A record `aso-mcp.meltinbitfarm.cloud` → IP del VPS Coolify.
2. In Coolify → *Environment Variables*:
   - `MCP_BEARER_TOKEN=<token>` — genera con `openssl rand -hex 32`.
   - Opzionali: `CACHE_TTL_MS`, `CACHE_MAX_ENTRIES`.
3. Il compose hardcoda `SERVICE_FQDN_API=aso-mcp.meltinbitfarm.cloud`, quindi Coolify non genera subdomain random — usa quello fisso e configura Traefik + HTTPS per lui. Il container ascolta su **porta 80**.
4. Push su `main` → deploy automatico.

Build locale di verifica (solo il servizio api):

```bash
cp .env.example .env   # setta MCP_BEARER_TOKEN
docker compose up --build
# servizio raggiungibile internamente sulla rete docker; per testarlo
# aggiungi in un docker-compose.override.yaml (gitignored):
#   services:
#     api:
#       ports: ["8080:80"]
# poi: curl http://localhost:8080/healthz
```

## Env vars server

Vedi `.env.example`. `MCP_BEARER_TOKEN` è obbligatorio — il server fa `process.exit(1)` se manca.

## Data source & limiti

Tutti i tool usano iTunes Search/Lookup API pubbliche (zero costi, nessuna API key esterna). Limiti pratici:
- `search` restituisce max ~200 risultati per keyword (paginabile, qui ne prendiamo 50 per `aso_keyword_check`).
- `keyword_rankings` di una specifica app non è disponibile senza provider a pagamento — lo tool `aso_app_details` lo salta per design.
- L'endpoint `MZSearchHints` usato da `aso_keyword_suggestions` non è documentato ufficialmente: fragile, gestito con fallback automatico su related keywords.

## Cache

`lru-cache` in-memory, TTL 24h, max 2000 entries. Chiave per-keyword (non per-batch), così le batch parziali beneficiano degli hit. Per deploy multi-istanza swappare `src/server/cache.ts` con Redis.
