# PageVault

Language: English | [简体中文](./README.zh-CN.md)

PageVault is a lightweight publishing and lifecycle management system for HTML, Markdown, and image files. It stores original uploads privately, exposes only valid public URLs through an application gateway, and gives a single administrator a web UI for upload, expiry, status, and deletion workflows.

The product name is `PageVault`; deployment identifiers, package scopes, and data paths use the lowercase `pagevault` form.

## Architecture

- Cloudflare-first: Workers, Workers Static Assets, R2, D1, and Cron Triggers.
- Docker-compatible: Node.js 22, SQLite, local file storage, and the same core service package.
- Business logic lives in `packages/core`; Cloudflare and Docker code are adapters.

## Deployment Prerequisites

- Node.js 22. After installing Node, enable Corepack and install dependencies:

  ```bash
  corepack enable
  pnpm install
  ```

  Corepack is shipped with modern Node.js. It reads the `packageManager` field in `package.json` and activates the matching package manager version. In this repository that means `pnpm@10.15.0`. `pnpm install` then installs the monorepo dependencies, and later `pnpm run build` builds all packages.

- For Cloudflare deployment, a Cloudflare account and a domain added to Cloudflare DNS. Cloudflare calls a managed root domain a zone, such as `example.com`. The zone should be active before you add custom domains. In practice this means you have added the domain to Cloudflare and updated the nameservers at your registrar.
- Two hostnames for production:
  - admin hostname, for example `admin-html.example.com`
  - public hostname, for example `h.example.com`
- A password hash for the single administrator account:

  ```bash
  pnpm tsx scripts/hash-password.ts
  ```

  Use the interactive prompt when possible. Passing the password as a command argument can leave it in shell history.

- A long random `SESSION_SECRET`. For example:

  ```bash
  openssl rand -base64 32
  ```

## Cloudflare Deployment

Cloudflare mode runs one Worker on both hostnames. The Worker is the Cloudflare serverless application that runs PageVault: it serves the admin SPA from Workers Static Assets, stores metadata in D1, stores original files in a private R2 bucket, and runs the configured Cron Trigger for cleanup.

1. Log in to Cloudflare through Wrangler.

   ```bash
   pnpm wrangler login
   pnpm wrangler whoami
   ```

   Wrangler is Cloudflare's command-line tool. Use `pnpm wrangler ...` in this repository so you run the project-pinned Wrangler version from `apps/worker/package.json`. `pnpm wrangler login` opens a browser so you can authorize Wrangler. `pnpm wrangler whoami` confirms which Cloudflare account Wrangler will use.

2. Review `apps/worker/wrangler.jsonc` before creating resources.

   Keep real runtime values out of this tracked file. If you change the R2 bucket name, D1 database name, or Worker name, update the matching entries in `wrangler.jsonc`. Runtime values such as `PUBLIC_BASE_URL`, `ADMIN_BASE_URL`, and `SESSION_SECRET` are declared in `secrets.required` and supplied from an ignored `.env` file.

   Important entries in this file:

   - `name`: the Worker name. The default is `pagevault`.
   - `assets`: points Wrangler at the built admin frontend in `apps/admin/dist`.
   - `r2_buckets`: binds the private R2 bucket to the Worker. The application code reads the `HTML_BUCKET` binding, so keep that binding name intact.
   - `d1_databases`: binds the D1 database to the Worker. Keep exactly one entry with binding `DB`, database name `pagevault-db`, and the UUID returned when the database is created.
   - `triggers`: schedules the daily cleanup Cron Trigger.
   - `secrets.required`: declares the runtime keys that Wrangler must load from local `.env` files during development and from Cloudflare secrets during deployment.

3. Create the private R2 bucket.

   ```bash
   pnpm wrangler r2 bucket create pagevault-files
   ```

   R2 is Cloudflare's object storage. PageVault uses this bucket for the original uploaded files. Do not make this bucket public. Public R2 access would bypass PageVault's expiry, status, deletion, audit, and access-count checks.

4. Create the D1 database.

   ```bash
   pnpm wrangler d1 create pagevault-db
   ```

   D1 is Cloudflare's SQLite-compatible database. PageVault uses it for metadata such as slug, status, expiry, and counters. Put the returned `database_id` in the existing `DB` entry in `apps/worker/wrangler.jsonc`; do not add a second D1 binding.

5. Apply D1 migrations to the remote database.

   ```bash
   pnpm wrangler d1 migrations apply pagevault-db --remote
   ```

   This creates the tables PageVault needs. Use `--remote` because this database is the production Cloudflare D1 database, not Wrangler's local development database.

