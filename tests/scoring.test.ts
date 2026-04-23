import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AnalyzeResult } from "../src/lib/aso/types.js";

// Mock itunesHints so popularity() is tested as a pure scoring function.
vi.mock("../src/lib/aso/itunes.js", async () => {
  const actual =
    await vi.importActual<typeof import("../src/lib/aso/itunes.js")>(
      "../src/lib/aso/itunes.js",
    );
  return { ...actual, itunesHints: vi.fn() };
});

import {
  buildPrefixes,
  competitionHeat,
  difficulty,
  popularity,
} from "../src/lib/aso/scoring.js";
import { itunesHints } from "../src/lib/aso/itunes.js";

const mockedHints = vi.mocked(itunesHints);

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
    // These exact values pin the old popularity formula so any drift is caught.
    // Old formula: 0.35*clamp(totalApps/50) + 0.40*clamp(log10(max(avgRev,1))/5) + 0.25*clamp(log10(max(maxRev,1))/6)
    // then round(1 + 99*raw).
    const r1 = mkResult({ totalApps: 50, avgReviews: 10_000, maxReviews: 100_000 });
    // raw = 0.35 * 1 + 0.4 * (4/5) + 0.25 * (5/6) = 0.35 + 0.32 + 0.2083 = 0.8783
    // score = round(1 + 99*0.8783) = round(87.95) = 88
    expect(competitionHeat(r1)).toBe(88);

    const r2 = mkResult({ totalApps: 10, avgReviews: 100, maxReviews: 1_000 });
    // raw = 0.35*0.2 + 0.4*0.4 + 0.25*0.5 = 0.07 + 0.16 + 0.125 = 0.355
    // score = round(1 + 35.145) = round(36.145) = 36
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

describe("popularity (autosuggest-based)", () => {
  beforeEach(() => {
    mockedHints.mockReset();
  });

  test("5+ prefix matches at rank 0 with full own hints → >= 80", async () => {
    // Every call returns the keyword at rank 0 with 10 hints total.
    mockedHints.mockImplementation(async () => [
      "foobarz",
      "foobarz pro",
      "foobarz lite",
      "foobarz plus",
      "foobarz x",
      "other 1",
      "other 2",
      "other 3",
      "other 4",
      "other 5",
    ]);
    const { score, evidence } = await popularity("foobarz", "us");
    expect(score).toBeGreaterThanOrEqual(80);
    expect(evidence.appears_in_own_hints).toBe(true);
    expect(evidence.total_hints_for_keyword).toBe(10);
    expect(evidence.prefix_matches).toBeGreaterThanOrEqual(3);
  });

  test("0 hints everywhere → <= 15 (dead niche)", async () => {
    mockedHints.mockImplementation(async () => []);
    const { score, evidence } = await popularity("supernichetopicxyz", "us");
    expect(score).toBeLessThanOrEqual(15);
    expect(evidence.total_hints_for_keyword).toBe(0);
    expect(evidence.prefix_matches).toBe(0);
    expect(evidence.appears_in_own_hints).toBe(false);
  });

  test("partial signal (2-3 prefix matches) → 40-65", async () => {
    // Own: 8 hints incl keyword at rank 2. Prefix calls: keyword present
    // only in the ~middle-length prefixes, missing on very short and
    // very long variants (simulates a real niche).
    mockedHints.mockImplementation(async (term: string) => {
      if (term === "midnichekw") {
        // own hints: keyword appears at rank 2
        return [
          "midnichefoo",
          "midnichebar",
          "midnichekw",
          "midnichex",
          "midnichey",
          "midnichez",
          "midnichea",
          "midnicheb",
        ];
      }
      // Short prefixes: no match. Middle: match. Long: match.
      if (term.length >= 7 && term.length <= 9) {
        return ["midnichekw", "midnichekw pro", "other"];
      }
      return ["random1", "random2"];
    });
    const { score, evidence } = await popularity("midnichekw", "us");
    expect(score).toBeGreaterThanOrEqual(40);
    expect(score).toBeLessThanOrEqual(65);
    expect(evidence.prefix_matches).toBeGreaterThanOrEqual(1);
    expect(evidence.prefix_matches).toBeLessThanOrEqual(4);
  });

  test("short keyword (<3 chars) → neutral 50 + short_keyword flag", async () => {
    mockedHints.mockImplementation(async () => []);
    const { score, evidence } = await popularity("ai", "us");
    expect(score).toBe(50);
    expect(evidence.short_keyword).toBe(true);
  });

  test("itunesHints throwing propagates (documents current behavior)", async () => {
    // The runtime itunesHints() swallows errors internally and returns [].
    // But if something in the call chain throws synchronously, Promise.all
    // will reject. This documents the contract: popularity does NOT
    // further wrap errors. Upstream callers handle them.
    mockedHints.mockImplementation(async () => {
      throw new Error("simulated network failure");
    });
    await expect(popularity("somekeyword", "us")).rejects.toThrow();
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
