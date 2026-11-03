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
| `USER_GUIDE.md` | 最终用户 | 环境要求、安装、服务脚本、登录流程、API Key、`/v1/models`、流式/非流式调用、OpenAI SDK 示例、支持范围、常见故障、安全建议 |
| `DEVELOPMENT.md` | 维护者 | 开发目标、技术栈与目录、运行时架构、配置加载、凭据与 Key 状态、登录捕获、已验证上游协议、SSE 解析器、本地 HTTP API、测试、修改指南、发布检查清单、当前限制 |

根目录 `README.md` 是快速入口，链接到上述两份文档。

## 与源码的对应关系

| 文档主题 | 对应源码 |
| --- | --- |
| 配置合并 | `src/config.js` |
| 本地路由与 OpenAI 响应 | `src/server.js` |
| 上游请求、curl 回退、SSE | `src/upstream.js` |
| 登录、加密、API Key | `src/credentials.js` |
| 启动与环境变量 | `src/index.js` |
| 服务管理 | `scripts/chattoapi.ps1`、`scripts/daemon.mjs` |
| 测试 | `test/*.test.js` |

## 维护规则

1. 修改以下内容时，必须同步更新 `USER_GUIDE.md` 与 `DEVELOPMENT.md`：
   - 本地路由或认证方式。
   - 模型列表 / 别名。
   - 配置字段或环境变量。
   - 登录捕获路径、入口选择器、完成条件。
   - 上游 endpoint、请求体字段、SSE 语义。
   - 测试命令或覆盖范围。
2. 文档中不得出现真实 Cookie、Bearer Token、API Key、动态码、消息正文或本机绝对路径中的敏感信息。
3. 示例 Key 统一使用 `ctk_你的Key` 等占位形式。
4. 修改协议前先更新脱敏诊断与测试，再更新文档。

## 已知文档与实现的差异

- `USER_GUIDE.md` 的模型列表描述为 `deepseek-v4-flash`、`deepseek-v4-pro` 与兼容 GPT 别名；`src/server.js` 的 `/v1/models` 实际返回 `gpt-5.5`、`gpt-5.5-mini`、`gpt-5.1`、`deepseek-v4-flash`、`deepseek-v4-pro`，`mapModel()` 还包含 `gpt-5`、`gpt-4o`、`o3`、`o4-mini` 等别名。修改模型时以源码为准并同步三处。
- `DEVELOPMENT.md` 已说明当前账号对新版 `/f` endpoint 返回 `api mode not supported` 并回退到旧 endpoint；该行为与 `src/upstream.js` 一致。

## 相关文件清单

- `docs/USER_GUIDE.md`
- `docs/DEVELOPMENT.md`
- `README.md`（根目录）

## 变更记录

| 时间 | 变更 | 说明 |
| --- | --- | --- |
| 2026-11-03 00:19:02 | 初始化模块文档 | 合并现有文档信息；未修改原文档内容 |
