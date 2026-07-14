# PageVault

语言：[English](./README.md) | 简体中文

PageVault 是一个面向 HTML、Markdown 和图片文件的轻量级发布与生命周期管理系统。它私有存储原始上传文件，只通过应用网关暴露有效的公开 URL，并为单个管理员提供用于上传、过期时间、状态和删除流程的 Web 管理界面。

产品名称使用 `PageVault`；部署标识、包作用域和数据路径统一使用小写形式 `pagevault`。

## 架构

- Cloudflare 优先：Workers、Workers Static Assets、R2、D1 和 Cron Triggers。
- Docker 兼容：Node.js 22、SQLite、本地文件存储，以及同一套核心服务包。
- 业务逻辑位于 `packages/core`；Cloudflare 和 Docker 代码是适配器。

## 部署前置条件

- Node.js 22。安装 Node 后，启用 Corepack 并安装依赖：

  ```bash
  corepack enable
  pnpm install
  ```

  Corepack 是现代 Node.js 自带的包管理器代理工具。它会读取 `package.json` 里的 `packageManager` 字段，并启用对应版本的包管理器。本仓库声明的是 `pnpm@10.15.0`。`pnpm install` 会安装 monorepo 依赖，后续 `pnpm run build` 会构建所有包。

- 如果使用 Cloudflare 部署，需要一个 Cloudflare 账号，以及一个已经添加到 Cloudflare DNS 的域名。Cloudflare 把托管的根域名称为 zone，例如 `example.com`。添加 Custom Domain 前，zone 应处于 active 状态。实际操作上，这通常意味着你已经在 Cloudflare 添加域名，并在域名注册商处把 nameservers 改成 Cloudflare 提供的 nameservers。
- 生产环境需要两个主机名：
  - 管理端主机名，例如 `admin-html.example.com`
  - 公开访问主机名，例如 `h.example.com`
- 单管理员账号的密码哈希：

  ```bash
  pnpm tsx scripts/hash-password.ts
  ```

  尽量使用交互式提示输入密码。把密码作为命令参数传入可能会留下 shell history。

- 一个足够长的随机 `SESSION_SECRET`，例如：

  ```bash
  openssl rand -base64 32
  ```

## Cloudflare 部署

Cloudflare 模式会把同一个 Worker 绑定到两个主机名。Worker 是运行 PageVault 的 Cloudflare serverless 应用：它通过 Workers Static Assets 提供管理端 SPA，用 D1 存储元数据，用私有 R2 bucket 存储原始文件，并通过配置的 Cron Trigger 执行清理。

1. 通过 Wrangler 登录 Cloudflare。

   ```bash
   pnpm wrangler login
   pnpm wrangler whoami
   ```

   Wrangler 是 Cloudflare 的命令行工具。本仓库建议用 `pnpm wrangler ...` 调用它，这样会使用 `apps/worker/package.json` 中固定的 Wrangler 版本。`pnpm wrangler login` 会打开浏览器，让你授权 Wrangler。`pnpm wrangler whoami` 用来确认当前命令会操作哪个 Cloudflare 账号。

2. 创建资源前，先检查 `apps/worker/wrangler.jsonc`。

   不要把真实运行时值写入这个 Git 跟踪文件。如果你修改了 R2 bucket 名、D1 数据库名或 Worker 名，要同步更新 `wrangler.jsonc` 中的对应配置。`PUBLIC_BASE_URL`、`ADMIN_BASE_URL`、`SESSION_SECRET` 等运行时值只在 `secrets.required` 中声明，真实值来自被忽略的 `.env` 文件。

   这个文件里几个重要配置的含义：

   - `name`：Worker 名称，默认是 `pagevault`。
   - `assets`：告诉 Wrangler 管理端前端构建产物在 `apps/admin/dist`。
   - `r2_buckets`：把私有 R2 bucket 绑定到 Worker。应用代码读取 `HTML_BUCKET` 这个 binding，因此不要改这个 binding 名。
   - `d1_databases`：通过 `pagevault-db` 名称把 D1 数据库绑定到 Worker；账号专属的数据库 UUID 不提交到仓库。
   - `triggers`：配置每天执行清理任务的 Cron Trigger。
   - `secrets.required`：声明 Wrangler 本地开发时要从 `.env` 文件加载、部署时要从 Cloudflare secrets 提供的运行时键。

3. 创建私有 R2 bucket。

   ```bash
   pnpm wrangler r2 bucket create pagevault-files
   ```

   R2 是 Cloudflare 的对象存储。PageVault 用这个 bucket 保存上传的原始文件。不要把这个 bucket 设为公开。公开 R2 访问会绕过 PageVault 的过期时间、状态、删除、审计和访问次数检查。

