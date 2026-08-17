import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      // Keep the scaffold lint-clean without over-constraining later cycles.
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
