# HTMLBed

语言：[English](./README.md) | 简体中文

HTMLBed 是一个轻量级 HTML 发布与生命周期管理系统。它私有存储原始 HTML 文件，只通过应用网关暴露有效的公开 URL，并为单个管理员提供用于上传、过期时间、状态和删除流程的 Web 管理界面。

## 架构

- Cloudflare 优先：Workers、Workers Static Assets、R2、D1 和 Cron Triggers。
- Docker 兼容：Node.js 22、SQLite、本地文件存储，以及同一套核心服务包。
- 业务逻辑位于 `packages/core`；Cloudflare 和 Docker 代码是适配器。

## Cloudflare 部署

1. 安装依赖：`pnpm install`。
2. 创建私有 R2 bucket：`pnpm wrangler r2 bucket create htmlbed-files`。
3. 创建 D1 数据库：`pnpm wrangler d1 create htmlbed-db`。
4. 将返回的 D1 `database_id` 写入 `apps/worker/wrangler.jsonc`。
5. 应用迁移：`pnpm --filter @htmlbed/worker wrangler d1 migrations apply htmlbed-db --remote`。
6. 生成密码哈希：`pnpm tsx scripts/hash-password.ts`。
7. 使用 `wrangler secret put` 设置 Worker secrets：`ADMIN_EMAIL`、`ADMIN_PASSWORD_HASH` 和 `SESSION_SECRET`。
8. 将两个自定义域名配置到同一个 Worker：`admin-html.example.com/*` 和 `h.example.com/*`。
9. 构建并部署：`pnpm run build`，然后执行 `pnpm --filter @htmlbed/worker wrangler deploy`。

Cloudflare 会在推送到 `main` 时通过 `.github/workflows/deploy-cloudflare.yml` 从 GitHub 部署。该 workflow 需要的仓库 secrets 是 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`。Worker 运行时 secrets 需要用 Wrangler 手动初始化，不会存储在 GitHub 中。

## Docker 部署

1. 生成 `ADMIN_PASSWORD_HASH`：`pnpm tsx scripts/hash-password.ts`。
2. 复制 `docker/docker-compose.example.yml`，并设置真实的域名和 secrets。
3. 启动服务：`docker compose -f docker/docker-compose.example.yml up -d --build`。
4. 将两个域名反向代理到容器端口，例如：
   - `admin-html.example.com -> http://127.0.0.1:13080`
   - `h.example.com -> http://127.0.0.1:13080`

Docker 默认将 SQLite 元数据和 HTML 对象存储在 `/data/htmlbed` 下。

## 环境变量

| 名称 | 必需 | 说明 |
| --- | --- | --- |
| `ADMIN_EMAIL` | 是 | 单个管理员邮箱。 |
| `ADMIN_PASSWORD_HASH` | 是 | 由 `scripts/hash-password.ts` 生成的 PBKDF2-SHA256 哈希。 |
| `SESSION_SECRET` | 是 | 用于签名 session cookie 的密钥。 |
| `ADMIN_BASE_URL` | 是 | 管理端 origin，例如 `https://admin-html.example.com`。 |
| `PUBLIC_BASE_URL` | 是 | 公开访问 origin，例如 `https://h.example.com`。 |
| `DEFAULT_URL_EXPIRE_DAYS` | 否 | 默认为 `7`。 |
| `DEFAULT_FILE_EXPIRE_DAYS` | 否 | 默认为 `180`。 |
| `MAX_UPLOAD_SIZE_MB` | 否 | 默认为 `10`。 |
| `SQLITE_PATH` | Docker | SQLite 文件路径。 |
| `LOCAL_STORAGE_DIR` | Docker | 本地对象目录。 |
| `PORT` | Docker | HTTP 端口，默认为 `3000`。 |

## 安全模型

公开用户只能通过 `/p/:slug`、`/p/:slug/` 或 `/p/:slug.html` 请求单个 HTML 文件。网关会在读取存储前检查元数据、可见性、状态、URL 过期时间和文件过期时间。公开根路径、列表、sitemap 路径、管理路由和 API 都返回 `404`。

R2 bucket 不能公开。公开的 R2 bucket 会绕过 URL 过期时间、状态检查、删除状态、审计日志和访问计数。所有对象读取都必须通过 Worker 或 Docker server 网关。

管理端和公开访问端应使用不同主机名。`htmlbed_session` cookie 只作用于管理端主机；它不能设置到父域名，例如 `.example.com`。

HTMLBed 有意不对上传的 HTML 进行清理、重写、脚本注入或任何其他修改。只有经过身份验证的管理员可以上传文件，系统会存储并返回原始字节。

## 迁移

Cloudflare：`pnpm --filter @htmlbed/worker wrangler d1 migrations apply htmlbed-db --remote`。

Docker：`pnpm tsx scripts/local-migrate.ts`，或启动容器；容器 entrypoint 会先运行迁移再提供服务。

## 未来计划

计划扩展包括图片上传、Markdown 发布、更强的访问分析和标签。
