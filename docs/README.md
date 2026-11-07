# API documentation

This directory holds Mintlify's content. `../docs.json` is the repository-root
configuration Mintlify discovers during onboarding, and `openapi.yaml`
describes the public REST API.

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
