# MCP deployment record — 2026-11-16

## Initial deployed target

- Existing Cloudflare Worker: `pagevault`.
- Application version in the tested checkout: `1.3.0` (not tagged as a Git release).
- Initial Worker version: `dd492542-8db1-4ed1-a384-08d0797e76ee`, deployed at 100% traffic at that stage.
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

Subsequent regression report: the maintainer reported that an ordinary `ok.jpg` attachment also returned `file_host_not_allowed`, after a generated-image upload failed. The report contained no download hostname or redirect chain. The original error combined hostname, protocol, credential, port and fragment rejection, so it does not establish which condition failed. v1.3.1 adds redacted diagnostics without broadening the allowlist; real host-forwarded attachment acceptance remains open until the exact failure is captured and a successful save is verified.

Cloudflare's deployment confirmation is not a substitute for an HTTP acceptance test on the actual admin/public custom domains. Those domain URLs are stored in existing production secrets and were not recovered during this session.

The initial automated verification did not include the maintainer's real ChatGPT account. Host-forwarded generated HTML, PDF, image and user-attachment uploads were not individually recorded in that run. The later maintainer acceptance above is separate from browser and SDK test evidence; it does not establish support for every ChatGPT file surface.

Local workerd results are not production CPU measurements. Do not compare Worker startup time with the Free-tier per-request CPU budget. Quota figures in `docs/mcp.md` remain planning estimates until production usage is measured.

The initial deployment preceded the source commit. The maintainer subsequently authorized commit/push; consult Git history for the resulting source revision. A commit/push does not itself create a release tag.

## v1.3.1 attachment diagnostics follow-up

- Worker version `3c7cdf5e-f093-48a2-8630-97dd4721f4da` was deployed at 100% after verification. The immediately preceding production version was `bfdb2bdb-ff27-4bb7-a6d6-11f7f6a37740`.
- Temporarily enabled `MCP_FILE_DIAGNOSTICS=true` through an additive secrets file; existing secrets and `MCP_FILE_ALLOWED_HOSTS` were preserved. No download host was added. No D1 migration, domain/route/Cron change or paid service was introduced.
- Verification: typecheck, lint, build, release contract, 39 test files / 292 unit and integration tests, 25 Playwright tests, and the isolated workerd/D1/R2 smoke check all passed. The smoke fixture now escapes dotenv dollar signs so randomized PBKDF2 salts/hashes remain literal; negative-tool tests explicitly expect a tool error.
- URL rejection diagnostics contain a generated request ID, initial/redirect stage, hop, classified protocol, hostname/sourceHostname, allowlist match and reason. Logs and tool results omit file IDs, filenames, paths, credentials and signed queries. No diagnostic is written to D1 or R2.
- This rollout does not establish that the maintainer's `ok.jpg` can be imported. Its real forwarded hostname/protocol is still unknown. Retry through ChatGPT and inspect the returned safe diagnostic before changing the allowlist. Disable temporary logging explicitly with `MCP_FILE_DIAGNOSTICS=false` after diagnosis.
- Source changes for this follow-up remain in the checkout; no additional Git commit, push or release tag was created during this follow-up.

## v1.3.2 observed attachment host

The maintainer supplied diagnostic request `e0edb832e00f1a94ec0e67ef`: `stage=initial`, `hop=0`, `protocol=https:`, `hostname=oaisdmntprwestus3.blob.core.windows.net`, `allowlistMatched=false`, `reason=host_not_allowlisted`. This identifies the first-hop allowlist mismatch; it is no longer just an unknown protocol/hostname failure. The request was rejected before downloading or persisting the attachment.

The default policy now permits that **exact account hostname** in addition to `.oaiusercontent.com`. It does not permit `.blob.core.windows.net`, guessed regions, sibling accounts or child subdomains of the exact account. HTTPS, credentials, port, size, timeout and redirect validation remain enforced. Explicit `MCP_FILE_ALLOWED_HOSTS` settings still replace the defaults; existing overrides must be updated rather than silently expanded.

Validation: typecheck, lint, build, release-contract check, 39 test files / 296 tests, 25 Playwright tests, local workerd/D1/R2 smoke, and Worker upload dry-run passed. The JPEG test uses an existing repository image, mocked download transport and real SQLite/local storage to verify private persistence, original bytes and idempotent retry. It is not a live download of the maintainer's `ok.jpg`; successful real-attachment acceptance remains a separate step.

Deployed Worker version `4ed51140-9f5d-49b6-9e9e-f1c204d42810` at 100% traffic, confirmed by a subsequent deployment-status query. Previous version: `3c7cdf5e-f093-48a2-8630-97dd4721f4da`. An additive settings file explicitly set `MCP_FILE_ALLOWED_HOSTS=.oaiusercontent.com,oaisdmntprwestus3.blob.core.windows.net` and `MCP_FILE_DIAGNOSTICS=false`; unrelated production secrets were inherited. Temporary hostname tracing is off, while safe structured error diagnostics remain available. No migrations, domain/route/Cron changes, new products, or plan upgrades were performed.

Re-query `get_upload_policy` from the existing authorized ChatGPT connection and confirm the exact hostname in `allowedDownloadHosts` before retrying the attachment. The tools and OAuth contract did not change; no reauthorization is required by this fix. This rollout and its diagnostic predecessor are still uncommitted in the checkout; no new Git commit, push, or release tag was created during this fix.

## v1.3.3 publishing defaults and user guide

After the exact-host fix, the maintainer confirmed the real ChatGPT upload works and requested public uploads by default, 15-day share links and 30-day file retention. This is maintainer acceptance of the reported attachment workflow, not a guarantee for every ChatGPT generation surface.

New MCP uploads now use public visibility when omitted. Explicit private/custom expiry settings are honored and existing assets are not modified. Tool descriptions, OAuth consent, the admin connection panel, public upload guide and packaged plugin skill agree with the new default. Both READMEs contain only product introduction and user-facing usage/setup guidance; development and architecture details remain in dedicated docs.

Validation passed: typecheck, lint, build, release-contract check, 39 test files / 300 unit and integration tests, 25 Playwright tests, isolated local workerd/D1/R2 smoke, and Worker packaging dry-run. New checks cover omitted options on both upload tools, exact 15/30-day persisted timestamps, explicitly private file/text uploads, configured/custom expiry overrides and unchanged existing private files when a retry conflicts. README local links resolve.

This update does not require a database migration, alter existing assets, change the attachment allowlist or add Cloudflare products. Existing ChatGPT connections should refresh tool descriptors; imported plugin skills must also use the updated instructions. Explicit `private` arguments sent by older clients are still honored rather than forcibly published.

Deployed Worker version `18fb9aea-9ebf-4bb6-add1-81030b0d8930` at 100% traffic, confirmed by a subsequent deployment-status query. Previous version: `4ed51140-9f5d-49b6-9e9e-f1c204d42810`. The additive settings file contained only `DEFAULT_URL_EXPIRE_DAYS=15` and `DEFAULT_FILE_EXPIRE_DAYS=30`; OAuth credentials, the attachment-host fix and all other deployed secrets were inherited unchanged. No new Git commit, push or release tag was created during this update; the README changes remain in the checkout with the pending attachment fixes.

## Operational rollback

Disable the integration explicitly with `MCP_ENABLED=false`, or deploy the previous Worker version through the normal version-deployment process. Code rollback does not undo additive D1 migrations; do not drop the new tables or remove stored files. Keep existing public routes, secrets and R2 objects intact.
