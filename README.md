# Agentic Chat backend

Next.js REST API for Agentic Chat. It authenticates Clerk users and stores chats and durable agent runs in PostgreSQL/Prisma.

## Run locally

Requires Node.js 24 and pnpm 10.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm exec prisma generate
pnpm dev
```

The API runs at `http://localhost:3001`. Set the required values in `.env`:

- `FRONTEND_ORIGINS=http://localhost:3000`
- Clerk keys
- Neon `DATABASE_URL`
- `OPENROUTER_API_KEY` (only `openrouter/free` is accepted)
- `TRIGGER_SECRET_KEY` for `pnpm dev:trigger`

Useful commands:

```sh
pnpm check
pnpm build
pnpm dev:trigger
```

## Structure

```text
src/app/api/v1/       Next.js route handlers
src/modules/          controllers, services, repositories, execution
src/contracts/        backend-owned Zod API contracts
src/lib/              config, Prisma, CORS, auth, errors
prisma/               schema and committed migrations
trigger/              Trigger.dev task entry points
```

## System design

```text
Frontend → REST route → controller → service → table repository → PostgreSQL
                         │
                         └→ durable AgentRun → OpenRouter free model
                                                │
Frontend ← refreshed persisted messages ← assistant drafts
```

- Clerk bearer tokens identify the user; every chat, run, message, and attachment is ownership scoped.
- A message admission transaction creates the user message and one active durable `AgentRun` per chat.
- The execution loop calls only `openrouter/free`, records tool activity and messages, and persists drafts for recovery.
- The frontend refreshes persisted messages while an active run produces drafts. Stored messages are the source of truth.
- `AGENT_MAX_TURNS` accepts `1`–`8`; the default is `8`.

Use pooled `DATABASE_URL` at runtime. `DIRECT_URL` is only for migrations and must not be placed in the Vercel runtime environment.

`trigger dev` runs a local worker in Trigger.dev's Development environment. Production requires a separately deployed Trigger worker and its own Trigger.dev environment variables; a Vercel deployment does not deploy that worker.
