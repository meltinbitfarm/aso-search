import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { analyzeResults } from "../../lib/aso/analyze.js";
import { itunesHints, searchItunes } from "../../lib/aso/itunes.js";
import { cache, cacheKey } from "../cache.js";
import { errorContent } from "../errors.js";
import {
  keywordSuggestionsInput,
  type KeywordSuggestionsArgs,
} from "../schemas.js";

interface SuggestionsPayload {
  seed: string;
  country: string;
  source: "hints" | "related";
  suggestions: string[];
  updated_at: string;
}

async function getSuggestions(
  seed: string,
  country: string,
  limit: number,
): Promise<SuggestionsPayload> {
  // primary: Apple hints (non-documented, best quality for ASO)
  const hints = await itunesHints(seed, country);
  if (hints.length > 0) {
    return {
      seed,
      country,
      source: "hints",
      suggestions: hints.slice(0, limit),
      updated_at: new Date().toISOString(),
    };
  }
  // fallback: related keywords derived from titles ranking for the seed
  const apps = await searchItunes(seed, country, 50);
  const analysis = analyzeResults(apps, seed);
  const related = analysis?.relatedKeywords.map((r) => r.word) ?? [];
  return {
    seed,
    country,
    source: "related",
    suggestions: related.slice(0, limit),
    updated_at: new Date().toISOString(),
  };
}

export function registerKeywordSuggestions(server: McpServer): void {
  server.registerTool(
    "aso_keyword_suggestions",
    {
      title: "Keyword Suggestions",
      description:
        "Suggerisce keyword correlate a un seed. Strategia ibrida: prima prova gli Apple search hints (alta qualità ma endpoint non ufficiale), fallback su related keywords estratte dai titoli delle app.",
      inputSchema: keywordSuggestionsInput,
    },
    async (args) => {
      const { seed, country, limit } = args as KeywordSuggestionsArgs;
      try {
        const key = cacheKey(["sug", seed.toLowerCase(), country, limit]);
        const cached = cache.get(key) as SuggestionsPayload | undefined;
        if (cached) {
          return { content: [{ type: "text", text: JSON.stringify(cached, null, 2) }] };
        }
        const payload = await getSuggestions(seed, country, limit);
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
