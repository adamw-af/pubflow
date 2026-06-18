import { defineConfig } from "vitest/config";

// convex-test runs functions in an edge-like runtime; see
// convex/_generated/ai/guidelines.md (Testing guidelines).
export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["convex/**/*.test.ts"],
  },
});
