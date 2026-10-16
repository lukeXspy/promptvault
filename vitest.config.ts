import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Integration tests spawn the real CLI (node + tsx) several times each;
    // with test files running in parallel, the 5s default produced
    // load-dependent timeouts (Stage 11). Assertions decide failures - a
    // genuinely hung test still fails, just at 30s.
    testTimeout: 30000,
  },
});
