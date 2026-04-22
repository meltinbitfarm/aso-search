import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { lookupItunes } from "../../lib/aso/itunes.js";
import { cache, cacheKey } from "../cache.js";
import { errorContent } from "../errors.js";
import { appDetailsInput, type AppDetailsArgs } from "../schemas.js";

export function registerAppDetails(server: McpServer): void {
  server.registerTool(
    "aso_app_details",
    {
      title: "App Details",
      description:
        "Dettagli di una singola app (rating, descrizione, prezzo, screenshots, versione, data release). Niente keyword_rankings — richiederebbe API a pagamento.",
      inputSchema: appDetailsInput,
    },
    async (args) => {
      const { app_id, country } = args as AppDetailsArgs;
      try {
        const key = cacheKey(["app", app_id, country]);
        const cached = cache.get(key) as object | undefined;
        if (cached) {
          return { content: [{ type: "text", text: JSON.stringify(cached, null, 2) }] };
        }
        const app = await lookupItunes(app_id, country);
        if (!app) {
          return errorContent({
            message: `app_id ${app_id} not found in country "${country}"`,
          });
        }
        const screenshots = [
          ...(app.screenshotUrls ?? []),
          ...(app.ipadScreenshotUrls ?? []),
        ];
        const icon = app.artworkUrl512 ?? app.artworkUrl100 ?? app.artworkUrl60 ?? "";
        const payload = {
          app_id: String(app.trackId),
          name: app.trackName,
          publisher: app.artistName,
          description: app.description ?? "",
          category: app.primaryGenreName ?? null,
          rating: typeof app.averageUserRating === "number" ? app.averageUserRating : null,
          rating_count: app.userRatingCount ?? 0,
          price: app.price ?? 0,
          currency: app.currency ?? null,
          formatted_price: app.formattedPrice ?? null,
          is_free: (app.price ?? 0) === 0,
          current_version: app.version ?? null,
          last_updated: app.currentVersionReleaseDate ?? null,
          release_date: app.releaseDate ?? null,
          icon_url: icon,
          app_store_url: app.trackViewUrl ?? "",
          screenshots,
          updated_at: new Date().toISOString(),
        };
        cache.set(key, payload);
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        };
      } catch (e) {
        return errorContent(e);
      }
    },
  );
}
