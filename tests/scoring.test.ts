import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AnalyzeResult } from "../src/lib/aso/types.js";

// Mock itunesHintsDetailed so popularity() is tested as a pure scoring function.
vi.mock("../src/lib/aso/itunes.js", async () => {
  const actual =
    await vi.importActual<typeof import("../src/lib/aso/itunes.js")>(
      "../src/lib/aso/itunes.js",
    );
  return { ...actual, itunesHintsDetailed: vi.fn() };
});

import {
  buildPrefixes,
  competitionHeat,
  difficulty,
  popularity,
} from "../src/lib/aso/scoring.js";
import { itunesHintsDetailed } from "../src/lib/aso/itunes.js";

const mockedHints = vi.mocked(itunesHintsDetailed);

function mkResult(overrides: Partial<AnalyzeResult> = {}): AnalyzeResult {
  return {
    keyword: "x",
    totalApps: 10,
    validApps: 8,
    zombies: 0,
    stale: 0,
    avgReviews: 100,
    medianReviews: 50,
    maxReviews: 500,
    avgRating: "4.0",
    avgAgeDays: 90,
    nameMatches: 2,
    top10exact: 0,
    top10strong: 0,
    paidApps: 0,
    freeRatio: "100",
    distribution: { monsters: 0, strong: 0, medium: 0, weak: 0, zombies: 0 },
    opportunity: 50,
    scores: {
      competition: 80,
      strength: 80,
      quality: 70,
      freshness: 70,
      saturation: 70,
      zombie: 0,
      top10gap: 100,
      top10density: 100,
    },
    relatedKeywords: [],
    apps: [],
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// Helper: build 10 detailed hints with a given term at given rank.
function hintsWithKwAt(
  kw: string,
  rank: number,
  total = 10,
): { term: string; rank: number }[] {
  const out: { term: string; rank: number }[] = [];
  for (let i = 0; i < total; i++) {
    if (i === rank) out.push({ term: kw, rank: i });
    else out.push({ term: `other ${i}`, rank: i });
  }
  return out;
}

describe("competitionHeat (renamed from old popularity — regression guard)", () => {
  test("high totalApps + high avgReviews → > 70", () => {
    const r = mkResult({ totalApps: 50, avgReviews: 50_000, maxReviews: 500_000 });
    expect(competitionHeat(r)).toBeGreaterThan(70);
  });

  test("low totalApps + low reviews → < 30", () => {
    const r = mkResult({ totalApps: 5, avgReviews: 10, maxReviews: 20 });
    expect(competitionHeat(r)).toBeLessThan(30);
  });

  test("deterministic formula (regression): expected exact values", () => {
    const r1 = mkResult({ totalApps: 50, avgReviews: 10_000, maxReviews: 100_000 });
    expect(competitionHeat(r1)).toBe(88);
    const r2 = mkResult({ totalApps: 10, avgReviews: 100, maxReviews: 1_000 });
    expect(competitionHeat(r2)).toBe(36);
  });
});

describe("difficulty", () => {
  test("many monsters → > 70", () => {
    const r = mkResult({
      distribution: { monsters: 5, strong: 3, medium: 0, weak: 0, zombies: 0 },
      scores: {
        competition: 0,
        strength: 10,
        quality: 50,
        freshness: 50,
        saturation: 50,
        zombie: 0,
        top10gap: 50,
        top10density: 30,
      },
    });
    expect(difficulty(r)).toBeGreaterThan(70);
  });

  test("empty distribution + weak signals → < 30", () => {
    const r = mkResult({
      distribution: { monsters: 0, strong: 0, medium: 0, weak: 0, zombies: 0 },
      scores: {
        competition: 100,
        strength: 90,
        quality: 50,
        freshness: 50,
        saturation: 50,
        zombie: 0,
        top10gap: 100,
        top10density: 100,
      },
    });
    expect(difficulty(r)).toBeLessThan(30);
  });

  test("always clamped 1-100", () => {
    const insane = mkResult({
      distribution: { monsters: 100, strong: 100, medium: 0, weak: 0, zombies: 0 },
      scores: {
        competition: 0,
        strength: 0,
        quality: 0,
        freshness: 0,
        saturation: 0,
        zombie: 0,
        top10gap: 0,
        top10density: 0,
      },
    });
    const s = difficulty(insane);
    expect(s).toBeGreaterThanOrEqual(1);
    expect(s).toBeLessThanOrEqual(100);
  });
});

describe("popularity (autosuggest-based, rank-weighted)", () => {
  beforeEach(() => {
    mockedHints.mockReset();
  });

  test("rank 0 everywhere (own + every prefix) → >= 80", async () => {
    mockedHints.mockImplementation(async (term: string) => {
      // The keyword always comes back at rank 0, 10 hints total.
      return hintsWithKwAt("foobarz", 0, 10);
    });
    const { score, evidence } = await popularity("foobarz", "us");
    expect(score).toBeGreaterThanOrEqual(80);
    expect(evidence.appears_in_own_hints).toBe(true);
    expect(evidence.own_hints_rank).toBe(0);
    expect(evidence.total_hints_for_keyword).toBe(10);
    expect(evidence.prefix_matches).toBeGreaterThanOrEqual(3);
  });

  test("empty hints everywhere → 5 (dead-niche fallback)", async () => {
    mockedHints.mockImplementation(async () => []);
    const { score, evidence } = await popularity("supernichetopicxyz", "us");
    expect(score).toBe(5);
    expect(evidence.total_hints_for_keyword).toBe(0);
    expect(evidence.prefix_matches).toBe(0);
    expect(evidence.appears_in_own_hints).toBe(false);
    expect(evidence.own_hints_rank).toBe(-1);
  });

  test("own hints present but keyword at rank 3 in only half the prefixes → 20-50", async () => {
    mockedHints.mockImplementation(async (term: string) => {
      if (term === "midnichekw") {
        // Own hints: kw at rank 3 (mid), 8 total.
        return hintsWithKwAt("midnichekw", 3, 8);
      }
      // Only mid-length prefixes return the keyword at rank 2.
      if (term.length >= 7 && term.length <= 9) {
        return hintsWithKwAt("midnichekw", 2, 10);
      }
      return [
        { term: "random1", rank: 0 },
        { term: "random2", rank: 1 },
      ];
    });
    const { score, evidence } = await popularity("midnichekw", "us");
    expect(score).toBeGreaterThanOrEqual(20);
    expect(score).toBeLessThanOrEqual(50);
    expect(evidence.prefix_matches).toBeGreaterThanOrEqual(1);
  });

  test("short keyword (<4 chars) → neutral 50 + short_keyword flag", async () => {
    mockedHints.mockImplementation(async () => []);
    const { score, evidence } = await popularity("ai", "us");
    expect(score).toBe(50);
    expect(evidence.short_keyword).toBe(true);
  });

  test("itunesHintsDetailed throwing propagates (Promise.all rejects)", async () => {
    mockedHints.mockImplementation(async () => {
      throw new Error("simulated network failure");
    });
    await expect(popularity("somekeyword", "us")).rejects.toThrow();
  });

  test("evidence carries new rank signals", async () => {
    mockedHints.mockImplementation(async (term: string) => {
      if (term === "demotopic") return hintsWithKwAt("demotopic", 1, 10);
      return hintsWithKwAt("demotopic", 4, 10);
    });
    const { evidence } = await popularity("demotopic", "us");
    expect(evidence.own_hints_rank).toBe(1);
    expect(evidence.prefix_ranks_avg).toBeGreaterThan(0);
  });
});

describe("buildPrefixes", () => {
  test("very short keyword → []", () => {
    expect(buildPrefixes("")).toEqual([]);
    expect(buildPrefixes("a")).toEqual([]);
    expect(buildPrefixes("ab")).toEqual([]);
  });

  test("mid keyword → up to 5 prefixes, deduped, start at 3 chars", () => {
    const p = buildPrefixes("instagram");
    expect(p.length).toBeGreaterThan(0);
    expect(p.length).toBeLessThanOrEqual(5);
    expect(p[0]!.length).toBeLessThanOrEqual(4);
    expect(p.at(-1)!.length).toBeLessThan("instagram".length);
    expect(new Set(p).size).toBe(p.length);
  });

  test("length is deterministic for the same keyword", () => {
    expect(buildPrefixes("lucid dreaming")).toEqual(
      buildPrefixes("lucid dreaming"),
    );
  });
});