4. 创建 D1 数据库。

   ```bash
   pnpm wrangler d1 create pagevault-db
   ```

   D1 是 Cloudflare 的 SQLite 兼容数据库。PageVault 用它保存 slug、状态、过期时间、访问计数等元数据。Wrangler 会通过仓库中配置的 `pagevault-db` 数据库名解析 binding，因此无需提交账号专属的 `database_id`。

5. 将 D1 迁移应用到远端数据库。

   ```bash
   pnpm wrangler d1 migrations apply pagevault-db --remote
   ```

   这一步会创建 PageVault 需要的数据表。这里要使用 `--remote`，因为目标是生产环境的 Cloudflare D1 数据库，不是 Wrangler 本地开发数据库。

6. 准备 Worker 运行时 secrets 文件。

   以 `apps/worker/.env.example` 作为键名模板，把真实部署值放到 `apps/worker/.env.production`。这个文件已被 Git 忽略，并会通过 Wrangler 的 `--secrets-file` 上传。

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

   将 `PUBLIC_BASE_URL` 和 `ADMIN_BASE_URL` 改为你的真实 origin，不要带结尾斜杠。将 `ADMIN_PASSWORD_HASH` 改为 `scripts/hash-password.ts` 的输出，将 `SESSION_SECRET` 改为生成的随机 secret。不要提交填好真实值的文件。

7. 构建并部署。

   ```bash
   pnpm run build
   pnpm --filter @pagevault/worker run deploy
   ```

   这个部署脚本会在 `apps/worker` 目录运行 `wrangler deploy --keep-vars --secrets-file .env.production`。如果只想预检而不上传，可执行 `pnpm --filter @pagevault/worker run deploy:dry-run`。你不需要在部署前手动创建 Worker。首次部署时，Wrangler 会根据 `wrangler.jsonc` 中的 `name` 创建 Worker；后续部署会更新同一个 Worker。

8. 首次成功部署后，再添加 Custom Domains。

   在 Cloudflare dashboard 中打开已经部署好的 `pagevault` Worker，然后进入该 Worker 的 Domains & Routes 区域。添加这两个 Worker custom domains：

   ```text
   admin-html.example.com
   h.example.com
   ```

   选择拥有根域名的 Cloudflare zone，例如 `example.com`。Cloudflare 会为 custom domain 管理 Worker 路由和证书。如果某个 hostname 已经有冲突的 DNS 记录，需要先删除或调整那条记录。

   Custom Domain 会把一个主机名直接指向 Worker，这是本项目在 Cloudflare 上推荐的方式。只有当你明确想在已有 Cloudflare 代理 DNS 记录上使用 route pattern 时，才使用 Workers routes。Route 更适合 Worker 放在已有源站前面的场景；PageVault 的 Cloudflare 模式通常没有单独源站。Route pattern 例如：

   ```text
   admin-html.example.com/* -> pagevault
   h.example.com/*          -> pagevault
   ```

   应用会根据请求中的 `Host` header 判断当前是管理端还是公开访问端。

9. 验证部署。

   - 打开 `ADMIN_BASE_URL`，使用 `ADMIN_EMAIL` 和原始管理员密码登录。
   - 在管理端上传一个小的受支持文件。
   - 打开 `PUBLIC_BASE_URL` 下生成的公开 URL。
   - 确认公开根路径、公开主机名上的管理路径、公开主机名上的 API 路径没有被暴露。
   - 测试时如需查看实时 Worker 日志，可使用 `pnpm wrangler tail`。

仓库包含 `.github/workflows/deploy.yml`，用于自动部署到 Cloudflare。它会在推送到 `main` 时运行，也可以通过 `workflow_dispatch` 手动触发。workflow 会安装依赖、执行类型检查和测试、构建管理端 SPA 和 Worker、从 GitHub Secrets 写入被忽略的 `apps/worker/.env.production`，然后执行 `wrangler deploy --keep-vars --secrets-file .env.production`。

启用自动部署前，建议在受保护的 `production` environment 中配置这些 GitHub Secrets：

1. 在 GitHub 打开这个仓库，进入 **Settings -> Environments -> New environment**。
2. environment 名称填写 `production`，然后点击 **Configure environment**。名称必须和 workflow 里的 `environment: production` 完全一致。
3. 在 **Deployment branches and tags** 中选择 **Selected branches and tags**，添加 `main` 分支规则并保存。
4. 可选：启用 **Required reviewers**，这样生产部署需要审核通过后，job 才能读取 environment secrets 并继续执行。
5. 在 **Environment secrets** 中点击 **Add secret**，逐个添加下面这些名称。这里要添加到 Secrets，不是 Variables，因为 workflow 用的是 `secrets.*` 读取。

如果你的 GitHub 套餐或仓库类型看不到 Environments，可以退回到 **Settings -> Secrets and variables -> Actions -> Repository secrets**，添加同名 repository secrets。workflow 也能读取这些 secrets，但不会有 environment 审核保护。

