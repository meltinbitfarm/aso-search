import crypto from "node:crypto";
import express, { type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { bearerAuth } from "./auth.js";
import { registerKeywordCheck } from "./tools/keywordCheck.js";
import { registerTopApps } from "./tools/topApps.js";
import { registerAppDetails } from "./tools/appDetails.js";
import { registerKeywordSuggestions } from "./tools/keywordSuggestions.js";

const PORT = Number(process.env.PORT ?? 8787);
const TOKEN = process.env.MCP_BEARER_TOKEN;
if (!TOKEN) {
  console.error("FATAL: MCP_BEARER_TOKEN env var is required");
  process.exit(1);
}

function buildServer(): McpServer {
  const server = new McpServer({
    name: "aso-mcp",
    version: "0.1.0",
  });
  registerKeywordCheck(server);
  registerTopApps(server);
  registerAppDetails(server);
  registerKeywordSuggestions(server);
  return server;
}

const transports = new Map<string, StreamableHTTPServerTransport>();

async function handleMcp(req: Request, res: Response): Promise<void> {
  const sessionId = req.header("mcp-session-id");
  let transport = sessionId ? transports.get(sessionId) : undefined;

  if (!transport) {
    if (req.method === "POST" && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport!);
        },
      });
      transport.onclose = () => {
        if (transport?.sessionId) transports.delete(transport.sessionId);
      };
      const server = buildServer();
      await server.connect(transport);
    } else {
      res
        .status(400)
        .json({ error: "invalid_session", message: "unknown or missing mcp-session-id" });
      return;
    }
  }

  await transport.handleRequest(req, res, req.body);
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "aso-mcp", version: "0.1.0" });
});

app.use("/mcp", bearerAuth(TOKEN));
app.all("/mcp", (req, res) => {
  handleMcp(req, res).catch((e) => {
    console.error("MCP handler error:", e);
    if (!res.headersSent) {
      res.status(500).json({ error: "internal_error", message: String(e) });
    }
  });
});

app.listen(PORT, () => {
  console.log(`aso-mcp listening on :${PORT} (endpoint /mcp, health /healthz)`);
});
