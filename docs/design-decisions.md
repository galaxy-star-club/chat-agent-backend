# Design decisions and trade-offs

## Modular monolith

The API is one Next.js deployment, with routes delegating to controllers,
services, and table-specific repositories. This keeps deployment and local
development simple while preserving clear boundaries for future extraction.

**Trade-off:** a single deploy shares its runtime and release cadence. It is a
better fit than microservices for the current project size.

## PostgreSQL is the source of truth

Chats, messages, attachments, tool activity, and agent runs are persisted in
PostgreSQL before the UI treats them as complete. The client refreshes active
runs rather than relying on an in-memory stream.

**Trade-off:** refresh-based updates are less immediate than token streaming,
but survive refreshes, worker retries, and browser disconnects.

## Durable admission before execution

Sending a message creates the user message and one `AgentRun` transactionally.
An idempotency key lets a client retry safely; one active run is permitted per
chat to prevent duplicated replies and conflicting tool work.

**Trade-off:** a second message is rejected until the active run finishes,
rather than being silently queued.

## Trigger.dev with a fallback

When a deployed Trigger.dev worker is configured, it executes the durable run.
If dispatch is deliberately disabled or unavailable, the API retains a safe
inline fallback so a user is not left with a permanently pending run.

**Trade-off:** the fallback is constrained by the Vercel request lifetime and
is not a substitute for a deployed worker. A local `trigger dev` worker is
appropriate for development only.

## Provider and model policy

The execution loop accepts only OpenRouter's `openrouter/free` route. Model
failures, including rate limits, are persisted as run failures and shown to the
user; no paid model is selected as a hidden fallback.

**Trade-off:** availability is lower during free-model rate limits, in exchange
for predictable zero-cost model usage.

## Authentication and browser access

Clerk bearer tokens authenticate the API. CORS permits only explicitly listed
frontend origins, and every owned resource is queried with the authenticated
user ID.

**Trade-off:** each new frontend origin must be added deliberately, which avoids
accidentally exposing authenticated endpoints to arbitrary websites.

## What I would improve with more time

- Replace refresh polling with resumable streaming backed by durable run state.
- Add a deployed Trigger.dev production worker, retry visibility, and alerts.
- Generate the OpenAPI document from the Zod contracts to eliminate manual
  documentation drift.
- Add contract and end-to-end coverage for the hosted deployment, uploads, and
  failure/retry paths.
- Add observability dashboards for run latency, tool failures, and free-model
  rate-limit errors.