先在 Cloudflare 中准备这两个凭据值，再回到 GitHub 添加 secrets。

`CLOUDFLARE_ACCOUNT_ID` 是拥有这个 Worker、R2 bucket 和 D1 数据库的 Cloudflare account ID。可以用下面任意一种方式获取：

- 通过 URL：登录 Cloudflare dashboard 后，看浏览器地址栏。account ID 通常就是 `dash.cloudflare.com/` 后面那串很长的字母数字字符串，例如 `https://dash.cloudflare.com/1234567890abcdef1234567890abcdef/...`。
- 通过 Workers & Pages：进入 **Workers & Pages**，在 **Account details** 区域复制 **Account ID**。
- 通过域名概览页：打开任意已接入 Cloudflare 的站点，进入 **Overview**，找到 **API** 模块，复制其中的 **Account ID**。

`CLOUDFLARE_API_TOKEN` 是用于 CI 部署的 API token，需要手动生成：

1. 在 Cloudflare dashboard 点击右上角头像，进入 **My Profile -> API Tokens**。
2. 点击 **Create Token**。
3. 如果有 **Edit Cloudflare Workers** 模板，优先使用这个模板；也可以选择 **Create Custom Token**，只授予部署本 account 下 Workers 所需的最小权限。
4. 将 token 的资源范围限制到本项目部署使用的 Cloudflare account。
5. 点击 **Continue to summary**，确认权限后点击 **Create Token**。
6. 立即复制生成的 token。Cloudflare 只会显示这一次。把它保存为 GitHub Secret `CLOUDFLARE_API_TOKEN` 或放进密码管理器，不要提交到仓库。

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

部署 workflow 不会自动执行 D1 migrations。schema migrations 发生变化时，请在发布前或发布时显式执行 `pnpm wrangler d1 migrations apply pagevault-db --remote`。

### Cloudflare 常见问题

- 需要先在 dashboard 里创建 Worker 吗？
  不需要。使用 Wrangler。`pnpm --filter @pagevault/worker run deploy` 会根据 `apps/worker/wrangler.jsonc` 创建或更新 Worker。
- 什么时候添加 Custom Domains？
  首次成功部署后再添加，因为 dashboard 需要先有一个已存在的 Worker 才能绑定 custom domain。
- 为什么需要两个域名？
  管理端 UI 和公开 HTML 网关有意使用不同主机名。session cookie 只作用于管理端主机名，公开主机名只提供有效的已发布 HTML URL。
- 如果后续修改 `ADMIN_BASE_URL` 或 `PUBLIC_BASE_URL` 怎么办？
  修改 `apps/worker/.env.production`，执行 `pnpm --filter @pagevault/worker run deploy`，同时确保 Cloudflare 里的 custom domain 也对应新的主机名。
- Custom Domain 访问不了怎么办？
  确认根域名在 Cloudflare 中处于 active 状态、该 hostname 没有冲突 DNS 记录，并且 Worker dashboard 中 custom domain 的状态已经 active。
- 部署后 Worker 返回 500 怎么办？
  先用 `pnpm wrangler secret list` 确认所有 required runtime secrets 都存在，再用 `pnpm wrangler tail` 查看实时日志。

## Docker 部署

Docker 模式使用同一套服务层，运行在 Node.js 22、SQLite 和本地对象存储之上。

Docker 是不使用 Cloudflare 托管运行时的部署方式。它不用 D1 和 R2，而是把元数据存到 SQLite，把文件存到本地磁盘。你仍然需要两个主机名，因为 PageVault 会根据请求的 `Host` header 判断请求属于管理端还是公开访问端。

1. 准备主机专用的 compose 文件。

   将 `docker/docker-compose.example.yml` 复制到部署位置，例如 `/opt/pagevault/docker-compose.yml`，然后替换所有示例域名、邮箱和 secrets。如果文件中包含真实 secrets，不要提交到 Git。

2. 设置必需的运行时值。

   示例 compose 文件已经包含 Docker 模式所需的核心变量：

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

   将 `ADMIN_PASSWORD_HASH` 替换为 `pnpm tsx scripts/hash-password.ts` 的输出，将 `SESSION_SECRET` 替换为足够长的随机值。

3. 启动服务：

   ```bash
   docker compose -f /opt/pagevault/docker-compose.yml up -d --build
   ```

   容器 entrypoint 会在启动服务前执行 SQLite 迁移。元数据和上传的对象默认存储在 `/data/pagevault` 下，因此该目录必须持久化并纳入备份。

