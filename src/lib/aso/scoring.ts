import { itunesHintsDetailed, type HintDetailed } from "./itunes.js";
import type { AnalyzeResult } from "./types.js";

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Quanto è affollata/forte la keyword (1-100) — NON è search demand.
 * Deriva dal numero di app che rankano + volume medio di recensioni + leader heat.
 * Storicamente era esposta come "popularity" ma misurava competition, non domanda.
 */
export function competitionHeat(r: AnalyzeResult): number {
  const appsFactor = clamp(r.totalApps / 50, 0, 1);
  const revFactor = clamp(Math.log10(Math.max(r.avgReviews, 1)) / 5, 0, 1);
  const maxRevFactor = clamp(Math.log10(Math.max(r.maxReviews, 1)) / 6, 0, 1);
  const raw = 0.35 * appsFactor + 0.40 * revFactor + 0.25 * maxRevFactor;
  return Math.round(1 + 99 * raw);
}

/**
 * Quanto è difficile rankare per la keyword (1-100).
 * Deriva da forza competitiva media, densità del top-10, presenza di "monsters".
 */
export function difficulty(r: AnalyzeResult): number {
  const compStrength = 100 - r.scores.strength;
  const top10Dens = 100 - r.scores.top10density;
  const monsterPen = clamp(r.distribution.monsters * 12, 0, 60);
  const strongPen = clamp(r.distribution.strong * 4, 0, 25);
  const raw =
    0.40 * compStrength + 0.30 * top10Dens + 0.20 * monsterPen + 0.10 * strongPen;
  return Math.round(clamp(1 + raw, 1, 100));
}

export interface PopularityEvidence {
  appears_in_own_hints: boolean;
  own_hints_rank: number;
  /**
   * Empty in current implementation: Apple's MZSearchHints endpoint does
   * not expose a priority/score field for hints. Kept in the shape for
   * forward compatibility if Apple ever adds it. Callers should prefer
   * own_hints_rank for the ordinal signal.
   */
  own_hints_priority?: number;
  prefix_matches: number;
  prefix_samples: string[];
  prefix_ranks_avg: number;
  total_hints_for_keyword: number;
  short_keyword: boolean;
}

export interface PopularityResult {
  score: number;
  evidence: PopularityEvidence;
}

/**
 * Generate ~5 prefixes of the keyword, starting at 3 chars up to length-1.
 * Very short keywords (<4 chars) produce an empty list.
 */
export function buildPrefixes(keyword: string, samples = 5): string[] {
  const kw = keyword.trim();
  const n = kw.length;
  if (n < 4) return [];
  const start = 3;
  const end = n - 1;
  if (end <= start) return [kw.slice(0, start)];
  const out = new Set<string>();
  for (let i = 0; i < samples; i++) {
    const len = Math.round(start + (end - start) * (i / (samples - 1)));
    out.add(kw.slice(0, len));
  }
  return Array.from(out);
}

/**
 * Rank → weight. Steep curve: only rank 0 and rank 1 really count.
 * The autosuggest endpoint frequently returns 10 alphabetically-adjacent
 * completions at low ranks even for niches with no real demand, so weight
 * rank 2+ heavily less.
 */
function rankFactor(rank: number): number {
  if (rank < 0) return 0;
  if (rank === 0) return 1.0;
  if (rank === 1) return 0.7;
  if (rank === 2) return 0.45;
  if (rank === 3) return 0.28;
  if (rank === 4) return 0.18;
  if (rank <= 6) return 0.10;
  return 0.05;
}

function rankOf(hints: HintDetailed[], kwLower: string): number {
  for (let i = 0; i < hints.length; i++) {
    const h = hints[i]!.term.toLowerCase();
    if (h === kwLower || h.includes(kwLower)) return i;
  }
  return -1;
}

