import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// Responsibility limits — the structural gate that keeps this rebuild from
// growing a god component. `npm run build` runs lint first; a violation
// blocks the build. When a file grows past a limit, extract — never raise
// the cap. See docs/rebuild-plan.md "Structural guardrails".

export default [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "project/**", "supabase/**"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" }
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["warn", { max: 200, skipBlankLines: true, skipComments: true }],
      "max-depth": ["error", 4],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn"
    }
  },
  {
    files: ["src/**/*.test.ts"],
    rules: { "max-lines": "off", "max-lines-per-function": "off" }
  }
];
