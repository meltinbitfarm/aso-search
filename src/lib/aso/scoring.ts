import { itunesHints } from "./itunes.js";
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
  prefix_matches: number;
  prefix_samples: string[];
  total_hints_for_keyword: number;
  short_keyword?: boolean;
}

export interface PopularityResult {
  score: number;
  evidence: PopularityEvidence;
}

/**
 * Generate ~5 prefixes of the keyword, starting at 3 chars (always, for short
 * keywords we still need a very short prefix as a discriminator) up to
 * length-1. The set is deduplicated; very short keywords (<4 chars) produce
 * an empty list.
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

function rankOf(hints: string[], kw: string): number {
  const lower = kw.toLowerCase();
  for (let i = 0; i < hints.length; i++) {
    const h = hints[i]!.toLowerCase();
    if (h === lower || h.includes(lower)) return i;
  }
  return -1;
}

function qualityForRank(rank: number): number {
  if (rank === -1) return 0;
  if (rank === 0) return 1.0;
  if (rank <= 2) return 0.7;
  if (rank <= 5) return 0.4;
  return 0.15;
}

/**
 * Real search-demand signal derived from Apple's public autosuggest.
 *
 * Intuition: if a user typing progressively "l", "lu", "luc", "lucid" sees
 * "lucid dreaming" surface in Apple's hints, then real people type that
 * query. If autosuggest never offers it — at any prefix — the topic has
 * no measurable demand on the App Store.
 *
 * Algorithm:
 *  1. Fetch hints for the keyword itself (own hints) — count + whether K
 *     (or a variant containing K) shows up.
 *  2. Generate ~5 prefixes of K and fetch hints for each in parallel.
 *  3. Count prefix_matches = prefixes whose hints contain K.
 *  4. Boost score if a *short* prefix (≤ half of K's length) already
 *     surfaces K at the top (rank ≤ 1) — this is the mainstream signal.
 *
 * Tradeoffs documented:
 *  - Autosuggest is regional and noisy but it's the only public ground
 *    truth for typing behavior on the App Store.
 *  - Score is 1–95 (we never emit 100; Apple doesn't prove dominance).
 *  - Very short keywords (< 3 chars) get a neutral 50 — the prefix logic
 *    doesn't apply.
 *  - Pure niche ("cigar log", "nightmare tracker") lands 5-15.
 *  - Mainstream with short-prefix rank 0 ("instagram") lands 85-95.
 *  - Multi-word real niches ("lucid dreaming") land 50-75 because their
 *    short prefix ("lucid") does not rank them at the top.
 */
export async function popularity(
  keyword: string,
  country = "us",
): Promise<PopularityResult> {
  const kw = keyword.trim();
  const kwLower = kw.toLowerCase();

  if (kwLower.length < 3) {
    return {
      score: 50,
      evidence: {
        appears_in_own_hints: false,
        prefix_matches: 0,
        prefix_samples: [],
        total_hints_for_keyword: 0,
        short_keyword: true,
      },
    };
  }

  const prefixes = buildPrefixes(kwLower);

  // Own hints + all prefix hints in parallel. Apple's endpoint is public
  // and seems to tolerate ~6 concurrent calls per keyword without backoff.
  const [ownHints, ...prefixHints] = await Promise.all([
    itunesHints(kwLower, country),
    ...prefixes.map((p) => itunesHints(p, country)),
  ]);

  const own = ownHints ?? [];
  const total_hints_for_keyword = own.length;
  const appears_in_own_hints = rankOf(own, kwLower) !== -1;
  const own_exact_top = own[0]?.toLowerCase() === kwLower;

  // Split prefixes by length ratio. Short prefixes (<=50% of keyword) are
  // the real demand signal — seeing the keyword surface from a short prefix
  // means people actually type it. Long prefixes are "almost the whole word"
  // and virtually always surface the keyword, so they carry less weight.
  const halfLen = kwLower.length * 0.5;
  const shortIdx: number[] = [];
  const longIdx: number[] = [];
  for (let i = 0; i < prefixes.length; i++) {
    if (prefixes[i]!.length <= halfLen) shortIdx.push(i);
    else longIdx.push(i);
  }

  let prefix_matches = 0;
  let longMatched = 0;
  const prefix_samples: string[] = [];

  let shortNum = 0;
  for (const i of shortIdx) {
    const rank = rankOf(prefixHints[i] ?? [], kwLower);
    const q = qualityForRank(rank);
    shortNum += q;
    if (rank !== -1) {
      prefix_matches++;
      prefix_samples.push(prefixes[i]!);
    }
  }
  let longNum = 0;
  for (const i of longIdx) {
    const rank = rankOf(prefixHints[i] ?? [], kwLower);
    const q = qualityForRank(rank);
    longNum += q;
    if (rank !== -1) {
      prefix_matches++;
      longMatched++;
      prefix_samples.push(prefixes[i]!);
    }
  }
  const shortRatio = shortIdx.length ? shortNum / shortIdx.length : 0;
  const longRatio = longIdx.length ? longNum / longIdx.length : 0;

  // Scoring.
  const SHORT_MAX = 40;
  const LONG_MAX = 10;
  let score: number;
  if (total_hints_for_keyword === 0 && !appears_in_own_hints && prefix_matches === 0) {
    score = 8;
  } else if (total_hints_for_keyword === 0 && prefix_matches === 0) {
    score = 12;
  } else {
    let base = 0;
    if (total_hints_for_keyword >= 1) base += 8;
    if (total_hints_for_keyword >= 5) base += 8;
    if (appears_in_own_hints) base += 8;
    const shortScore = shortRatio * SHORT_MAX;
    const longScore = longRatio * LONG_MAX;
    score = base + shortScore + longScore;

    // Compact mainstream boost: the keyword is the EXACT #1 suggestion in
    // its own hints AND it's a short word (≤10 chars). This catches
    // single-word viral terms like "tiktok", "instagram" whose short
    // prefixes may not put them at rank 0 due to alphabetical neighbors.
    if (own_exact_top && kwLower.length <= 10) {
      score += 20;
    }

    // Niche-real boost: strong own-hints + long prefixes complete the
    // keyword, but short prefixes DON'T surface it. Distinguishes
    // "tip tracker" (real niche) from "cigar log" (dead) without
    // rewarding it as much as a short-prefix viral match.
    if (
      appears_in_own_hints &&
      total_hints_for_keyword >= 5 &&
      longMatched >= 2 &&
      shortScore < 10
    ) {
      score += 12;
    }
  }

  return {
    score: Math.round(clamp(score, 1, 95)),
    evidence: {
      appears_in_own_hints,
      prefix_matches,
      prefix_samples,
      total_hints_for_keyword,
    },
  };
}