4. 配置 TLS 和反向代理。

   将两个主机名都转发到同一个容器端口，并保留原始 `Host` header：

   ```text
   admin-html.example.com -> http://127.0.0.1:13080
   h.example.com          -> http://127.0.0.1:13080
   ```

   HTTPS 应在反向代理层终止。不要让反向代理直接暴露 `/data/pagevault`。

   保留 `Host` 是必需的。如果反向代理把所有请求都改写成 `127.0.0.1`，PageVault 就无法判断请求来自管理端主机名还是公开访问主机名。

5. 验证 Docker 部署：

   ```bash
   docker compose -f /opt/pagevault/docker-compose.yml ps
   docker compose -f /opt/pagevault/docker-compose.yml logs -f pagevault
   ```

   然后在管理端主机名登录、上传一个小的受支持文件，并在公开访问主机名打开生成的公开 URL。

6. 安全升级。

   先备份 `/data/pagevault/pagevault.sqlite` 和 `/data/pagevault/objects`，再更新镜像或代码仓库，并重建重启：

   ```bash
   docker compose -f /opt/pagevault/docker-compose.yml up -d --build
   ```

   当前 schema 的启动迁移是幂等的。

## 环境变量

| 名称                       | 位置                           | 必需 | 说明                                                      |
| -------------------------- | ------------------------------ | ---- | --------------------------------------------------------- |
| `ADMIN_EMAIL`              | Cloudflare secret / Docker env | 是   | 单个管理员邮箱。                                          |
| `ADMIN_PASSWORD_HASH`      | Cloudflare secret / Docker env | 是   | 由 `scripts/hash-password.ts` 生成的 PBKDF2-SHA256 哈希。 |
| `SESSION_SECRET`           | Cloudflare secret / Docker env | 是   | 用于签名 session cookie 的密钥。                          |
| `APP_ENV`                  | Cloudflare secret / Docker env | 建议 | 部署时使用 `production`。                                 |
| `ADMIN_BASE_URL`           | Cloudflare secret / Docker env | 是   | 管理端 origin，例如 `https://admin-html.example.com`。    |
| `PUBLIC_BASE_URL`          | Cloudflare secret / Docker env | 是   | 公开访问 origin，例如 `https://h.example.com`。           |
| `DEFAULT_URL_EXPIRE_DAYS`  | Cloudflare secret / Docker env | 否   | 默认为 `7`。                                              |
| `DEFAULT_FILE_EXPIRE_DAYS` | Cloudflare secret / Docker env | 否   | 默认为 `180`。                                            |
| `MAX_UPLOAD_SIZE_MB`       | Cloudflare secret / Docker env | 否   | 默认为 `10`。                                             |
| `RUNTIME`                  | Docker env                     | 是   | 使用 `node`。                                             |
| `DB_DRIVER`                | Docker env                     | 是   | 使用 `sqlite`。                                           |
| `STORAGE_DRIVER`           | Docker env                     | 是   | 使用 `local`。                                            |
| `SQLITE_PATH`              | Docker env                     | 否   | SQLite 文件路径，默认为 `/data/pagevault/pagevault.sqlite`。  |
| `LOCAL_STORAGE_DIR`        | Docker env                     | 否   | 本地对象目录，默认为 `/data/pagevault/objects`。            |
| `PORT`                     | Docker env                     | 否   | 容器内 HTTP 端口，默认为 `3000`。                         |

## 安全模型

公开用户只能通过 `/p/:slug`、`/p/:slug/` 或 `/p/:slug.html` 请求单个已发布文件。网关会在读取存储前检查元数据、可见性、状态、URL 过期时间和文件过期时间。公开根路径、列表、sitemap 路径、管理路由和 API 都返回 `404`。

R2 bucket 不能公开。公开的 R2 bucket 会绕过 URL 过期时间、状态检查、删除状态、审计日志和访问计数。所有对象读取都必须通过 Worker 或 Docker server 网关。

管理端和公开访问端应使用不同主机名。`pagevault_session` cookie 只作用于管理端主机；它不能设置到父域名，例如 `.example.com`。

PageVault 有意不对上传的 HTML 进行清理、重写、脚本注入或任何其他修改。Markdown 会以原始字节存储，并在公开访问时禁用原始 HTML 后渲染；图片会按上传字节返回。只有经过身份验证的管理员可以上传文件。

## 迁移与维护

- Cloudflare 迁移：`pnpm wrangler d1 migrations apply pagevault-db --remote`。
- Docker 迁移：容器 entrypoint 会在提供服务前运行迁移。本地 Node 运行可使用 `pnpm tsx scripts/local-migrate.ts`。
- Cloudflare 日志：使用 `pnpm wrangler tail`。
- Docker 日志：使用 `docker compose -f /opt/pagevault/docker-compose.yml logs -f pagevault`。
- 轮换管理员凭据时，先生成新的密码哈希并更新 `ADMIN_PASSWORD_HASH`；如需让现有 session 失效，可同时轮换 `SESSION_SECRET`。
