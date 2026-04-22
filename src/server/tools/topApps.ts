import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchItunes } from "../../lib/aso/itunes.js";
import type { ItunesApp } from "../../lib/aso/types.js";
import { cache, cacheKey } from "../cache.js";
import { errorContent } from "../errors.js";
import { topAppsInput, type TopAppsArgs } from "../schemas.js";

interface TopApp {
  rank: number;
  app_id: string;
  name: string;
  publisher: string;
  rating: number | null;
  rating_count: number;
  icon_url: string;
  app_store_url: string;
  price_info: {
    price: number;
    currency: string | null;
    formatted: string | null;
    is_free: boolean;
  };
  last_updated: string | null;
}

function mapApp(a: ItunesApp, index: number): TopApp {
  const icon = a.artworkUrl512 ?? a.artworkUrl100 ?? a.artworkUrl60 ?? "";
  return {
    rank: index + 1,
    app_id: String(a.trackId),
    name: a.trackName,
    publisher: a.artistName,
    rating: typeof a.averageUserRating === "number" ? a.averageUserRating : null,
    rating_count: a.userRatingCount ?? 0,
    icon_url: icon,
    app_store_url: a.trackViewUrl ?? "",
    price_info: {
      price: a.price ?? 0,
      currency: a.currency ?? null,
      formatted: a.formattedPrice ?? null,
      is_free: (a.price ?? 0) === 0,
    },
    last_updated: a.currentVersionReleaseDate ?? null,
  };
}

export function registerTopApps(server: McpServer): void {
  server.registerTool(
    "aso_top_apps_for_keyword",
    {
      title: "Top Apps for Keyword",
      description:
        "Ritorna le top N app che rankano per una keyword in un country. Utile per competitor analysis rapida.",
      inputSchema: topAppsInput,
    },
    async (args) => {
      const { keyword, country, limit } = args as TopAppsArgs;
      try {
        const key = cacheKey(["top", keyword.toLowerCase(), country, limit]);
        const cached = cache.get(key) as object | undefined;
        if (cached) {
          return { content: [{ type: "text", text: JSON.stringify(cached, null, 2) }] };
        }
        const apps = await searchItunes(keyword, country, limit);
        const payload = {
          keyword,
          country,
          apps: apps.slice(0, limit).map(mapApp),
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
