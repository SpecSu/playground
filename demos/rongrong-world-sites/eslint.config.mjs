import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";
const gameFiles=["src/**/*.{ts,tsx}","server/**/*.{ts,tsx}","tests/**/*.{ts,tsx}"];
// The imported Three.js/Vite gameplay retains its upstream TypeScript lint policy.
// Next-specific rules remain active for the Sites shell, API and adapters.
const shellOnly=config=>({...config,ignores:[...(config.ignores??[]),"src/**","server/**","tests/**"]});

const eslintConfig = defineConfig([
  ...nextVitals.map(shellOnly),
  ...nextTs.map(shellOnly),
  ...tseslint.configs.recommended.map(config=>({...config,files:gameFiles})),
  {files:gameFiles,rules:{"@typescript-eslint/no-unused-vars":["error",{argsIgnorePattern:"^_",varsIgnorePattern:"^_"}]}},
  globalIgnores([
    "dist/**",
    ".vinext/**",
    ".wrangler/**",
    ".sites-runtime/**",
    "outputs/**",
    "work/**",
  ]),
  {
    files: ["components/ui/**/*.{ts,tsx}", "hooks/use-mobile.ts"],
    rules: {
      // These files are vendored verbatim from shadcn@4.17.0. Keep the
      // registry source intact while applying the stricter rules to Site code.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
