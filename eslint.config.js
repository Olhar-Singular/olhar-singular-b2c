import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import localRules from "./eslint-local-rules/no-sync-effect.js";

export default tseslint.config(
  { ignores: ["dist", "supabase/functions", "eslint-local-rules"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      local: localRules,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "no-useless-escape": "off",
      "no-control-regex": "off",
      "no-case-declarations": "off",
      "no-constant-binary-expression": "off",
      "local/no-sync-effect": "error",
    },
  },
  {
    files: [
      "src/test/**/*.{ts,tsx}",
      "**/*.test.{ts,tsx}",
      "src/components/ui/**/*.{ts,tsx}",
    ],
    rules: {
      "local/no-sync-effect": "off",
    },
  },
);
