import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// eslint-config-next 16 ships native flat configs; wrapping them in
// FlatCompat makes ESLint crash on a circular config object.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Existing code predates these rules (typed-`any` debt and the React
    // Compiler checks added in eslint-plugin-react-hooks 7). Keep them visible
    // as warnings to burn down; correctness rules such as rules-of-hooks stay errors.
    // Same file scope as the Next config, which is where these plugins load.
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  {
    // CommonJS helper scripts load dependencies with require().
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  globalIgnores([
    ".next/**",
    ".glash/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
    "public/**",
    "whatsapp-bridge/**",
    "tsconfig.tsbuildinfo",
  ]),
]);

export default eslintConfig;
