[根目录](../CLAUDE.md) > **docs**

# docs — 用户与开发文档

## 模块职责

`docs/` 保存项目现有的权威说明文档：

- 面向使用者：安装、启动、登录、API Key、调用示例、故障排查、安全建议。
- 面向开发者：架构、配置、凭据状态、登录捕获、上游协议、SSE 解析、测试、修改指南与发布检查清单。

本目录不包含可执行代码，不参与运行时。

## 入口与导航

| 文件 | 受众 | 内容 |
| --- | --- | --- |
| `USER_GUIDE.md` | 最终用户 | 环境要求、安装、服务脚本、本地 Web 控制台、登录流程、API Key、`/v1/models`、流式/非流式调用、OpenAI SDK 示例、支持范围、常见故障、安全建议 |
| `DEVELOPMENT.md` | 维护者 | 开发目标、技术栈与目录、运行时架构、配置加载、控制台安全模型、凭据与 Key 状态、登录捕获、已验证上游协议、SSE 解析器、本地 HTTP API、测试、修改指南、发布检查清单、当前限制 |

根目录 `README.md` 是快速入口，链接到上述两份文档。

## 与源码的对应关系

| 文档主题 | 对应源码 |
| --- | --- |
| 配置合并 | `src/config.js` |
| 本地路由与 OpenAI 响应 | `src/server.js` |
| 上游请求、curl 回退、SSE / Patch | `src/upstream.js`、`src/stations/` |
| 登录、加密、API Key | `src/credentials.js` |
| 本地控制台网关 | `src/ui-server.js` |
| 控制台前端 | `src/ui/` |
| 启动与环境变量 | `src/index.js` |
| 服务管理 | `scripts/service.mjs`、`scripts/chattoapi.ps1`、`scripts/daemon.mjs` |
| 测试 | `test/*.test.js` |

## 维护规则

1. 修改以下内容时，必须同步更新 `USER_GUIDE.md` 与 `DEVELOPMENT.md`：
   - 本地路由或认证方式（含 `/ui` 控制台与轮换双通道）。
   - 控制台安全模型、启动令牌或 `ui.*` 配置。
   - 模型列表 / 别名。
   - 配置字段或环境变量。
   - 登录捕获路径、入口选择器、完成条件。
   - 上游 endpoint、请求体字段、SSE 语义。
   - 测试命令或覆盖范围。
2. 文档中不得出现真实 Cookie、Bearer Token、API Key、动态码、消息正文、控制台启动令牌或本机绝对路径中的敏感信息。
3. 示例 Key 统一使用 `ctk_你的Key` 等占位形式。
4. 修改协议前先更新脱敏诊断与测试，再更新文档。

## 已知文档与实现的差异

- `USER_GUIDE.md` 的模型列表分为 Sorux 与 ChatGPT-Work 两组；`/v1/models` 实际返回 `gpt-5.5`、`gpt-5.5-mini`、`gpt-5.1`、`deepseek-v4-flash`、`deepseek-v4-pro`，以及本地有 Work 凭据时的 `work-gpt-6.1-terra`、`work-gpt-6.1-sol`、`work-gpt-6-sol`、`work-gpt-5.6-sol`。修改模型时以 `src/stations/model-catalog.js` 为准并同步三处。
- `DEVELOPMENT.md` 已说明当前账号对新版 `/f` endpoint 返回 `api mode not supported` 并回退到旧 endpoint；该行为仅适用于 Sorux，Work 站固定使用 `/backend-api/f/conversation`。

## 相关文件清单

- `docs/USER_GUIDE.md`
- `docs/DEVELOPMENT.md`
- `README.md`（根目录）

## 变更记录

| 时间 | 变更 | 说明 |
| --- | --- | --- |
| 2026-11-03 00:19:02 | 初始化模块文档 | 合并现有文档信息；未修改原文档内容 |
| 2026-11-03 21:30:00 | 同步控制台文档 | 用户指南新增 3.2，开发文档补充控制台安全模型、路由与配置 |
| 2026-11-04 01:31:00 | 同步 ChatGPT-Work 文档 | 用户指南新增站点登录与 6.5 工具活动；开发文档补充 Work 协议、凭据 v2 与测试 |
| 2026-11-04 02:10:00 | 同步审查修复 | 补充非流式快照、回退限制与动态码同源校验说明 |
| 2026-11-05 21:40:00 | 同步启动脚本 | 用户指南补充跨 shell 服务命令、`service:console` / `service:adopt`、双站点登录菜单项与 `login:sorux` / `login:work` |
