# MCP deployment record — 2026-11-16

## Deployed target

- Existing Cloudflare Worker: `pagevault`.
- Application version in the tested checkout: `1.3.0` (not tagged as a Git release).
- Active Worker version: `dd492542-8db1-4ed1-a384-08d0797e76ee`, deployed at 100% traffic.
- Previous Worker version: `a82bd3be-8c63-4ded-adcb-d476c897c187`.
- Existing D1 `pagevault-db` and private R2 `pagevault-files` reused.
- Applied additive migrations: `0008_mcp_oauth.sql`, `0009_gc_active_expiry.sql`.
- Used version upload/deploy; no route, domain or Cron trigger deployment was performed.
- No plan upgrade or additional Cloudflare product was created.

## Enabled connection settings

`MCP_ENABLED=true`, predefined public OAuth client `pagevault-chatgpt`, mandatory PKCE S256, scope `assets:upload`.

Allowlisted callback: `https://chatgpt.com/connector_platform_oauth_redirect`.

Existing production secrets were inherited, not extracted or replaced. The three integration settings were added through an additive secrets file. The existing administrator login authorizes each connection. Open **API Keys → ChatGPT / MCP** in the existing admin site to copy its actual `/mcp` endpoint; use that admin URL rather than a workers.dev version-preview URL, because hostname isolation remains enforced.

## Completed verification

- Typecheck, lint, build and release-contract check passed.
- 39 unit/integration test files, 276 tests passed.
- 25 Playwright browser tests passed, including OAuth consent, publishing, retries and UI revocation.
- `pnpm run test:mcp:worker` passed using isolated local workerd, D1 and R2, covering OAuth, private/public uploads, exact raw bytes, refresh/revocation and scheduled retention.
- Deployment-contract tests passed after adding the smoke command to CI.
- Worker packaging dry-run passed: 308.63 KiB gzip.
- Cloudflare confirmed both migrations and the final 100% version deployment. An initial connection failure occurred before traffic switching; the previous active version was checked before a successful retry.

## Follow-up acceptance

After the initial deployment, the maintainer reported that testing was OK and authorized committing and pushing the implementation with expanded README instructions. The report did not enumerate individual file types or performance measurements; it is recorded as maintainer acceptance, not an additional automated test run.

## Verification boundaries

Cloudflare's deployment confirmation is not a substitute for an HTTP acceptance test on the actual admin/public custom domains. Those domain URLs are stored in existing production secrets and were not recovered during this session.

The initial automated verification did not include the maintainer's real ChatGPT account. Host-forwarded generated HTML, PDF, image and user-attachment uploads were not individually recorded in that run. The later maintainer acceptance above is separate from browser and SDK test evidence; it does not establish support for every ChatGPT file surface.

Local workerd results are not production CPU measurements. Do not compare Worker startup time with the Free-tier per-request CPU budget. Quota figures in `docs/mcp.md` remain planning estimates until production usage is measured.

The initial deployment preceded the source commit. The maintainer subsequently authorized commit/push; consult Git history for the resulting source revision. A commit/push does not itself create a release tag.

## Operational rollback

Disable the integration explicitly with `MCP_ENABLED=false`, or deploy the previous Worker version through the normal version-deployment process. Code rollback does not undo additive D1 migrations; do not drop the new tables or remove stored files. Keep existing public routes, secrets and R2 objects intact.
