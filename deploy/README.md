# Deploy — environments

Pace runs many environments (prod, staging, one per open PR) from **one template
and one set of images**. An environment is just a *value-set* — a generated
`.env` — plugged into that template. This directory is that machinery.

## Layout

```
deploy/
  platform/          # run ONCE per box
    docker-compose.yml   # Traefik (shared edge) + Postgres (shared server)
    traefik/             # static + TLS config (wildcard Cloudflare Origin cert)
  stack/             # run PER environment
    docker-compose.yml   # api + powersync + web, fully parameterized
    env.template         # every variable an env needs (documentation)
  bin/
    render-env.sh        # env name  → derives values → writes envs/<env>.env
    up.sh                # render → create DBs → migrate → compose up
    down.sh              # compose down -v → drop DBs
  envs/              # generated per-env .env files (gitignored — secrets)
  docker-compose.yml # LEGACY single-env stack (current prod; superseded)
```

Images (built once, used by every env): `Dockerfile` → web, `Dockerfile.api` →
api (which also has a `migrate` target the scripts use for drizzle migrations).

## The model

- **One Traefik** routes every environment by container labels. Each env is one
  hostname with path-based routing: `/` → web, `/api` → api, `/powersync` →
  powersync. One hostname per env keeps it under the wildcard cert.
- **One Postgres server** holds a database per env (`pace_<env>` +
  `powersync_<env>`) — the "shared Postgres" resource strategy, so many previews
  fit on a small box.
- **One web image** serves every env: it reads its API/PowerSync URLs at runtime
  from container env (`API_URL` / `POWERSYNC_URL` → injected as
  `window.__PACE_CONFIG__`), instead of baking them in at build time.
- Every per-env value is **derived from the env name** by `render-env.sh`;
  secrets (`POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`) come from the environment.

## Usage

```bash
# once per box:
docker compose -f deploy/platform/docker-compose.yml up -d

# per environment (idempotent — re-run on each push):
deploy/bin/up.sh staging
deploy/bin/up.sh pr-101

# tear an env down (on PR close):
deploy/bin/down.sh pr-101
```

`render-env.sh` alone (no Docker) prints an env file you can inspect:

```bash
BASE_DOMAIN=paceproductivity.app deploy/bin/render-env.sh pr-101
cat deploy/envs/pr-101.env
```

## Prerequisites (one-time, Cloudflare side)

- A **wildcard DNS** record `*.paceproductivity.app` → the server IP.
- A **wildcard Cloudflare Origin cert** (`*.paceproductivity.app` + apex),
  written to `deploy/certs/origin.pem` + `origin-key.pem` by CI.

## Status

Subtask 1 (this) builds the template + images + scripts. Wiring staging to
`main`, the PR-preview lifecycle workflow, and the prod cutover are the next
subtasks. The legacy `deploy/docker-compose.yml` still serves current prod until
that cutover.
