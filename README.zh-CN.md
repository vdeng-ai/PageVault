# PageVault

[![CI](https://github.com/vdeng-ai/PageVault/actions/workflows/ci.yml/badge.svg)](https://github.com/vdeng-ai/PageVault/actions/workflows/ci.yml)
[![Docker](https://github.com/vdeng-ai/PageVault/actions/workflows/docker.yml/badge.svg)](https://github.com/vdeng-ai/PageVault/actions/workflows/docker.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

语言：[English](./README.md) | 简体中文

PageVault 是一个面向 HTML、Markdown 和图片文件的轻量级自托管发布与生命周期管理系统。它私有存储原始文件，只通过应用网关暴露有效的公开 URL，并为单个管理员提供专注、清晰的 Web 管理界面。

![PageVault 上传页面，包含文件、可见性和保留期限设置](./docs/assets/pagevault-upload.png)

## 核心功能

- 发布 `.html`、`.htm`、`.md`、`.markdown`、`.jpg`、`.jpeg`、`.png` 和 `.webp` 文件。
- 分别控制公开 URL 的有效期和原始文件的保留期限。
- 切换公开或私有状态、停用访问、恢复记录或删除文件。
- 通过仪表盘查看文件状态、访问次数、过期情况和即将清理的文件。
- R2 bucket 和本地对象存储始终保持私有，所有公开读取都经过 PageVault 校验。
- 可部署到 Cloudflare Workers，也可使用 Docker 运行同一套服务。
- 管理界面支持英文、简体中文，以及浅色和深色主题。

## 架构

PageVault 将业务逻辑集中在 `packages/core`，并为不同运行环境提供适配器：

| 运行环境   | 应用                           | 元数据 | 对象存储       |
| ---------- | ------------------------------ | ------ | -------------- |
| Cloudflare | Worker + Workers Static Assets | D1     | 私有 R2 bucket |
| Docker     | Node.js 22                     | SQLite | 本地文件       |

生产环境使用相互独立的管理端和公开访问主机名。服务根据请求的 `Host` header 选择管理界面或公开发布网关，并统一执行可见性、状态和过期时间检查。

## 开始使用

安装 [Node.js 22](https://nodejs.org/)，然后启用仓库固定版本的包管理器并安装依赖：

```bash
corepack enable
pnpm install
```

生成两种部署方式都需要的管理员密码哈希：

```bash
pnpm tsx scripts/hash-password.ts
```

然后选择部署方式：

| 目标       | 适用场景                                 | 指南                                           |
| ---------- | ---------------------------------------- | ---------------------------------------------- |
| Cloudflare | 使用 D1 和 R2 的托管 serverless 运行环境 | [Cloudflare 部署](./docs/cloudflare-deploy.md) |
| Docker     | 使用 SQLite 和本地磁盘的自管理服务器     | [Docker 部署](./docs/docker-deploy.md)         |

面向贡献者的本地开发流程请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 文档

- [配置参考](./docs/configuration.md)
- [Cloudflare 部署](./docs/cloudflare-deploy.md)
- [Docker 部署](./docs/docker-deploy.md)
- [HTTP API](./docs/api.md)
- [运行时安全模型](./docs/security.md)
- [漏洞报告方式](./SECURITY.md)

详细技术与协作文档统一使用英文维护，以避免双份文档长期产生差异。

## 开发

仓库的主要检查命令如下：

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

本地服务、环境配置和 Pull Request 要求请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 参与贡献

欢迎提交 Issue 和 Pull Request。提出改动前，请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。安全漏洞必须按照 [SECURITY.md](./SECURITY.md) 私下报告，请勿创建公开 Issue。

## 许可证

PageVault 基于 [MIT License](./LICENSE) 开源。
