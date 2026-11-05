import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const databaseClients = {
  group: ["@prisma/*", "prisma", "pg", "postgres", "**/prisma", "**/prisma/**", "**/db", "**/db/**", "**/database", "**/database/**"],
  message: "Database clients belong in table-specific repositories.",
};
const persistenceAndProviders = [
  databaseClients,
  { group: ["**/repositories/**", "**/*.repository", "**/*.repository.ts", "**/providers/**", "**/*.provider", "**/*.provider.ts"], message: "Use the owning domain service; persistence and providers stay behind services." },
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
    files: ["src/modules/**/*.controller.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: persistenceAndProviders }],
      "no-restricted-globals": ["error", { name: "fetch", message: "Controllers delegate external calls to services and provider adapters." }],
    },
  },
  {
    files: ["src/modules/**/*.service.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [
      databaseClients,
      { group: ["next", "next/**", "**/*.controller", "**/*.controller.ts"], message: "Services remain independent of HTTP controllers and Next.js." },
    ] }] },
  },
]);
