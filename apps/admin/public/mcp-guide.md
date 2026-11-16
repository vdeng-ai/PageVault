# PageVault ChatGPT / MCP guide

PageVault accepts uploads through the **admin hostname** at `/mcp`. This guide contains no credentials. Resolve relative URLs against the origin serving this document.

## Connect

The administrator must enable MCP and configure an OAuth client first. The API Keys page has a **ChatGPT / MCP** section showing the endpoint, OAuth readiness, client ID and recent authorized connections.

Use a remote **Streamable HTTP** MCP connection with OAuth. The resource is exactly `https://YOUR_ADMIN_HOST/mcp`; the scope is `assets:upload`. Use the administrator's preconfigured client ID. Sign in to PageVault in the browser and approve upload access. Do not put the administrator password, session cookie, API key or client secret into a chat message.

The server supports predefined clients with PKCE S256, not dynamic client registration. A confidential client's secret belongs in the connection's secure configuration, never in a plugin package. Public predefined clients use token endpoint authentication `none`.

An MCP client that supports a custom Authorization header can alternatively use an upload-only PageVault API key. This does not grant private-file reads, item listing or deletion. ChatGPT connection surfaces differ; use OAuth for the portable ChatGPT flow.

New connections are authorized for **365 days by default**, or the period configured by the administrator and displayed on the consent page. Access tokens last up to one hour; the client can automatically refresh them within the authorization period. Refresh tokens rotate, but the original authorization deadline does not move. Existing 30-day connections retain their original expiry; authorize again to use the new period. Connection authorization is separate from share-link expiry and file retention.

## Upload tools

| Tool                | Purpose                                                                        |
| ------------------- | ------------------------------------------------------------------------------ |
| `get_upload_policy` | Current supported formats, byte limits and default expiries; no asset listing. |
| `upload_asset`      | Import an actual ChatGPT file reference, preserving original bytes.            |
| `publish_text`      | Save small HTML, Markdown or SVG source, at most 256 KiB UTF-8.                |

Supported formats: HTML, Markdown, PDF, SVG, PNG, JPEG and WebP. Default maximum file size: 10 MiB, subject to instance settings. No Office, ZIP, video, conversion, screenshotting or multi-file website bundling.

**All MCP uploads default to public**, including `upload_asset` and `publish_text`. Anyone with the returned link can view the file. Defaults are 15 days for the link and 30 days for the file, unless the instance is configured differently. Honor a request for private storage or no sharing by passing `visibility: "private"`. Use `url_expire_days` and `file_expire_days` when the user requests different periods. Existing files are not changed by these defaults.

Example request: “Save this report to PageVault.” This creates a public link using the default periods. For administrator-only access, say: “Save this file privately to PageVault; do not share it.”

## Actual files, not local paths

`upload_asset.file` is an OpenAI file parameter. The host supplies `download_url` and `file_id`, and optionally `mime_type` and `file_name`. Do not invent these values. Pass the file through the host's file parameter mechanism. `sandbox:/mnt/data/...`, `file://...`, plain local paths and Base64 are not remote download URLs.

When `file_host_not_allowed` or `invalid_file_url` is returned, report the tool's `requestId` and safe `diagnostic` fields. Do not retry with a local path, fabricate a different URL or claim the file was saved. `host_not_allowlisted` needs administrator verification of the exact `hostname`; `https_required`/`invalid_url` needs correct host file forwarding, not a broader allowlist. A `redirect` stage identifies a blocked redirect target. Never include the original signed URL, its query, file ID or credentials in diagnostics. `get_upload_policy` returns `downloadDiagnosticsVersion: 1` on servers with this support.

File downloads use an HTTPS host allowlist. Expired URLs or unavailable file references require reattaching/reselecting the file. Some ChatGPT generation surfaces may not expose a reusable file reference; actual support must be checked in the connected account. Do not claim a generated image was uploaded without a successful tool result.

For an HTML document, local relative assets and `sandbox:` references are not automatically uploaded. Upload its dependencies separately and generate HTML referencing the returned public raw URLs, or create a self-contained file. Related files must remain public and retained at least as long as the document.

## Results and retries

Only a completed R2/filesystem write and metadata commit produce success. Results include ID, filename, byte size, SHA-256, visibility, lifecycle state, expiry dates and `replayed`.

Private files return `publicUrl: null`, `rawUrl: null` and an administrator-only `adminUrl`. Public active files return `/p/:slug` and `/raw/:slug` links. Never describe a private file as publicly shared.

Reuse `idempotency_key` when retrying. When omitted, PageVault derives a stable key from the file reference or inline text plus filename and settings. Same-key retries are replayable for 24 hours. Changed bytes/settings under the same explicit key return `idempotency_conflict`. A refreshed temporary download URL does not change the automatic file key. Automatic deduplication is per connection; reconnecting with a new authorization creates a separate scope.

## Disconnect

In **API Keys → ChatGPT / MCP**, revoke a connection to invalidate its access and refresh tokens immediately. Existing uploaded files are unaffected. API-key connections are revoked through the normal API-key list. Disabling `MCP_ENABLED` stops all MCP access without disabling the old REST upload API.

Deployment and capacity details are in the repository's `docs/mcp.md`.
