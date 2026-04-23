/**
 * Integration tests hitting Apple's live iTunes/autosuggest endpoints.
 * No auth, no API key. Skip in CI by setting env SKIP_INTEGRATION=1.
 */
import { describe, test, expect } from "vitest";
import {
  itunesHints,
  lookupItunes,
  searchItunes,
} from "../src/lib/aso/itunes.js";

const SKIP = process.env.SKIP_INTEGRATION === "1";
const d = SKIP ? describe.skip : describe;

d("searchItunes (live)", () => {
  test("returns apps for mainstream term", async () => {
    const apps = await searchItunes("instagram", "us", 10);
    expect(apps.length).toBeGreaterThanOrEqual(5);
    for (const a of apps) {
      expect(typeof a.trackId).toBe("number");
      expect(typeof a.trackName).toBe("string");
      expect(typeof a.artistName).toBe("string");
    }
  }, 15_000);

  test("returns empty for gibberish", async () => {
    const apps = await searchItunes("asdfghjklqwerty12345xyz", "us", 10);
    expect(apps.length).toBe(0);
  }, 15_000);
});

d("lookupItunes (live)", () => {
  test("returns Shape app for known id", async () => {
    const app = await lookupItunes("1577026266", "us");
    expect(app).not.toBeNull();
    expect(typeof app?.trackName).toBe("string");
    expect(app!.trackName.toLowerCase()).toMatch(/shape/);
  }, 15_000);

  test("returns null for non-existent id", async () => {
    const app = await lookupItunes("99999999999", "us");
    expect(app).toBeNull();
  }, 15_000);
});

d("itunesHints (live)", () => {
  test("returns non-empty array for common term", async () => {
    const hints = await itunesHints("tip", "us");
    expect(Array.isArray(hints)).toBe(true);
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.every((h) => typeof h === "string")).toBe(true);
  }, 15_000);

  test("returns array (possibly empty) for gibberish without throwing", async () => {
    const hints = await itunesHints("zzzzzqqqqqjjjjjxxxxx", "us");
    expect(Array.isArray(hints)).toBe(true);
  }, 15_000);

  test("5 parallel calls resolve without throwing (rate-limit sanity)", async () => {
    const terms = ["meditation", "workout", "sleep", "budget", "calendar"];
    const results = await Promise.all(terms.map((t) => itunesHints(t, "us")));
    expect(results.length).toBe(5);
    expect(results.every(Array.isArray)).toBe(true);
  }, 30_000);
});
