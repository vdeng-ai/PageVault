# ChatGPT uploads through MCP

This is an optional v1.3 integration, disabled until explicitly configured. It extends the existing upload service, not the asset format/product boundary.

## Architecture and permissions

One existing Worker serves `/mcp`, OAuth discovery and consent on the admin hostname. The same `PageVaultService`, D1 database, private R2 bucket and daily Cron are reused. Docker serves identical endpoints using SQLite and the local filesystem. The public hostname rejects MCP, OAuth and admin routes.

The upstream `@modelcontextprotocol/server` stateless HTTP handler supports modern requests and legacy Streamable HTTP clients. It does not allocate Durable Objects or protocol sessions. There are no background uploads, queues, KV namespaces, new Workers or AI inference calls.

Tools: `get_upload_policy`, `upload_asset`, `publish_text`. All credentials are upload-only. No asset list, private reads, administrative updates or deletion tools are exposed. Existing REST API keys retain their existing REST permissions and additionally access these upload tools when MCP is enabled. Existing browser/API upload defaults and share URLs remain unchanged.

MCP writes default to private. Public publishing must be explicitly requested. Public/raw links are returned only while the result is public, active and unexpired. The result includes the actual persisted expiry timestamps. Existing files and idempotent replays may have been disabled/deleted since their original upload; the result reports that current state instead of promising a working public link.

## Configure before enabling

Apply all migrations, including `0008_mcp_oauth.sql` and `0009_gc_active_expiry.sql`. Docker applies them before listening. For Cloudflare, use the existing deployment workflow, which applies migrations before deploying.

Set these **optional** values in the ignored `apps/worker/.env.production` for a local deployment, or the production GitHub environment secrets used by the deployment workflow:

```dotenv
MCP_ENABLED=true
MCP_OAUTH_CLIENT_ID=pagevault-chatgpt
MCP_OAUTH_REDIRECT_URIS=https://chatgpt.com/connector_platform_oauth_redirect
# Optional: omit for a public predefined client with PKCE.
# MCP_OAUTH_CLIENT_SECRET=<cryptographically random secret entered securely>
# Optional: default allowlist is .oaiusercontent.com.
# MCP_FILE_ALLOWED_HOSTS=.oaiusercontent.com
# Daily retention batch, default 100; 1..500.
MAINTENANCE_GC_LIMIT=100
```

`MCP_OAUTH_REDIRECT_URIS` is a comma-separated **exact** allowlist. Use the callback shown by the actual ChatGPT connection setup; never use wildcards. The current stable ChatGPT callback above requires issuer identification, which PageVault advertises and returns as `iss` in both successful and denied authorization redirects. A connection-specific callback can be explicitly allowlisted instead. The protocol URLs must be publicly reachable over HTTPS; do not put an interactive Cloudflare Access challenge in front of machine token/MCP/discovery routes.

The default uses one predefined public client with mandatory PKCE. To use a confidential client, configure a secret and select `client_secret_basic` or `client_secret_post` in the connection. Store the secret only in Worker/CI secrets and the connection's secure credential input. Never include it in plugin JSON, docs or chats. This implementation intentionally does not expose dynamic client registration, CIMD fetching, or a multi-user OAuth directory.

Optional values are not added to `wrangler.jsonc`'s required secrets, so deployments without MCP keep working. The deploy workflow forwards optional values only when set. With `--keep-vars`, blank/missing CI values do not delete already deployed secrets. Set `MCP_ENABLED=false` explicitly to disable an enabled installation; removing a configured client secret requires intentional secret deletion/rotation and matching client reconfiguration.

## Connect ChatGPT

Open the ChatGPT custom MCP/plugin connection flow available to the account. Use:

```text
Transport: Streamable HTTP
MCP URL: https://YOUR_ADMIN_HOST/mcp
Authentication: OAuth / predefined client
Client ID: the configured MCP_OAUTH_CLIENT_ID
Scope: assets:upload
Resource: https://YOUR_ADMIN_HOST/mcp
Authorization: https://YOUR_ADMIN_HOST/oauth/authorize
Token: https://YOUR_ADMIN_HOST/oauth/token
```

Discovery supplies the endpoints. A connection flow without predefined-client support is not compatible with this setup until that client supplies a supported registration path; do not select DCR against a nonexistent registration endpoint.

