import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const persistenceAndProviders = [
  { group: ["**/repositories/**", "**/providers/**", "@prisma/*", "prisma", "pg", "postgres"], message: "Use the owning domain service; persistence and providers stay behind services." },
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "dist/**", "next-env.d.ts"]),
  {
    files: ["src/app/**/route.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        ...persistenceAndProviders,
        { group: ["**/*.service", "**/*.service.ts", "@/lib/**"], message: "Routes delegate to controllers." },
      ] }],
      "no-restricted-globals": ["error", { name: "fetch", message: "Routes delegate external calls to services and provider adapters." }],
    },
  },
  {
    files: ["src/modules/**/*.service.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [
      { group: ["next", "next/**", "**/*.controller", "**/*.controller.ts"], message: "Services remain independent of HTTP controllers and Next.js." },
    ] }] },
  },
]);