/**
 * Popularity (1-100) calibrated against Apple Search Ads ground truth.
 *
 * Signal vocabulary:
 *  - own_hints  = hints returned when Apple autosuggest receives K itself
 *  - prefixes   = progressive truncations of K (3 chars → len-1)
 *  - rank       = 0-indexed position of K in a hints list (lower = more demand)
 *
 * Weighted blend (no priority field — Apple doesn't expose one):
 *   popularity = 50 * avg_rank_factor(prefixes)   # typing-behavior signal
 *              + 25 * rank_factor(own_rank)        # K at top of its own hints
 *              + 15 * prefix_coverage              # breadth across prefixes
 *              + 10 * hints_density                # topic richness
 *
 * Calibrated on 57 keywords with Apple Search Ads popularity 5..95.
 *
 * Edge cases:
 *  - Keyword < 4 chars → return 50 + short_keyword flag.
 *  - Zero signal everywhere (no own hints + no prefix matches) → return 5.
 */
export async function popularity(
  keyword: string,
  country = "us",
): Promise<PopularityResult> {
  const kw = keyword.trim();
  const kwLower = kw.toLowerCase();

  if (kwLower.length < 4) {
    return {
      score: 50,
      evidence: {
        appears_in_own_hints: false,
        own_hints_rank: -1,
        prefix_matches: 0,
        prefix_samples: [],
        prefix_ranks_avg: -1,
        total_hints_for_keyword: 0,
        short_keyword: true,
      },
    };
  }

  const prefixes = buildPrefixes(kwLower);
  const [ownHints, ...prefixHintsArr] = await Promise.all([
    itunesHintsDetailed(kwLower, country),
    ...prefixes.map((p) => itunesHintsDetailed(p, country)),
  ]);

  const own = ownHints ?? [];
  const total_hints_for_keyword = own.length;
  const own_hints_rank = rankOf(own, kwLower);
  const appears_in_own_hints = own_hints_rank !== -1;

  let prefix_matches = 0;
  const prefix_samples: string[] = [];
  const matchedRanks: number[] = [];
  let rankFactorSum = 0;

  for (let i = 0; i < prefixes.length; i++) {
    const p = prefixes[i]!;
    const hints = prefixHintsArr[i] ?? [];
    const rank = rankOf(hints, kwLower);
    rankFactorSum += rankFactor(rank);
    if (rank !== -1) {
      prefix_matches++;
      prefix_samples.push(p);
      matchedRanks.push(rank);
    }
  }

  const numPrefixes = Math.max(1, prefixes.length);
  const avg_rank_factor = rankFactorSum / numPrefixes;
  const own_rank_factor = rankFactor(own_hints_rank);
  const prefix_coverage = prefix_matches / numPrefixes;
  const hints_density = Math.min(total_hints_for_keyword / 10, 1);
  const prefix_ranks_avg =
    matchedRanks.length > 0
      ? matchedRanks.reduce((s, r) => s + r, 0) / matchedRanks.length
      : -1;

  // Dead-niche shortcut: no signal anywhere.
  if (
    total_hints_for_keyword === 0 &&
    !appears_in_own_hints &&
    prefix_matches === 0
  ) {
    return {
      score: 5,
      evidence: {
        appears_in_own_hints,
        own_hints_rank,
        prefix_matches,
        prefix_samples,
        prefix_ranks_avg,
        total_hints_for_keyword,
        short_keyword: false,
      },
    };
  }

  // Raw weighted blend.
  const raw =
    55 * avg_rank_factor +
    20 * own_rank_factor +
    15 * prefix_coverage +
    10 * hints_density;

  // Output calibration: the raw score correlates with Apple Search Ads
  // popularity (Spearman ~0.89) but saturates — Apple's autosuggest gives
  // the same top-rank response for both mainstream ("whatsapp", Apple 95)
  // and crowded niches ("habit tracker", Apple 55), so perfect bucket
  // separation at the high end is impossible from this data source alone.
  // Ranges tuned on 57 ASA-labelled keywords. Best observed accuracy ~66%.
  let calibrated: number;
  if (raw >= 99) calibrated = 92; // → Apple 95
  else if (raw >= 92) calibrated = 78; // → Apple 75
  else if (raw >= 80) calibrated = 58; // → Apple 55
  else if (raw >= 25) calibrated = 22; // → Apple 20
  else calibrated = 10;

  const score = Math.round(clamp(calibrated, 1, 100));

  return {
    score,
    evidence: {
      appears_in_own_hints,
      own_hints_rank,
      prefix_matches,
      prefix_samples,
      prefix_ranks_avg: Number(prefix_ranks_avg.toFixed(2)),
      total_hints_for_keyword,
      short_keyword: false,
    },
  };
}
