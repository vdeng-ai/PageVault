import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "apps/admin/dist",
      "apps/worker/dist",
      "apps/worker/src/worker-configuration.d.ts",
      "packages/core/dist",
      "dist",
      "node_modules",
      "coverage",
      ".wrangler"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "@typescript-eslint/require-await": "off"
    }
  },
  {
    files: ["*.js"],
    extends: [tseslint.configs.disableTypeChecked]
  }
);
