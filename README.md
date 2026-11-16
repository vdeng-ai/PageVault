# PageVault

### Turn AI-made files into links you can share anywhere.

Language: English | [简体中文](./README.zh-CN.md)

PageVault is a personal, self-hosted publishing tool for AI-generated pages, reports, documents and images. Upload from the web workspace, send a file from ChatGPT, or use an upload API key. The original file is preserved, and a share link makes it easy to open in a browser, WeChat or another messaging app.

**Upload → get a link → share.**

![PageVault publishing workspace with a Markdown preview](./docs/assets/pagevault-upload-en.jpg)

## What you can do

- **Publish pages and documents** — Share interactive HTML, Markdown, PDF, SVG and images without building a website.
- **Upload from ChatGPT** — Save a generated file or attachment that ChatGPT can reference, and receive its PageVault link in the conversation.
- **Control access and lifetime** — Choose public or private, change link validity and file retention, or disable a share.
- **Read and download** — Preview supported files in a browser and retrieve their original bytes. Markdown supports Mermaid diagrams.
- **Keep it personal** — Manage your own library with a single administrator account, an English or Chinese interface, and light or dark themes.

## Default upload settings

| Setting             | Default     |
| ------------------- | ----------- |
| Visibility          | **Public**  |
| Share-link validity | **15 days** |
| File retention      | **30 days** |
| Maximum file size   | **10 MiB**  |

**Anyone with a public link can view the file.** Choose private in the workspace, or explicitly ask for private storage in ChatGPT, when it should only be available to the administrator. Private uploads return an authenticated admin link rather than a public link.

The two expiry periods are independent. After 15 days the default share link stops working, but the administrator can still access the retained file until its 30-day retention ends. Retention-expired files become inaccessible and are removed by scheduled cleanup. Change either period when uploading or later in the workspace while the file is retained. An administrator can configure different instance defaults; previously uploaded files keep their saved settings.

## Upload in the browser

1. Sign in to your PageVault workspace and open the upload page. Drag in a file or select it from your device.
2. Check the preview and publishing settings. Keep the defaults for a public 15-day link and 30-day file retention, or choose private/custom periods.
3. Upload, then copy the share link to a conversation or send it to the intended recipients.

Use the **share link** for the PageVault viewer. Use the **original-file link** when you need the original content. Both follow the file's visibility and expiry rules.

## Upload from ChatGPT

### Connect once

In PageVault, open **API Keys → ChatGPT / MCP** and copy the MCP endpoint and Client ID. MCP must already be enabled on the instance; the [connection guide](./docs/mcp.md#configure-before-enabling) explains setup for the administrator.

Add PageVault through a ChatGPT custom MCP/plugin connection flow that supports predefined OAuth clients:

| Field          | Value                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| MCP URL        | The endpoint copied from PageVault                                                                                  |
| Transport      | Streamable HTTP                                                                                                     |
| Authentication | OAuth                                                                                                               |
| Client ID      | The value shown in PageVault                                                                                        |
| Client Secret  | Leave empty for the standard public client; use a secure credential field only when configured by the administrator |
| Scope          | `assets:upload`                                                                                                     |

Sign in to PageVault when prompted and approve upload access. Do not paste passwords or API keys into the conversation. Once connected, select PageVault when asking ChatGPT to upload a file.

### Ask in the conversation

To use the defaults:

> Upload this file to PageVault and give me the share link.

To keep it private:

> Save this file privately to PageVault. Do not share it publicly.

To choose different periods:

> Publish this report to PageVault with a 7-day link and retain the file for 60 days.

A successful upload returns the actual visibility, expiry dates and a share link or authenticated admin link. If the file reference is unavailable or expired, reattach or reselect the file. Do not substitute a local file path for an attachment.

When upgrading an existing connection, refresh its tool definitions so it no longer applies the old private-by-default behavior. A connection installed from a private plugin package also needs its updated upload instructions. An explicit private request always remains private.

You can revoke a connection in **API Keys → ChatGPT / MCP**. Revocation stops future tool access without deleting saved files. ChatGPT's upload tools cannot browse your library, read private files or delete assets.

## Manage shared content

Find files in the workspace by title, filename, format, status or date. Open a file to preview it, copy its links, rename it, change visibility, adjust expiry, disable sharing or delete it. Private files can be previewed after signing in; making a file private prevents public access.

For uploads from another application, create an upload-only key on the **API Keys** page and follow its built-in instructions or the [upload API guide](./apps/admin/public/upload-api.md). Keep keys secret and revoke any no longer needed.

## Supported content

| Content            | Formats                          |
| ------------------ | -------------------------------- |
| Interactive pages  | `.html`, `.htm`                  |
| Markdown documents | `.md`, `.markdown`               |
| PDF documents      | `.pdf`                           |
| Vector images      | `.svg`                           |
| Raster images      | `.png`, `.jpg`, `.jpeg`, `.webp` |

Markdown diagrams use a `mermaid` fenced code block:

````markdown
```mermaid
flowchart LR
  A[Upload] --> B[Share]
```
````

PageVault stores one file per upload. An HTML page's local image, CSS or JavaScript dependencies are not imported automatically: use a self-contained page or dependencies already available through valid URLs. Office documents, videos, ZIP websites and format conversion are not supported.

## Set up your own PageVault

Use the [Cloudflare setup guide](./docs/cloudflare-deploy.md) or the [Docker setup guide](./docs/docker-deploy.md). Cloudflare is designed for a lightweight personal deployment; actual costs depend on your account's usage and storage. See the [configuration guide](./docs/configuration.md) to adjust your instance's defaults.

PageVault is available under the [MIT License](./LICENSE).