Sign in through the existing PageVault admin login, inspect the consent page and approve. The login resumes only the same-origin `/oauth/authorize` path. Consent is protected by the existing session's CSRF token and an exact Origin check. Access tokens last up to one hour. Refresh tokens rotate and the grant expires after 30 days. Reusing a consumed refresh token revokes the connection. Codes are single-use and expire after five minutes. Tokens/codes are stored only as SHA-256 hashes; every request checks current grant revocation and resource binding with one indexed lookup. No per-call OAuth audit/last-used write is added.

Manage/revoke connections in **API Keys → ChatGPT / MCP**. Revocation does not delete files. Rotating the administrator password or session secret does not revoke independent OAuth grants; revoke those connections separately or disable MCP. There is also a standard `/oauth/revoke` endpoint and an authenticated `DELETE /api/admin/mcp/connections/:id` route.

For a private portable plugin package, run:

```bash
node scripts/package-chatgpt-plugin.mjs https://YOUR_ADMIN_HOST pagevault-chatgpt none
# Or use client_secret_basic when the server has a client secret.
```

The script requires Python 3 and writes `dist/pagevault-chatgpt.zip`; it contains only public connection settings and a narrow upload skill. Importing a package does not itself deploy the server, establish user consent, or prove host file forwarding works.

## Local Worker development

The pinned Wrangler version loads only names in `secrets.required` from `.env`/`.dev.vars` when that declaration exists. Optional MCP names deliberately are not required in the production config. For local public-client testing, explicitly supply the non-secret settings:

```bash
pnpm wrangler dev --local --var MCP_ENABLED:true \
  --var MCP_OAUTH_CLIENT_ID:pagevault-chatgpt \
  --var MCP_OAUTH_REDIRECT_URIS:https://chatgpt.com/connector_platform_oauth_redirect
```

Keep administrator credentials in the ignored local secrets file. Do not pass a client secret on the command line. Production uses `--secrets-file`, which uploads the explicitly supplied optional names; Docker reads these environment values directly. For a confidential-client local configuration, declare its secret name in a separate local-only Wrangler config and load the secret from its ignored file.

## File transfer and limits

`upload_asset` declares `_meta["openai/fileParams"]: ["file"]`. Its file object has required `download_url`, `file_id`, and optional `mime_type`, `file_name`. An explicit `filename` overrides the optional file metadata; MIME-based fallback names are deterministic. All four fields are declared, and optional metadata is not required.

The host, not a model-written URL, must supply the file reference. Remote Workers cannot fetch `sandbox:` paths. Files are downloaded with a 20-second timeout, a three-redirect maximum, HTTPS-only host validation at each hop, and a byte limit enforced on both the declared length and decoded body. No PageVault credentials are forwarded. Signed URLs are not persisted or returned in errors. Default allowlist: subdomains of `oaiusercontent.com`. Exact additional provider hosts can be configured after verifying a real host-issued file URL; do not allow arbitrary hosts or all of `blob.core.windows.net`.

The existing upload core accepts an `ArrayBuffer`. Downloads are bounded, but this is **not** an end-to-end streaming upload. Keep the default 10 MiB guardrail and measure Worker CPU/memory before increasing it. Inline text has a 256 KiB UTF-8 limit. MCP request JSON is limited to 2 MiB (including escaping), and binary Base64 uploads are not implemented. Existing content authentication, SHA-256, idempotency and partial-failure recovery are reused.

Default deduplication is scoped to a credential/grant and lasts 24 hours. A newly signed download URL for the same host file ID does not create a duplicate. A retry still needs a valid downloadable file because byte validation is preserved. Supplying a new explicit key allows another intentional copy. No directories or embedded website dependency trees are imported automatically.

## Cloudflare quota model

