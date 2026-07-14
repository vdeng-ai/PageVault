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
DEFAULT_URL_EXPIRE_DAYS: "7"
DEFAULT_FILE_EXPIRE_DAYS: "180"
MAX_UPLOAD_SIZE_MB: "10"
PORT: "3000"
```

The example mounts `/data/pagevault` from the host into the container. That directory contains both metadata and uploaded files, so it must be persistent and writable by the container.

See [Configuration](./configuration.md) for every supported setting and default.

## Build and Start

Build the image and start the service from the repository root:

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

The container entrypoint applies the current SQLite migration before starting the Node.js server.

Check the service state and logs:

```bash
docker compose -f docker/docker-compose.yml ps
docker compose -f docker/docker-compose.yml logs -f pagevault
```

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

The current startup migration is idempotent. Keep the backup until login, upload, and public retrieval have been verified on the new container.

## Troubleshooting

- Login or startup failure: confirm `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, and `SESSION_SECRET` are set in the container.
- Generated URLs use the wrong hostname: correct `PUBLIC_BASE_URL` and recreate the container.
- Admin and public requests reach the wrong surface: verify both base URLs and the proxy's original `Host` forwarding.
- Data disappears after recreation: confirm `/data/pagevault` is mounted from persistent host storage.
- Permission errors: confirm the container can read and write the mounted database and object paths.

See [Security](./security.md) for the runtime trust model.
