import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { analyzeResults } from "../../lib/aso/analyze.js";
import { searchItunes } from "../../lib/aso/itunes.js";
import { difficulty, popularity } from "../../lib/aso/scoring.js";
import { cache, cacheKey } from "../cache.js";
import { errorContent } from "../errors.js";
import { keywordCheckInput, type KeywordCheckArgs } from "../schemas.js";

interface KeywordCheckResult {
  keyword: string;
  country: string;
  popularity: number;
  difficulty: number;
  apps_in_ranking: number;
  updated_at: string;
}

async function checkOne(
  keyword: string,
  country: string,
  store: string,
): Promise<KeywordCheckResult> {
  const key = cacheKey(["kw", keyword.toLowerCase(), country, store]);
  const cached = cache.get(key) as KeywordCheckResult | undefined;
  if (cached) return cached;

  const apps = await searchItunes(keyword, country, 50);
  const analysis = analyzeResults(apps, keyword);
  const result: KeywordCheckResult = analysis
    ? {
        keyword,
        country,
        popularity: popularity(analysis),
        difficulty: difficulty(analysis),
        apps_in_ranking: analysis.totalApps,
        updated_at: analysis.timestamp,
      }
    : {
        keyword,
        country,
        popularity: 1,
        difficulty: 1,
        apps_in_ranking: 0,
        updated_at: new Date().toISOString(),
      };

  cache.set(key, result);
  return result;
}

export function registerKeywordCheck(server: McpServer): void {
  server.registerTool(
    "aso_keyword_check",
    {
      title: "ASO Keyword Check",
      description:
        "Analizza 1-20 keyword per lo store e ritorna popularity (1-100), difficulty (1-100), apps_in_ranking e timestamp. Data source: iTunes Search API pubblica.",
      inputSchema: keywordCheckInput,
    },
    async (args) => {
      const { keywords, country, store } = args as KeywordCheckArgs;
      try {
        const results = await Promise.all(
          keywords.map((kw) => checkOne(kw, country, store)),
        );
        return {
          content: [{ type: "text", text: JSON.stringify({ results }, null, 2) }],
        };
      } catch (e) {
        return errorContent(e);
      }
    },
  );
}
