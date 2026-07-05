# Cloudflare Deploy

HTMLBed deploys one Cloudflare Worker to two hostnames: the admin hostname and the public hostname. The Worker is the Cloudflare serverless application that runs HTMLBed. It serves the admin SPA through Workers Static Assets, stores original HTML in a private R2 bucket, stores metadata in D1, and runs a daily Cron Trigger for retention cleanup.

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
   pnpm wrangler r2 bucket create htmlbed-files
   ```

   R2 is Cloudflare's object storage. HTMLBed uses this bucket for uploaded HTML files, and the bucket must stay private.

4. Create the D1 database:

   ```bash
   pnpm wrangler d1 create htmlbed-db
   ```

   D1 is Cloudflare's SQLite-compatible database. HTMLBed uses it for metadata such as slug, status, expiry, and counters. Copy the returned `database_id` into the `d1_databases` entry in `apps/worker/wrangler.jsonc`.

5. Apply migrations to the remote D1 database:

   ```bash
   pnpm wrangler d1 migrations apply htmlbed-db --remote
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

7. Build and deploy the Worker:

   ```bash
   pnpm run build
   pnpm --filter @htmlbed/worker run deploy
   ```

   The deploy script runs `wrangler deploy --keep-vars --secrets-file .env.production` from `apps/worker`. For a preflight without uploading, use `pnpm --filter @htmlbed/worker run deploy:dry-run`. You do not need to create the Worker manually in the Cloudflare dashboard. On first deploy, Wrangler reads `apps/worker/wrangler.jsonc` and creates the Worker named `htmlbed`; on later deploys, it updates that Worker.

8. Add Worker custom domains in the Cloudflare dashboard.

   Open the deployed `htmlbed` Worker, then open its Domains & Routes area and add:

   ```text
   admin-html.example.com
   h.example.com
   ```

   Choose the Cloudflare zone that owns the root domain. Cloudflare will manage the Worker routing and certificate for the custom domain. If either hostname already has a conflicting DNS record, remove or adjust that record before adding the custom domain.

   Prefer Worker custom domains for this project. Worker routes are useful for matching requests on existing Cloudflare-proxied DNS records, but HTMLBed in Cloudflare mode is the application origin itself.

9. Verify the deployment:
   - Sign in on the admin hostname.
   - Upload a small HTML file.
   - Open the generated public URL on the public hostname.
   - Confirm public roots, API paths, and admin paths on the public hostname are not exposed.

## Troubleshooting

- `pnpm wrangler whoami` shows the wrong account: log out or switch accounts before creating resources.
- `database_id` errors: verify the ID copied from `pnpm wrangler d1 create htmlbed-db` matches `apps/worker/wrangler.jsonc`.
- Custom domain does not resolve: confirm the Cloudflare zone is active and the custom domain status is active in the Worker dashboard.
- Login or upload fails after deploy: confirm all required runtime secrets exist with `pnpm wrangler secret list`.
- Worker returns 500: inspect live logs with `pnpm wrangler tail`.

## CI/CD

This repository currently does not include a GitHub Actions workflow for automatic Cloudflare deployment. If you add one later, Wrangler commonly needs repository-level `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets. Runtime values should be provided as Cloudflare secrets through an ignored `.env.production` or an equivalent CI-generated secrets file.
