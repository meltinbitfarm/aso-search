import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 10_000,
    // Integration tests hit live Apple endpoints; keep them serial-ish to
    // avoid tripping rate limits.
    fileParallelism: false,
  },
});