6. Prepare the Worker runtime secrets file.

   Use `apps/worker/.env.example` as the key list and put real deployment values in `apps/worker/.env.production`. This file is ignored by Git and is passed to Wrangler with `--secrets-file`.

   ```dotenv
   APP_ENV=production
   PUBLIC_BASE_URL=https://h.example.com
   ADMIN_BASE_URL=https://admin-html.example.com
   DEFAULT_URL_EXPIRE_DAYS=7
   DEFAULT_FILE_EXPIRE_DAYS=180
   MAX_UPLOAD_SIZE_MB=10
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD_HASH=replace-with-password-hash
   SESSION_SECRET=replace-with-long-random-secret
   ```

   Set `PUBLIC_BASE_URL` and `ADMIN_BASE_URL` to your real origins, without trailing slashes. Set `ADMIN_PASSWORD_HASH` to the output from `scripts/hash-password.ts` and `SESSION_SECRET` to the generated random secret. Do not commit the filled file.

7. Build and deploy.

   ```bash
   pnpm run build
   pnpm --filter @pagevault/worker run deploy
   ```

   The deploy script runs `wrangler deploy --keep-vars --secrets-file .env.production` from `apps/worker`. For a preflight without uploading, use `pnpm --filter @pagevault/worker run deploy:dry-run`. You do not need to create a Worker manually before this. On the first deploy, Wrangler creates the Worker named by `name` in `wrangler.jsonc`; on later deploys, it updates the same Worker.

8. Add custom domains after the first successful deploy.

   In the Cloudflare dashboard, open the deployed `pagevault` Worker, then open its Domains & Routes area. Add these as Worker custom domains:

   ```text
   admin-html.example.com
   h.example.com
   ```

   Choose the Cloudflare zone that owns the root domain, for example `example.com`. Cloudflare will manage the Worker routing and certificate for the custom domain. If a hostname already has a conflicting DNS record, remove or change that record first.

   A custom domain sends a hostname directly to the Worker, which is the recommended setup for PageVault on Cloudflare. Use Workers routes only if you intentionally want route patterns on existing Cloudflare-proxied DNS records. Routes are useful when a Worker sits in front of another origin server; PageVault's Cloudflare mode normally does not need that extra origin. Route patterns look like this:

   ```text
   admin-html.example.com/* -> pagevault
   h.example.com/*          -> pagevault
   ```

   The application decides admin versus public behavior from the incoming `Host` header.

9. Verify the deployment.

   - Open `ADMIN_BASE_URL` and sign in with `ADMIN_EMAIL` and the original admin password.
   - Upload a small supported file from the admin UI.
   - Open the generated public URL under `PUBLIC_BASE_URL`.
   - Confirm public roots, admin paths on the public hostname, and API paths on the public hostname are not exposed.
   - Use `pnpm wrangler tail` if you need live Worker logs while testing.

The repository includes `.github/workflows/deploy.yml` for automatic Cloudflare deployment. It runs on pushes to `main` and can also be started manually through `workflow_dispatch`. The workflow installs dependencies, runs type checks and tests, builds the admin SPA and Worker, writes an ignored `apps/worker/.env.production` file from GitHub Secrets, then runs `wrangler deploy --keep-vars --secrets-file .env.production`.

Configure these GitHub Secrets in a protected `production` environment before enabling automatic deploys:

1. On GitHub, open the repository, then open **Settings -> Environments -> New environment**.
2. Name the environment `production`, then click **Configure environment**. The name must match the workflow's `environment: production` setting.
3. Under **Deployment branches and tags**, choose **Selected branches and tags**, add a branch rule for `main`, and save it.
4. Optionally enable **Required reviewers** so production deploys must be approved before the job can access environment secrets.
5. Under **Environment secrets**, click **Add secret** and add each name below. Use secrets, not variables, because the workflow reads them through the `secrets.*` context.

If your GitHub plan or repository type does not show environments, use **Settings -> Secrets and variables -> Actions -> Repository secrets** as a fallback. The workflow can read repository secrets with the same names, but those secrets will not have environment approval protection.

Create the two Cloudflare credential values before adding the GitHub secrets.

`CLOUDFLARE_ACCOUNT_ID` is the Cloudflare account ID that owns the Worker, R2 bucket, and D1 database. You can find it in any of these places:

