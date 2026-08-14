import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

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
  /**
   * The rules-of-hooks check is not style enforcement here, it caught a real
   * outage: a hook added below an early return crashed the whole tree the
   * instant the player won, so a completed fight produced no relic and the
   * forge never started. A linter finds that in a second; playing the game to
   * find it costs a fight.
   */
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
