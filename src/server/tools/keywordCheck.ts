import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { analyzeResults } from "../../lib/aso/analyze.js";
import { searchItunes } from "../../lib/aso/itunes.js";
import {
  competitionHeat,
  difficulty,
  popularity,
  type PopularityEvidence,
} from "../../lib/aso/scoring.js";
import { cache, cacheKey } from "../cache.js";
import { errorContent } from "../errors.js";
import { keywordCheckInput, type KeywordCheckArgs } from "../schemas.js";

// iTunes Search hard cap: the API is unreliable above 50 results per query.
// When totalApps === ITUNES_SEARCH_LIMIT we emit apps_in_ranking_capped=true.
const ITUNES_SEARCH_LIMIT = 50;

export interface KeywordCheckResult {
  keyword: string;
  country: string;
  popularity: number;
  competition_heat: number;
  difficulty: number;
  apps_in_ranking: number;
  apps_in_ranking_capped: boolean;
  autosuggest_evidence: PopularityEvidence;
  updated_at: string;
}

export async function checkOne(
  keyword: string,
  country: string,
  store: string,
): Promise<KeywordCheckResult> {
  const key = cacheKey(["kw", keyword.toLowerCase(), country, store]);
  const cached = cache.get(key) as KeywordCheckResult | undefined;
  if (cached) return cached;

  // Parallel: search iTunes (apps rank/competition) + autosuggest-based
  // popularity probing. They hit different Apple endpoints and don't share
  // a rate-limit bucket in practice.
  const [apps, pop] = await Promise.all([
    searchItunes(keyword, country, ITUNES_SEARCH_LIMIT),
    popularity(keyword, country),
  ]);

  const analysis = analyzeResults(apps, keyword);
  const nowIso = new Date().toISOString();
  const result: KeywordCheckResult = analysis
    ? {
        keyword,
        country,
        popularity: pop.score,
        competition_heat: competitionHeat(analysis),
        difficulty: difficulty(analysis),
        apps_in_ranking: analysis.totalApps,
        apps_in_ranking_capped: analysis.totalApps >= ITUNES_SEARCH_LIMIT,
        autosuggest_evidence: pop.evidence,
        updated_at: analysis.timestamp,
      }
    : {
        keyword,
        country,
        popularity: pop.score,
        competition_heat: 1,
        difficulty: 1,
        apps_in_ranking: 0,
        apps_in_ranking_capped: false,
        autosuggest_evidence: pop.evidence,
        updated_at: nowIso,
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
        "Analizza 1-20 keyword per lo store. Ritorna popularity (search demand, 1-100, derivata da Apple autosuggest), competition_heat (quanto è affollata la keyword, 1-100), difficulty (quanto è difficile rankare, 1-100), apps_in_ranking (capped a 50 per limiti API iTunes). Data source: iTunes Search API + Apple autosuggest hints (non-documented endpoint).",
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
