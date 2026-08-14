import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@relic/core": fileURLToPath(
        new URL("./packages/relic-core/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: [
      "packages/*/test/**/*.test.ts",
      "apps/*/test/**/*.test.ts",
    ],
    environment: "node",
  },
});
