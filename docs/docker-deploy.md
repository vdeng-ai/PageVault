# Docker Deploy

Docker mode runs the PageVault service with Node.js 22, SQLite, and local object storage. The same container handles an admin hostname and a public hostname, selecting the request path from the original `Host` header.

## Prerequisites

- Docker Engine with the Compose plugin.
- Two DNS hostnames pointing to the reverse proxy, for example:
  - `admin-html.example.com` for the administrator.
  - `h.example.com` for published files.
- TLS termination at the reverse proxy.
- A password hash and long random session secret:

  ```bash
  pnpm tsx scripts/hash-password.ts
  openssl rand -base64 32
  ```

## Prepare the Compose File

From a deployment checkout of this repository, make a private copy of the example:

```bash
cp docker/docker-compose.example.yml docker/docker-compose.yml
```

Replace every example hostname, email, password hash, and session secret in the copied file. Do not commit the filled file.

The important values are:

```yaml
APP_ENV: production
SQLITE_PATH: /data/pagevault/pagevault.sqlite
LOCAL_STORAGE_DIR: /data/pagevault/objects
ADMIN_BASE_URL: https://admin-html.example.com
PUBLIC_BASE_URL: https://h.example.com
ADMIN_EMAIL: admin@example.com
ADMIN_PASSWORD_HASH: replace-with-password-hash
SESSION_SECRET: replace-with-long-random-secret
DEFAULT_URL_EXPIRE_DAYS: "15"
DEFAULT_FILE_EXPIRE_DAYS: "30"
MAX_UPLOAD_SIZE_MB: "10"
PORT: "3000"
```

The example mounts `/data/pagevault` from the host into the container. The image runs as UID/GID `10001:10001`, so create the host directory with matching ownership before first start:

```bash
sudo install -d -o 10001 -g 10001 /data/pagevault
```

That directory contains both metadata and uploaded files, so it must be persistent and writable by the container. Do not make it world-writable.

See [Configuration](./configuration.md) for every supported setting and default.

## Build and Start

Build the image and start the service from the repository root:

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

The Node.js server applies all current SQLite migrations before it starts listening. Migration or database initialization failures terminate startup; the container does not suppress them.

Check the service state and logs:

```bash
docker compose -f docker/docker-compose.yml ps
docker compose -f docker/docker-compose.yml logs -f pagevault
```

The image includes a Docker `HEALTHCHECK` against local `/readyz`. `/healthz` reports process liveness, while `/readyz` additionally performs a lightweight SQLite readiness query.

## Reverse Proxy and TLS

Terminate HTTPS at the reverse proxy and forward both hostnames to the same published container port:

```text
admin-html.example.com -> http://127.0.0.1:13080
h.example.com          -> http://127.0.0.1:13080
```

Preserve the incoming `Host` header. If the proxy rewrites it to `127.0.0.1`, PageVault cannot distinguish the admin interface from the public gateway.

Do not serve `/data/pagevault`, the SQLite file, or the object directory directly. All public file reads must go through PageVault's metadata and expiry checks.

If an external access control is used, apply it only to the admin hostname. The public hostname must remain anonymously reachable for generated links.

## Verify the Deployment

1. Open `ADMIN_BASE_URL` and sign in with `ADMIN_EMAIL` and the original password.
2. Upload a small supported file.
3. Open its generated URL under `PUBLIC_BASE_URL` from a private browser window.
4. Confirm the public hostname returns `404` for `/`, `/api/*`, and admin application paths.
5. Confirm disabling, making private, expiring, or deleting the item prevents public access.

## Backup and Upgrade

Back up both of these paths before an upgrade:

```text
/data/pagevault/pagevault.sqlite
/data/pagevault/objects
```

After updating the repository, rebuild and restart:

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

The startup migrations are idempotent. Keep the backup until login, upload, and public retrieval have been verified on the new container.

For point-in-time backups and an isolated restore verification procedure, see [Operations and Free-tier Guardrails](./operations.md). For the v1 migration/rollback contract, see [Upgrading PageVault](./upgrading.md). Prefer published release tags for long-lived installations.

## Maintenance and reconciliation

The Node runtime runs the same bounded maintenance pass once every 24 hours. You can also inspect it manually from the built application:

```bash
pnpm --filter @pagevault/worker run reconcile -- --dry-run
pnpm --filter @pagevault/worker run maintenance -- --dry-run
```

A dry run reports missing objects, size mismatches, unreferenced objects, and deleted-row cleanup candidates without deleting objects or advancing reconciliation cursors.

To run the normal reconciliation pass and advance its cursors:

```bash
pnpm --filter @pagevault/worker run reconcile
```

Only objects whose database row is already marked `deleted` are automatically removed by reconciliation. Unreferenced objects are reported for diagnosis instead of being deleted automatically.

## Troubleshooting

- Login or startup failure: confirm `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, and `SESSION_SECRET` are set in the container.
- Generated URLs use the wrong hostname: correct `PUBLIC_BASE_URL` and recreate the container.
- Admin and public requests reach the wrong surface: verify both base URLs and the proxy's original `Host` forwarding.
- Data disappears after recreation: confirm `/data/pagevault` is mounted from persistent host storage.
- Permission errors: confirm the container can read and write the mounted database and object paths.

See [Security](./security.md) for the runtime trust model.
