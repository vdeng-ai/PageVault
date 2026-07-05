# Cloudflare Deploy

HTMLBed deploys one Worker to two hostnames: the admin hostname and the public hostname. The Worker serves the admin SPA through Workers Static Assets, stores original HTML in a private R2 bucket, stores metadata in D1, and runs a daily Cron Trigger for retention cleanup.

## Steps

1. `pnpm install`
2. `pnpm wrangler r2 bucket create htmlbed-files`
3. `pnpm wrangler d1 create htmlbed-db`
4. Copy the returned `database_id` into `apps/worker/wrangler.jsonc`.
5. `pnpm --filter @htmlbed/worker wrangler d1 migrations apply htmlbed-db --remote`
6. `pnpm tsx scripts/hash-password.ts`
7. `pnpm --filter @htmlbed/worker wrangler secret put ADMIN_EMAIL`
8. `pnpm --filter @htmlbed/worker wrangler secret put ADMIN_PASSWORD_HASH`
9. `pnpm --filter @htmlbed/worker wrangler secret put SESSION_SECRET`
10. Configure routes or custom domains for `admin-html.example.com/*` and `h.example.com/*`.
11. `pnpm run build`
12. `pnpm --filter @htmlbed/worker wrangler deploy`

`ADMIN_PASSWORD_HASH` and `SESSION_SECRET` are secrets and must not be written to `wrangler.jsonc`.

## GitHub Actions

Pushes to `main` run CI and deploy through `.github/workflows/deploy-cloudflare.yml`. Configure repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Worker secrets are initialized with `wrangler secret put` and remain managed by Cloudflare.
