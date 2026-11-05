# Agentic Chat backend

Independent Next.js REST backend. Plan 01 provides local foundations and a public health endpoint; no product UI, authentication, database, uploads, agent execution, or external providers are implemented.

## Local setup

Use Node.js 24 and the pinned pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

The backend listens on `http://localhost:3001`. The separate frontend uses port 3000. Run `pnpm check` for lint, strict typechecking and tests; `pnpm build` checks the production build. CI runs both and exports browser-safe contracts with `pnpm contracts:export` into an artifact. The backend owns `src/contracts/health.ts`; consumers use its versioned snapshot rather than importing backend code.

## Health and CORS

`GET /api/v1/health` returns:

```json
{"status":"ok","service":"agentic-chat-api","contractVersion":"1.0.0"}
```

The controller validates responses against the Zod contract. The endpoint reports process liveness and the API contract version. It does not probe future dependencies or establish product readiness. `HEAD` is bodyless; `OPTIONS` returns 204 and advertises GET, HEAD and OPTIONS with a 600-second preflight lifetime. Other supported HTTP methods return 405 with `Allow` and the typed `METHOD_NOT_ALLOWED` error.

Set `FRONTEND_ORIGINS` to a comma-separated list of exact canonical HTTP or HTTPS origins, such as `http://localhost:3000,https://frontend.example`. Whitespace around entries is allowed. Paths, trailing slashes, wildcards, user information, query strings, fragments and empty entries are rejected. Production requires an explicit nonempty value; development defaults to `http://localhost:3000` when unset. Invalid configuration returns safe `CONFIGURATION_ERROR` JSON with 503; an unlisted Origin returns `ORIGIN_NOT_ALLOWED` with 403 and no allow-origin header. Unexpected errors return safe `INTERNAL_ERROR` JSON with 500.

Every handled response has `Cache-Control: no-store`, `Vary: Origin`, and a freshly generated `x-request-id`; inbound IDs are ignored. JSON errors carry the same request ID. Allowed origins receive the exact allow-origin header and can read `x-request-id`. Credentials are not enabled. Requests without Origin can read public health; CORS is a browser policy, not authentication or authorization for future protected products.

The route delegates to the health controller, which adapts HTTP and calls a pure health service. Shared configuration, CORS and error helpers live in `src/lib`. ESLint keeps persistence and provider adapters out of routes and Next.js imports out of services. Future persistence must use table-specific repositories behind owning-domain services.

## Future Vercel project setup

Nothing is deployed. When deployment is separately authorized, configure this repository as its own Vercel project using the Next.js preset, Node.js 24, `pnpm install --frozen-lockfile`, and `pnpm build`. Set `FRONTEND_ORIGINS` explicitly for each production or preview environment to its actual frontend origin(s), then verify health and CORS against those origins. Do not reuse unknown credentials or introduce paid services. The frontend remains a separate project.