- URL: after signing in to the Cloudflare dashboard, look at the browser address bar. The account ID is usually the long alphanumeric segment immediately after `dash.cloudflare.com/`, for example `https://dash.cloudflare.com/1234567890abcdef1234567890abcdef/...`.
- Workers & Pages: open **Workers & Pages**, then copy **Account ID** from the **Account details** area.
- Site overview: open a Cloudflare-managed site, go to **Overview**, find the **API** section, and copy **Account ID**.

`CLOUDFLARE_API_TOKEN` is a token you create for CI deployment:

1. In the Cloudflare dashboard, select your profile avatar, then open **My Profile -> API Tokens**.
2. Select **Create Token**.
3. Use the **Edit Cloudflare Workers** template if it is available, or choose **Create Custom Token** and grant only the permissions needed to deploy Workers for this account.
4. Scope the token to the Cloudflare account used by this deployment.
5. Select **Continue to summary**, review the permissions, then select **Create Token**.
6. Copy the generated token immediately. Cloudflare only shows it once. Store it as the GitHub Secret `CLOUDFLARE_API_TOKEN` or in a password manager; do not commit it.

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
APP_ENV
PUBLIC_BASE_URL
ADMIN_BASE_URL
DEFAULT_URL_EXPIRE_DAYS
DEFAULT_FILE_EXPIRE_DAYS
MAX_UPLOAD_SIZE_MB
ADMIN_EMAIL
ADMIN_PASSWORD_HASH
SESSION_SECRET
```

The deploy workflow does not apply D1 migrations automatically. When schema migrations change, apply them explicitly with `pnpm wrangler d1 migrations apply pagevault-db --remote` before or alongside the deploy you intend to release.

### Common Cloudflare Questions

- Do I need to create the Worker in the dashboard first?
  No. Use Wrangler. `pnpm --filter @pagevault/worker run deploy` creates or updates the Worker from `apps/worker/wrangler.jsonc`.
- When do I add custom domains?
  Add them after the first successful deploy, because the dashboard needs an existing Worker to attach them to.
- Why two domains?
  The admin UI and public HTML gateway intentionally use different hostnames. The session cookie is scoped to the admin hostname, and the public hostname only serves valid published HTML URLs.
- What if I change `ADMIN_BASE_URL` or `PUBLIC_BASE_URL` later?
  Update `apps/worker/.env.production`, run `pnpm --filter @pagevault/worker run deploy`, and update the matching custom domain in Cloudflare.
- What if the custom domain does not resolve?
  Confirm the root domain is active in Cloudflare, the hostname has no conflicting DNS record, and the custom domain status in the Worker dashboard is active.
- What if the Worker returns 500 after deploy?
  Check that all required runtime secrets exist with `pnpm wrangler secret list`, then inspect live logs with `pnpm wrangler tail`.

## Docker Deployment

Docker mode runs the same service layer with Node.js 22, SQLite, and local object storage.

Docker is the non-Cloudflare deployment path. Instead of D1 and R2, it stores metadata in SQLite and files on disk. You still need two hostnames, because PageVault uses the incoming `Host` header to decide whether a request belongs to the admin UI or the public gateway.

1. Prepare a host-specific compose file.

   Copy `docker/docker-compose.example.yml` to a deployment location such as `/opt/pagevault/docker-compose.yml`, then replace all example domains, email addresses, and secrets. Do not commit the filled file if it contains real secrets.

2. Set the required runtime values.

   The example compose file already includes the required Docker mode values:

   ```yaml
   APP_ENV: production
   RUNTIME: node
   DB_DRIVER: sqlite
   STORAGE_DRIVER: local
   SQLITE_PATH: /data/pagevault/pagevault.sqlite
   LOCAL_STORAGE_DIR: /data/pagevault/objects
   ADMIN_BASE_URL: https://admin-html.example.com
   PUBLIC_BASE_URL: https://h.example.com
   ADMIN_EMAIL: admin@example.com
   ADMIN_PASSWORD_HASH: replace_me
   SESSION_SECRET: replace_me
   ```

   Replace `ADMIN_PASSWORD_HASH` with the output from `pnpm tsx scripts/hash-password.ts` and `SESSION_SECRET` with a long random value.

3. Start the service:

   ```bash
   docker compose -f /opt/pagevault/docker-compose.yml up -d --build
   ```

   The container entrypoint runs the SQLite migration before starting the server. Metadata and uploaded objects are stored under `/data/pagevault` by default, so that directory must be persistent and included in backups.

4. Configure TLS and reverse proxy.

   Route both hostnames to the same container port and preserve the original `Host` header:

   ```text
   admin-html.example.com -> http://127.0.0.1:13080
   h.example.com          -> http://127.0.0.1:13080
   ```

   Terminate HTTPS at the reverse proxy. Do not serve `/data/pagevault` directly from the proxy.

   Preserving `Host` is required. If the reverse proxy rewrites every request to `127.0.0.1`, PageVault can no longer tell whether the request came from the admin hostname or the public hostname.

5. Verify Docker deployment:

   ```bash
   docker compose -f /opt/pagevault/docker-compose.yml ps
   docker compose -f /opt/pagevault/docker-compose.yml logs -f pagevault
   ```

   Then sign in on the admin hostname, upload a small supported file, and open the generated public URL on the public hostname.

6. Upgrade safely.

   Back up `/data/pagevault/pagevault.sqlite` and `/data/pagevault/objects`, update the source image or repository, then rebuild and restart:

   ```bash
   docker compose -f /opt/pagevault/docker-compose.yml up -d --build
   ```

   The startup migration is idempotent for the current schema.

## Environment Variables

| Name                       | Where                          | Required    | Description                                                   |
| -------------------------- | ------------------------------ | ----------- | ------------------------------------------------------------- |
| `ADMIN_EMAIL`              | Cloudflare secret / Docker env | yes         | Single administrator email.                                   |
| `ADMIN_PASSWORD_HASH`      | Cloudflare secret / Docker env | yes         | PBKDF2-SHA256 hash from `scripts/hash-password.ts`.           |
| `SESSION_SECRET`           | Cloudflare secret / Docker env | yes         | Secret used to sign session cookies.                          |
| `APP_ENV`                  | Cloudflare secret / Docker env | recommended | Use `production` for deployment.                              |
| `ADMIN_BASE_URL`           | Cloudflare secret / Docker env | yes         | Admin origin, for example `https://admin-html.example.com`.   |
| `PUBLIC_BASE_URL`          | Cloudflare secret / Docker env | yes         | Public origin, for example `https://h.example.com`.           |
| `DEFAULT_URL_EXPIRE_DAYS`  | Cloudflare secret / Docker env | no          | Defaults to `7`.                                              |
| `DEFAULT_FILE_EXPIRE_DAYS` | Cloudflare secret / Docker env | no          | Defaults to `180`.                                            |
| `MAX_UPLOAD_SIZE_MB`       | Cloudflare secret / Docker env | no          | Defaults to `10`.                                             |
| `RUNTIME`                  | Docker env                     | yes         | Use `node`.                                                   |
| `DB_DRIVER`                | Docker env                     | yes         | Use `sqlite`.                                                 |
| `STORAGE_DRIVER`           | Docker env                     | yes         | Use `local`.                                                  |
| `SQLITE_PATH`              | Docker env                     | no          | SQLite file path, defaults to `/data/pagevault/pagevault.sqlite`. |
| `LOCAL_STORAGE_DIR`        | Docker env                     | no          | Local object directory, defaults to `/data/pagevault/objects`.  |
| `PORT`                     | Docker env                     | no          | HTTP port inside the container, defaults to `3000`.           |

