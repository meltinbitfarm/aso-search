/**
 * Cache behavior tests. Hits live Apple endpoints for the first call.
 * Skip in CI with SKIP_INTEGRATION=1.
 */
import { describe, expect, test } from "vitest";
import { checkOne } from "../src/server/tools/keywordCheck.js";
import { cache, cacheKey } from "../src/server/cache.js";

const SKIP = process.env.SKIP_INTEGRATION === "1";
const d = SKIP ? describe.skip : describe;

d("cache", () => {
  test("second call hits cache (< 50ms)", async () => {
    const key = cacheKey(["kw", "tip tracker", "us", "app_store"]);
    cache.delete(key);

    const t0 = performance.now();
    const r1 = await checkOne("tip tracker", "us", "app_store");
    const firstMs = performance.now() - t0;

    const t1 = performance.now();
    const r2 = await checkOne("tip tracker", "us", "app_store");
    const secondMs = performance.now() - t1;

    // Sanity: first call definitely hit network
    expect(firstMs).toBeGreaterThan(50);
    // Cache hit should be near-instant
    expect(secondMs).toBeLessThan(50);
    // Same result shape
    expect(r1.keyword).toBe(r2.keyword);
    expect(r1.popularity).toBe(r2.popularity);
  }, 60_000);
});

describe("cacheKey (pure)", () => {
  test("deterministic for same input", () => {
    expect(cacheKey(["kw", "test", "us", "app_store"])).toBe(
      cacheKey(["kw", "test", "us", "app_store"]),
    );
  });

  test("differs on input change", () => {
    expect(cacheKey(["kw", "a", "us", "app_store"])).not.toBe(
      cacheKey(["kw", "b", "us", "app_store"]),
    );
    expect(cacheKey(["kw", "x", "us", "app_store"])).not.toBe(
      cacheKey(["kw", "x", "gb", "app_store"]),
    );
  });

  test("skips undefined parts", () => {
    expect(cacheKey(["kw", "x", undefined, "app_store"])).toBe(
      "kw:x:app_store",
    );
  });
});
