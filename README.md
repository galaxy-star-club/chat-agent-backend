# Agentic Chat backend

Independent Next.js REST backend. It provides local foundations, Clerk session-token authentication, a Prisma/PostgreSQL database foundation, and backend-owned shared contracts. No product domain tables, uploads, agent execution, or other external providers are implemented.

## Local setup

Use Node.js 24 and the pinned pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm exec prisma generate
pnpm dev
```

The backend listens on `http://localhost:3001`. The separate frontend uses port 3000. Run `pnpm check` for lint, strict typechecking and tests; `pnpm build` checks the production build. CI generates Prisma Client, runs both checks, and exports browser-safe contracts with `pnpm contracts:export` into an artifact. The backend owns the files in `src/contracts`; consumers use versioned snapshots rather than importing backend code.

## Shared contracts and request infrastructure

`src/contracts` contains strict Zod contracts for safe API errors and success envelopes, JSON values, ordered content blocks, run/message status, tool calls/results, trace metadata, and bounded opaque-cursor pagination. These are provider-neutral foundations only; concrete domain records, tool registry entries, provider schemas, and credit policy belong to later plans.

Configuration parsing is centralized in `src/lib/config.ts`. Controllers create validated request/trace identifiers and map unexpected failures through one safe error path. Structured error logs retain those identifiers while recursively redacting secret-bearing keys and error messages. The contract exporter uses an explicit browser-safe allowlist, refuses uncommitted contract sources, and records the backend revision plus a SHA-256 hash for every snapshot.

## Health and CORS

`GET /api/v1/health` returns:

```json
{"status":"ok","service":"agentic-chat-api","contractVersion":"1.0.0"}
```

The controller validates responses against the Zod contract. The endpoint reports process liveness and the API contract version. It does not probe future dependencies or establish product readiness. `HEAD` is bodyless; `OPTIONS` returns 204 and advertises GET, HEAD and OPTIONS with a 600-second preflight lifetime. Other supported HTTP methods return 405 with `Allow` and the typed `METHOD_NOT_ALLOWED` error.

Set `FRONTEND_ORIGINS` to a comma-separated list of exact canonical HTTP or HTTPS origins, such as `http://localhost:3000,https://frontend.example`. Whitespace around entries is allowed. Paths, trailing slashes, wildcards, user information, query strings, fragments and empty entries are rejected. Production requires an explicit nonempty value; development defaults to `http://localhost:3000` when unset. Invalid configuration returns safe `CONFIGURATION_ERROR` JSON with 503; an unlisted Origin returns `ORIGIN_NOT_ALLOWED` with 403 and no allow-origin header. Unexpected errors return safe `INTERNAL_ERROR` JSON with 500.

Every handled response has `Cache-Control: no-store`, `Vary: Origin`, and a freshly generated `x-request-id`; inbound IDs are ignored. JSON errors carry the same request ID. Allowed origins receive the exact allow-origin header and can read `x-request-id`. Credentials are not enabled. Requests without Origin can read public health; CORS is a browser policy, not authentication or authorization for future protected products.

The route delegates to the health controller, which adapts HTTP and calls a pure health service. Shared configuration, CORS and error helpers live in `src/lib`. ESLint keeps persistence and provider adapters out of routes and Next.js imports out of services. Future persistence must use table-specific repositories behind owning-domain services.

## Clerk authentication