## Security Model

Public users can only request a single published file through `/p/:slug`, `/p/:slug/`, or `/p/:slug.html`. The gateway checks metadata, visibility, status, URL expiry, and file expiry before reading storage. Public roots, lists, sitemap paths, admin routes, and APIs return `404`.

The R2 bucket must not be public. A public R2 bucket would bypass URL expiry, status checks, deletion state, audit logging, and access counting. All object reads must go through the Worker or Docker server gateway.

The admin and public surfaces should use different hostnames. The `pagevault_session` cookie is scoped to the admin host only; it must not be set on a parent domain such as `.example.com`.

PageVault intentionally does not sanitize, rewrite, inject scripts into, or otherwise alter uploaded HTML. Markdown is stored as original bytes and rendered with raw HTML disabled; images are returned as uploaded bytes. Only authenticated administrators can upload files.

## Migrations and Maintenance

- Cloudflare migrations: `pnpm wrangler d1 migrations apply pagevault-db --remote`.
- Docker migrations: the container entrypoint runs migrations before serving. For a local Node run, use `pnpm tsx scripts/local-migrate.ts`.
- Cloudflare logs: use `pnpm wrangler tail`.
- Docker logs: use `docker compose -f /opt/pagevault/docker-compose.yml logs -f pagevault`.
- Rotate admin credentials by generating a new password hash and updating `ADMIN_PASSWORD_HASH`; existing sessions can be invalidated by rotating `SESSION_SECRET`.
