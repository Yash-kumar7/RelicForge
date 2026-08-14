import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Flat config (ESLint 9+). Deliberately close to the recommended sets — the
 * type checker is already strict, so lint is here for the things tsc does not
 * catch rather than for style debates.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/storage/**",
      "**/cache/**",
      "apps/web/dist/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Deliberate fire-and-forget calls exist in the pipeline; the void
      // operator marks them explicitly, which is enough.
      "@typescript-eslint/no-floating-promises": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
