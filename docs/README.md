# API documentation

This directory is a Mintlify documentation site. `openapi.yaml` describes the
public REST API, and `mint.json` generates its interactive API reference.

## Preview locally

```sh
npx mintlify dev
```

Run that command from this directory. Validate the API contract with:

```sh
npx mintlify openapi-check openapi.yaml
```

## Publish

Connect the `backend` repository to Mintlify, selecting `docs` as the docs
directory. Mintlify deploys a public `*.mintlify.app` URL from the connected
branch. The exact URL is shown in the Mintlify project overview after the first
deployment.

Do not expose a Clerk secret or an OpenRouter key in the API playground.