These are planning estimates, not measured account usage or a billing guarantee. Account quotas are shared with other projects. Official references checked on 2026-11-16:

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [limits](https://developers.cloudflare.com/d1/platform/limits/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [batch delete](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)

Typical successful uploads use one R2 PUT. OAuth-authenticated MCP requests add one indexed D1 token/grant lookup. Policy/tool discovery performs no R2 operation. File-import tools add one outbound download plus at most three redirects. Auth metadata is small and written on authorization/refresh/revocation, not on each public page view. The original core's idempotency and metadata/audit/index writes still apply.

Planning assumptions: 30-day file retention, one upload per file, 90% public object cache hit rate, and approximately three Worker requests per public visit. Let U = uploads/day and V = public visits/day:

```text
Worker requests/day ≈ 4U + 3V + 100
D1 read rows/day    ≈ 12U + 6V + 1,000
D1 write rows/day   ≈ 40U + V + 100  (including indexes/retention budget)
R2 steady GB       ≈ U × mean file MB × retention days / 1,000
R2 Class A/month   ≈ 30U + 30
R2 Class B/month   ≈ 30 × [3V × (1 - cache hit rate) + 100]
```

| Scenario | Uploads/day | Mean MB | Visits/day | Steady R2 GB | Worker requests/day | D1 read/write rows/day |
| -------- | ----------: | ------: | ---------: | -----------: | ------------------: | ---------------------: |
| Personal |          10 |     0.5 |        200 |         0.15 |                 740 |            2,320 / 700 |
| Regular  |          50 |       2 |      2,000 |            3 |               6,300 |         13,600 / 4,100 |
| Growth   |         300 |       3 |     20,000 |           27 |              61,300 |       124,600 / 32,100 |

Public reads validate D1 state before using the content cache, so cache hits are not zero-Worker/zero-D1. PDF Range requests, crawlers, retries, OAuth refreshes, logging and other account traffic can change these estimates. The 10 GB-month R2 free allowance is average occupied storage, not a monthly upload allowance. At 27 GB steady storage and otherwise unused included quotas, R2 storage alone is roughly $0.26/month before billing rounding/tax. Reserve the Workers Paid base of about $5/month if CPU or daily request headroom warrants it. This release does not change the account plan or incur a subscription automatically.

Local Node/Playwright/workerd checks are not production CPU measurements. Observe production CPU distributions and D1 `rows_read`/`rows_written`, R2 operation counts and stored bytes after enabling. A successful 10 MiB local upload does not prove a 10 ms Free-tier HTTP CPU budget.

## Retention capacity

`MAINTENANCE_GC_LIMIT` defaults to 100 and is capped at 500 per daily invocation. Set it above expected daily expiry volume (for example 500 for the 300/day scenario), and measure runtime limits before scaling. R2 removes the bounded set in one batch call; metadata updates use at most 90 IDs per SQL statement, and audit inserts use 20 records per statement. For 500 files this is six update statements plus 25 audit statements, rather than 1,000 individual metadata/audit statements. Index maintenance still counts toward billed written rows.

Migration 0009 adds a partial live-expiry index so old deleted records are not repeatedly scanned during expiry selection. Existing public-state checks make per-file cache purges unnecessary for expired content, avoiding another two cache calls per expired item. OAuth cleanup is bounded to 500 expired token rows and 100 unused expired grants per day; it runs in the existing Cron. Reconciliation remains cursor-paged. Total invocation cost also includes reconciliation, counters and maintenance state; the SQL reduction alone does not guarantee all Free-tier limits at every load.

Deleted file metadata and audits remain for compatibility; they are not automatically removed after 30 days. Monitor D1's single-database storage limit as history accumulates. A backlog of expired objects increases actual R2 storage beyond the steady-state model.

## Acceptance and rollback

Run typecheck, lint, unit/integration tests, build and Playwright. The regression suite covers legacy/modern MCP clients, real SQLite/local-file uploads, exact bytes, private/public behavior, idempotency, revocation, PKCE, token reuse, unsafe URLs, bounded reads, batching and browser login/consent. Exercise a local Worker with local D1/R2 as well; Node tests do not prove workerd compatibility.

After `pnpm run build`, run `pnpm run test:mcp:worker` for a repeatable workerd smoke check. It allocates isolated temporary D1/R2 storage and loopback ports, applies migrations locally, exercises OAuth, MCP text uploads, raw-byte delivery, retries, token refresh/revocation and the daily Cron, then stops its own process and removes its temporary data. It neither reads production credentials nor writes remote resources. This check does not substitute for host-forwarded binary-file acceptance in ChatGPT or measure production CPU billing.

Before claiming **ChatGPT end-to-end upload is live**, test an actual account connection and host-forwarded generated HTML, PDF, raster image and user attachment. Model-generated image surfaces may differ in file-ref availability. Keep those acceptance results distinct from SDK-client and mocked-download tests.

Disable MCP with `MCP_ENABLED=false` to stop this integration without altering the existing REST API/viewers. Migrations 0008/0009 are additive. Reverting application code does not delete stored content or the new tables; do not drop tables as an automatic rollback.

Protocol references: [OpenAI file parameters](https://developers.openai.com/plugins/reference), [OpenAI OAuth requirements](https://developers.openai.com/plugins/build/auth), [plugin packaging](https://developers.openai.com/plugins/build/plugins).

For a development machine whose default E2E port is occupied, run `PAGEVAULT_E2E_PORT=3197 npm test` from `e2e/`. Test URLs and temporary SQLite/object paths use that isolated port; the existing application process is not stopped.
