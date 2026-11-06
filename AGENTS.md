<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Agentic Chat backend

- Current authorization: Plan 04 shared contracts and request infrastructure are complete. No product tables, agent runtime, uploads, provider calls, publication or deployment yet. Do not start Plan 05 without permission.
- Next.js Route Handlers are mandatory. No NestJS or additional HTTP framework.
- HTTP route -> controller -> service -> table-specific repository when persistence exists. A health endpoint needs no fake repository or database.
- Route handlers contain delegation only. Controllers adapt HTTP and validate boundaries. Services own use-case logic and remain independent of Next HTTP types.
- Future central `repositories` files own one table each; Prisma queries must stay there. Only owning-domain services use those repositories; other domains call exported services.
- External network calls belong in typed provider adapters. Durable tasks reuse services directly, not internal HTTP calls.
- Keep the modular monolith and PostgreSQL integrity. Do not introduce separate databases, brokers or internal network hops to imitate microservices.
- Zod contracts are authoritative. Export browser-safe snapshots; no secrets, ORM internals or skill bodies in those artifacts.
- Centralize environment validation, errors, trace context and redaction. Exact CORS origins only; never reflect arbitrary origins or use wildcard credentialed CORS.
- Apply Ponytail: reuse existing helpers, small complete changes, no speculative factories/base repositories, preserve security and failure handling.
- Later execution must use only `openrouter/free` with no paid fallback. Required Magica success paths are never stubbed.
- Future credits, dispatch, tools and approvals need transactional idempotency and durable recovery. Tools do not mutate conversation state.
- Subagents use fresh briefs and isolated worktrees. Coordinator owns migrations, generated artifacts, dependency manifests and lockfiles.
- Run lint, strict typechecking and meaningful tests; build before handoff. Stop after the approved plan.
