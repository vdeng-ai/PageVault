# Cloudflare Deploy

PageVault deploys one Cloudflare Worker to two hostnames: the admin hostname and the public hostname. The Worker serves the admin SPA through Workers Static Assets, stores uploaded files in a private R2 bucket, stores metadata in D1, and runs a daily Cron Trigger for retention cleanup.

PageVault can start within Cloudflare's included free usage quotas for Workers, D1, and R2. These quotas are limited rather than unlimited; review the current [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), and [R2 pricing](https://developers.cloudflare.com/r2/pricing/) before production use.

The product name is `PageVault`; Cloudflare resources, package scopes, and GitHub Actions deployment identifiers use the lowercase `pagevault` form.

## Prerequisites

1. Install Node.js 22.
2. Enable Corepack and install dependencies:

   ```bash
   corepack enable
   pnpm install
   ```

   Corepack is Node's package-manager shim. It reads the root `package.json` and activates the pinned `pnpm@10.15.0` version. Use `pnpm wrangler ...` later in this guide instead of a global `wrangler` command so you use the Wrangler version installed by this repository.

3. Add your root domain, such as `example.com`, to Cloudflare DNS and wait until the zone is active.
4. Choose two hostnames:
   - admin hostname, for example `admin-html.example.com`
   - public hostname, for example `h.example.com`
5. Generate an admin password hash:

   ```bash
   pnpm tsx scripts/hash-password.ts
   ```

6. Generate a long random session secret:

   ```bash
   openssl rand -base64 32
   ```

## Deploy Steps

1. Log in and confirm the Cloudflare account:

   ```bash
   pnpm wrangler login
   pnpm wrangler whoami
   ```

   Wrangler is Cloudflare's command-line tool. `pnpm wrangler login` authorizes it, and `pnpm wrangler whoami` confirms which Cloudflare account will receive the R2 bucket, D1 database, secrets, and Worker deployment.

2. Review `apps/worker/wrangler.jsonc`.

   Keep real runtime values out of this tracked file. Keep binding names such as `HTML_BUCKET` and `DB` unchanged unless you also update the application code. If you change the R2 bucket name, D1 database name, or Worker name, update the matching entries in this file. Runtime keys are declared in `secrets.required`; their real values come from ignored `.env` files and Cloudflare secrets.

3. Create the private R2 bucket:

   ```bash
   pnpm wrangler r2 bucket create pagevault-files
   ```

   R2 is Cloudflare's object storage. PageVault uses this bucket for uploaded files, and the bucket must stay private.

4. Create the D1 database:

   ```bash
   pnpm wrangler d1 create pagevault-db
   ```

   D1 is Cloudflare's SQLite-compatible database. PageVault uses it for metadata such as slug, status, expiry, and counters. Put the returned `database_id` in the existing `DB` entry in `apps/worker/wrangler.jsonc`; do not add a second D1 binding. If Wrangler offers to update the config automatically, make sure the selected binding name is `DB`.

5. Apply migrations to the remote D1 database:

   ```bash
   pnpm wrangler d1 migrations apply pagevault-db --remote
   ```

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

   Set `PUBLIC_BASE_URL` and `ADMIN_BASE_URL` to your two real HTTPS origins, without trailing slashes. Set `ADMIN_PASSWORD_HASH` to the output from `scripts/hash-password.ts` and `SESSION_SECRET` to the generated random secret. Do not commit the filled file.

   See [Configuration](./configuration.md) for all supported runtime values and defaults.

7. Build and deploy the Worker:

   ```bash
   pnpm run build
   pnpm --filter @pagevault/worker run deploy
   ```

   The deploy script runs `wrangler deploy --keep-vars --secrets-file .env.production` from `apps/worker`. For a preflight without uploading, use `pnpm --filter @pagevault/worker run deploy:dry-run`. You do not need to create the Worker manually in the Cloudflare dashboard. On first deploy, Wrangler reads `apps/worker/wrangler.jsonc` and creates the Worker named `pagevault`; on later deploys, it updates that Worker.

8. Add Worker custom domains in the Cloudflare dashboard.

   Open the deployed `pagevault` Worker, then open its Domains & Routes area and add:

   ```text
   admin-html.example.com
   h.example.com
   ```

   Choose the Cloudflare zone that owns the root domain. Cloudflare will manage the Worker routing and certificate for the custom domain. If either hostname already has a conflicting DNS record, remove or adjust that record before adding the custom domain.

   Prefer Worker custom domains for this project. Worker routes are useful for matching requests on existing Cloudflare-proxied DNS records, but PageVault in Cloudflare mode is the application origin itself.

   If you add Cloudflare Access, Zero Trust, Basic Auth, firewall challenges, or similar upstream authentication, apply those rules only to the admin hostname. Do not apply them to the public hostname or to a wildcard pattern such as `*.example.com`; generated public URLs like `https://h.example.com/p/report-ed559a5f` must load without an admin login.

9. Verify the deployment:
   - Sign in on the admin hostname.
   - Upload a small supported file.
   - Open the generated public URL on the public hostname from an unauthenticated browser, private window, or different device.
   - Confirm public roots, API paths, and admin paths on the public hostname are not exposed.
   - Confirm `https://admin-html.example.com/` still requires the admin account.

## Troubleshooting

- `pnpm wrangler whoami` shows the wrong account: log out or switch accounts before creating resources.
- D1 binding errors: run `pnpm wrangler d1 info pagevault-db` and confirm the database exists in the account shown by `pnpm wrangler whoami`.
- Custom domain does not resolve: confirm the Cloudflare zone is active and the custom domain status is active in the Worker dashboard.
- Login or upload fails after deploy: confirm all required runtime secrets exist with `pnpm wrangler secret list`.
- Worker returns 500: inspect live logs with `pnpm wrangler tail`.

## CI/CD

This repository includes `.github/workflows/deploy.yml` for automatic Cloudflare deployment. It runs on pushes to `main` and through `workflow_dispatch`, installs the root `packageManager` version with Corepack, runs checks and builds, writes `apps/worker/.env.production` from GitHub Secrets, then deploys with `wrangler deploy --keep-vars --secrets-file .env.production`.

The deploy workflow does not apply D1 migrations automatically. When schema migrations change, apply them explicitly with `pnpm wrangler d1 migrations apply pagevault-db --remote` before or alongside the deploy you intend to release.

See [Security](./security.md) for the runtime trust model and required hostname isolation.
