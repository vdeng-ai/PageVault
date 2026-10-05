# PageVault 已选深色方案：实现与实测

本目录保存用户选定的图 3 风格，以及浏览器实际渲染的对照证据。每张 `*-comparison.jpg` 左侧是已确认设计稿，右侧是实际页面；数据来自本地 SQLite 测试环境。测试文件、登录配置和数据库均未提交。

| 页面或状态               | 设计与实现对照                                           |
| ------------------------ | -------------------------------------------------------- |
| 上传前预览与发布设置     | [upload-comparison.jpg](upload-comparison.jpg)           |
| 发布成功、链接复制       | [success-comparison.jpg](success-comparison.jpg)         |
| 内容管理、选中与操作菜单 | [files-comparison.jpg](files-comparison.jpg)             |
| 详情编辑、未保存状态     | [detail-comparison.jpg](detail-comparison.jpg)           |
| 统计概览                 | [stats-comparison.jpg](stats-comparison.jpg)             |
| API 密钥列表             | [keys-comparison.jpg](keys-comparison.jpg)               |
| 密钥创建成功             | [created-key-comparison.jpg](created-key-comparison.jpg) |
| 公开 Markdown 阅读       | [reader-comparison.jpg](reader-comparison.jpg)           |
| 链接失效 410             | [expired-comparison.jpg](expired-comparison.jpg)         |

手机端实际页面见 [mobile-preview.jpg](mobile-preview.jpg)。`*-focus.jpg` 和 `reader-header-focus.jpg` 用于检查表单、表格、字体及品牌细节。

截图中的域名、记录数、文件大小、时间和对象键属于测试数据，与设计稿示例值不同。密钥成功截图中的临时测试密钥已撤销，不能用于生产服务。阅读页内容来自实际上传的 Markdown，目录按文档标题自动生成。

**当前视觉验收尚未完成。** 登录页现有截图为不同视口的早期证据；手机上传、手机弹窗及浅色主题还需最终复核。对照中发现的密钥弹窗字号、成功图标和 410 页面位置已调整，但浏览器安全策略阻止了后续截图，因此本目录这些对照记录的是调整前页面。完整限制与迭代记录见项目根目录 [design-qa.md](../../../design-qa.md)。

## 已保留和验证的行为

- HTML、Markdown、JPG、PNG、WebP 上传；替换、移除文件；发布前预览。
- 公开或私有访问、链接有效期、文件保留期和自定义天数。
- 发布成功后复制普通或编码链接、预览、详情、继续上传。
- 内容搜索、状态与访问方式筛选、分页、批量延期、公开或私有、停用或恢复、删除确认。
- 详情编辑、保存、重置、未保存提示、对象键与 SHA-256 复制。
- 六项真实统计指标；API 密钥创建、仅一次展示、复制及撤销。
- 中英语言、系统或浅色或深色主题；手机底部导航。
- Markdown 显式锚点、目录跳转、返回顶部；HTML 原有交互。

新增的私有预览使用管理员会话认证，禁止缓存，并将上传 HTML 放入不具备管理员同源权限的沙箱。安全边界和接口说明见 [security.md](../../security.md) 与 [api.md](../../api.md)。

## 验证

本次本地 `pnpm run typecheck`、`pnpm run lint`、`pnpm run test`、`pnpm run build` 已通过，测试为 20 个文件、107 项。冻结锁文件安装通过。修改的代码和文档使用 Prettier；全仓库格式检查仍有原有格式问题，未批量重排无关文件和 pnpm 生成的锁文件。

浏览器中已实测发布、普通及编码链接复制、详情保存、密钥创建与撤销、目录跳转，以及私有 HTML 按钮交互。手机列表、详情、密钥页测得 `scrollWidth === clientWidth === 380`，对应 390 px 视口和 10 px 滚动条。

新增 5 项 React/jsdom 回归测试，验证弹窗关闭后的焦点恢复、请求进行中的焦点约束，以及剪贴板 API 不可用时的错误提示和完整密钥重试复制。这些交互修复没有新增截图，仍需浏览器复核；本目录已有图片的拍摄时间与状态不变。

合并前需要补齐视觉验收，并确认 PR 最新提交的 GitHub CI 和 Docker 构建结果。
