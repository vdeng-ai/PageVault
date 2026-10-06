# Operations and Free-tier Guardrails

PageVault is designed for personal use with a deliberately small operational surface.

Cloudflare mode uses:

```text
Worker + Workers Static Assets
          |
        D1 + private R2
          |
      1 daily Cron
```

Docker mode uses Node.js, SQLite, and the local filesystem. Neither mode requires queues, Durable Objects, Redis, PostgreSQL, a search service, or a background worker fleet.

## Health and readiness

PageVault exposes two unauthenticated, non-cached probe endpoints on the admin hostname and on local loopback for container probes. They are not exposed on the public sharing hostname:

- `GET /healthz` — process/Worker liveness only. It does not touch D1, SQLite, R2, or local object storage.
- `GET /readyz` — lightweight database readiness. It executes a minimal database query and does not access R2/local object storage.

Both endpoints also support `HEAD`.

Docker's built-in `HEALTHCHECK` uses `/readyz`. Keeping R2 out of readiness avoids creating storage operations simply because a container or external monitor is polling health.

## Free-tier operating rules

The repository enforces the following architectural constraints in CI:

- exactly one scheduled Cloudflare Cron;
- one D1 binding;
- one R2 binding;
- no Queue binding;
- no Durable Object binding;
- no Workflows binding;
- Docker runs as a non-root UID;
- Docker must expose a readiness health check;
- migration/startup errors must not be suppressed.

Runtime behavior is also intentionally bounded:

- reconciliation defaults to 100 metadata rows and 100 storage objects per daily pass;
- reconciliation pages are capped at 500 per direction;
- public access counting defaults to windowed batching rather than one D1 write per page view;
- uploads default to a 10 MiB PageVault limit;
- no Office conversion, OCR, video processing, server-side screenshots, or image-rendering pipeline.

These are project guardrails, not a promise that a particular Cloudflare account can never exceed a provider quota. Operators should still review account usage if the instance becomes unusually busy.

## Docker data ownership

The production image runs as UID/GID `10001:10001`.

The image owns its built-in `/data/pagevault` directory, but a host bind mount replaces those image permissions. Before the first Compose start, create the host directory with matching ownership:

```bash
sudo install -d -o 10001 -g 10001 /data/pagevault
```

If an existing installation already has data:

```bash
sudo chown -R 10001:10001 /data/pagevault
```

Do not make the data directory world-writable.

## Graceful shutdown and SQLite

Docker Compose gives PageVault a 15-second stop grace period. On `SIGTERM` or `SIGINT`, the Node runtime:

1. stops accepting new HTTP connections;
2. stops the daily maintenance timer;
3. waits for the HTTP server to close;
4. runs a WAL checkpoint;
5. closes SQLite.

SQLite runs with:

- WAL journal mode;
- `synchronous=NORMAL`;
- a 5-second busy timeout;
- automatic WAL checkpointing.

This keeps the single-user Docker deployment responsive without introducing another database service.

## Backup

For the clearest point-in-time backup, stop the container first so the graceful shutdown path checkpoints SQLite:

```bash
docker compose -f docker/docker-compose.yml stop pagevault

sudo tar -C /data \
  -czf "pagevault-backup-$(date +%Y%m%d-%H%M%S).tar.gz" \
  pagevault

docker compose -f docker/docker-compose.yml start pagevault
```

The archive must contain both:

```text
pagevault/pagevault.sqlite
pagevault/objects/
```

Do not back up only the SQLite file or only the object directory.

## Restore verification

Always test a backup before depending on it.

A simple isolated restore procedure is:

```bash
mkdir -p /tmp/pagevault-restore-test
tar -xzf pagevault-backup-YYYYMMDD-HHMMSS.tar.gz \
  -C /tmp/pagevault-restore-test

sudo chown -R 10001:10001 \
  /tmp/pagevault-restore-test/pagevault
```

Then mount the restored `pagevault` directory into a temporary PageVault container using different host ports and test:

- `/readyz`;
- administrator login;
- one existing item's share URL;
- that item's `/raw/:slug` content;
- a reconciliation dry run.

The repository CI also performs a local backup/restore smoke test: it checkpoints SQLite, copies the complete data directory, reopens the copied database, and verifies that both metadata and stored object bytes remain readable.

## Migration failure behavior

Node migrations run before the HTTP server begins listening. A migration or SQLite initialization failure terminates startup.

The Docker entrypoint intentionally does not hide migration errors. There is no `|| true` fallback. CI also starts a container with an intentionally invalid SQLite path and requires it to fail closed.

Cloudflare D1 migrations remain an explicit deployment operation:

```bash
pnpm wrangler d1 migrations apply pagevault-db --remote
```

Apply pending migrations before deploying application code that depends on them.

## Operational checks after an upgrade

After upgrading either runtime, verify:

1. `/healthz` returns 200;
2. `/readyz` returns 200;
3. administrator login works;
4. one upload succeeds;
5. its `/p/:slug` and `/raw/:slug` URLs work;
6. a reconciliation dry run shows no unexpected missing/orphan objects.

Keep the previous backup until these checks pass.


## v1 release operations

PageVault v1 release preparation is validated by `pnpm run release:check`. The check requires all workspace package versions to match and requires a matching `CHANGELOG.md` section.

Published tags use `vMAJOR.MINOR.PATCH`. Pushing a release tag triggers the GitHub Release workflow, which reruns typecheck, lint, tests, build, and a Docker image build before creating the GitHub Release.

See [Releasing PageVault](./releasing.md) and [Upgrading PageVault](./upgrading.md).
