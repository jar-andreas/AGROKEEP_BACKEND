import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist", "node_modules"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
      },
    },
    rules: {
      // TypeScript's own checker already catches undefined identifiers, and
      // does it correctly for TS-only syntax (types, generics, etc.) where
      // base ESLint's no-undef produces false positives.
      "no-undef": "off",

      // `_`-prefixed args/vars are the existing convention in this codebase
      // for intentionally unused parameters (e.g. `_req` on handlers that
      // don't need the request).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // This codebase uses `any` pragmatically in a few places (lean() query
      // results, transaction-scoped variables) — flagging it would bury real
      // issues under a pile of pre-existing, intentional ones. Revisit once
      // the codebase is ready to tighten this.
      "@typescript-eslint/no-explicit-any": "off",

      // `declare global { namespace Express { ... } }` is the only way
      // TypeScript lets you augment an existing global namespace (used here
      // for req.requestTime/req.rawBody) — there's no ES-module equivalent.
      "@typescript-eslint/no-namespace": "off",

      // Express's own types default unused generic slots on Request<> to
      // `{}` (e.g. Request<{}, {}, {}, Query>) — that's idiomatic Express
      // typing in this codebase, not a stray empty-object type.
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  eslintConfigPrettier,
);