Set `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in `.env.local` from the same Clerk application used by the frontend. The example file intentionally contains no credentials. Do not expose the secret key to the frontend or commit either real value.

`GET /api/v1/auth/session` is a minimal protected endpoint. Cross-origin clients must send the Clerk session token as `Authorization: Bearer <session-token>`. The server accepts session tokens only and asks Clerk to verify that the token's authorized party matches one of the exact, validated `FRONTEND_ORIGINS`. Cookie-only requests are not accepted. A successful response contains only `userId` and `sessionId`; missing or invalid authentication returns safe `AUTHENTICATION_REQUIRED` JSON with 401. The route uses the same request ID, CORS, no-store, error, controller and service conventions as health. Its preflight permits the `Authorization` header without enabling credentialed CORS.

The public `/api/v1/health` endpoint does not require Clerk configuration or authentication. Without real Clerk keys and a session token from the matching frontend application, local verification of the protected endpoint cannot succeed.

## PostgreSQL and Prisma

This repository contains only the database foundation and an empty committed baseline migration. Product tables belong to later approved plans.

Keep runtime and release credentials separate:

- `DATABASE_URL` is the Neon pooled connection string used by the running application. It is the only connection read by the Prisma client owner in `src/lib/database.server.ts`.
- `DIRECT_URL` is the Neon direct connection string used by the Prisma CLI for controlled migrations and manual backups. Application code must not read it.

Use separate Neon resources for each trust boundary: a development project/branch for local work, a preview project with disposable branches for previews, and a production project/branch that previews and development cannot reach. Give each environment only its own URLs. This repository does not create those projects, branches, credentials, or accounts.

After setting `DATABASE_URL`, `GET /api/v1/readiness/database` runs a parameter-free `SELECT 1`. Success returns only:

```json
{"status":"ready","dependency":"database","contractVersion":"1.0.0"}
```

The route uses the same exact-origin CORS, request ID, no-store, HEAD, OPTIONS, and safe JSON error behavior as health. Missing/invalid runtime configuration or an unreachable database returns 503 without exposing connection details. It is an explicit readiness check; the public process-liveness endpoint does not query the database.

### Migrations and release

Create and inspect migrations against a non-production direct URL, then commit the SQL under `prisma/migrations/`. Do not use `prisma db push` for managed environments and do not run development migration commands against production.

```sh
DIRECT_URL='postgresql://...' pnpm exec prisma migrate dev --name descriptive_name
git diff -- prisma/schema.prisma prisma/migrations
```

Production migration is release-only. The manual `Apply production database migrations` workflow is the sole provided production path: it requires the protected GitHub `production` environment, reads `DIRECT_URL` from that environment's secret, installs the locked dependencies, runs `prisma migrate deploy`, then verifies `prisma migrate status`. It has no push or pull-request trigger. It has not been run or externally verified because no GitHub repository, protected environment, Neon project, or secret is configured by this local plan.

### Rollback, fix-forward, and backups

Prefer a reviewed fix-forward migration. Prisma cannot automatically reverse arbitrary SQL, so never delete or rewrite a migration that reached a shared environment. If a migration is marked failed, diagnose the database first, then use `prisma migrate resolve --rolled-back <migration>` only when its changes were actually reverted, or `--applied` only when its intended changes are confirmed present. Follow with a committed corrective migration and `prisma migrate deploy` through the release workflow.

Before a risky release, make a logical backup with the direct URL and verify that the dump is nonempty. Keep backup files outside the repository and never commit credentials or dumps:

```sh
pg_dump --format=custom --no-owner --no-acl --dbname="$DIRECT_URL" --file=agentic-chat-YYYYMMDD.dump
pg_restore --list agentic-chat-YYYYMMDD.dump
```

Restore into a separate recovery project/branch first, validate it, and only then plan a controlled cutover; do not blindly restore over production. As of 2026-11-06, [Neon's Free plan announcement](https://neon.com/blog/neon-free-plan-1-gb-per-project) describes a six-hour Instant Restore window, while [Neon's snapshot guidance](https://neon.com/blog/three-ways-to-use-your-snapshots) describes scheduled snapshots as a paid-plan feature. Provider limits can change, so confirm the current Free plan and the actual project console before every release. A six-hour provider window is not a long-term backup policy; retain tested logical dumps in user-controlled storage without purchasing or enabling paid features.

## Future Vercel project setup

Nothing is deployed. When deployment is separately authorized, configure this repository as its own Vercel project using the Next.js preset, Node.js 24, `pnpm install --frozen-lockfile`, and `pnpm exec prisma generate && pnpm build`. Set `FRONTEND_ORIGINS` and the environment-specific pooled `DATABASE_URL` explicitly for each production or preview environment, then verify health, readiness and CORS. Keep `DIRECT_URL` out of the application deployment environment; it belongs only in the protected release workflow. Do not reuse unknown credentials or introduce paid services. The frontend remains a separate project.
