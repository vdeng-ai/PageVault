# HTMLBed

Language: English | [简体中文](./README.zh-CN.md)

HTMLBed is a lightweight HTML publishing and lifecycle management system. It stores original HTML files privately, exposes only valid public URLs through an application gateway, and gives a single administrator a web UI for upload, expiry, status, and deletion workflows.

## Architecture

- Cloudflare-first: Workers, Workers Static Assets, R2, D1, and Cron Triggers.
- Docker-compatible: Node.js 22, SQLite, local file storage, and the same core service package.
- Business logic lives in `packages/core`; Cloudflare and Docker code are adapters.

## Cloudflare Deployment

1. Install dependencies: `pnpm install`.
2. Create the private R2 bucket: `pnpm wrangler r2 bucket create htmlbed-files`.
3. Create the D1 database: `pnpm wrangler d1 create htmlbed-db`.
4. Put the returned D1 `database_id` into `apps/worker/wrangler.jsonc`.
5. Apply migrations: `pnpm --filter @htmlbed/worker wrangler d1 migrations apply htmlbed-db --remote`.
6. Generate a password hash: `pnpm tsx scripts/hash-password.ts`.
7. Set Worker secrets with `wrangler secret put`: `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, and `SESSION_SECRET`.
8. Configure both custom domains to the same Worker: `admin-html.example.com/*` and `h.example.com/*`.
9. Build and deploy: `pnpm run build` then `pnpm --filter @htmlbed/worker wrangler deploy`.

Cloudflare deploys from GitHub on pushes to `main` using `.github/workflows/deploy-cloudflare.yml`. The repository secrets required by the workflow are `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Worker runtime secrets are initialized manually with Wrangler and are not stored in GitHub.

## Docker Deployment

1. Generate `ADMIN_PASSWORD_HASH`: `pnpm tsx scripts/hash-password.ts`.
2. Copy `docker/docker-compose.example.yml` and set real values for domains and secrets.
3. Start the service: `docker compose -f docker/docker-compose.example.yml up -d --build`.
4. Reverse proxy both domains to the container port, for example:
   - `admin-html.example.com -> http://127.0.0.1:13080`
   - `h.example.com -> http://127.0.0.1:13080`

Docker stores SQLite metadata and HTML objects under `/data/htmlbed` by default.

## Environment Variables

| Name | Required | Description |
| --- | --- | --- |
| `ADMIN_EMAIL` | yes | Single administrator email. |
| `ADMIN_PASSWORD_HASH` | yes | PBKDF2-SHA256 hash from `scripts/hash-password.ts`. |
| `SESSION_SECRET` | yes | Secret used to sign session cookies. |
| `ADMIN_BASE_URL` | yes | Admin origin, for example `https://admin-html.example.com`. |
| `PUBLIC_BASE_URL` | yes | Public origin, for example `https://h.example.com`. |
| `DEFAULT_URL_EXPIRE_DAYS` | no | Defaults to `7`. |
| `DEFAULT_FILE_EXPIRE_DAYS` | no | Defaults to `180`. |
| `MAX_UPLOAD_SIZE_MB` | no | Defaults to `10`. |
| `SQLITE_PATH` | Docker | SQLite file path. |
| `LOCAL_STORAGE_DIR` | Docker | Local object directory. |
| `PORT` | Docker | HTTP port, defaults to `3000`. |

## Security Model

Public users can only request a single HTML file through `/p/:slug`, `/p/:slug/`, or `/p/:slug.html`. The gateway checks metadata, visibility, status, URL expiry, and file expiry before reading storage. Public roots, lists, sitemap paths, admin routes, and APIs return `404`.

The R2 bucket must not be public. A public R2 bucket would bypass URL expiry, status checks, deletion state, audit logging, and access counting. All object reads must go through the Worker or Docker server gateway.

The admin and public surfaces should use different hostnames. The `htmlbed_session` cookie is scoped to the admin host only; it must not be set on a parent domain such as `.example.com`.

HTMLBed intentionally does not sanitize, rewrite, inject scripts into, or otherwise alter uploaded HTML. Only authenticated administrators can upload files, and the system stores and returns the original bytes.

## Migrations

Cloudflare: `pnpm --filter @htmlbed/worker wrangler d1 migrations apply htmlbed-db --remote`.

Docker: `pnpm tsx scripts/local-migrate.ts` or start the container, whose entrypoint runs migrations before serving.

## Future Plans

Planned extensions include image uploads, Markdown publishing, stronger access analytics, and tags.
