# 接入 magpie

将 ChatToAPI 注册为本机 magpie 网关的 `chatopens` provider，让客户端通过 magpie 统一调用。

## 链路与鉴权

```text
客户端
  → magpie 网关（127.0.0.1:3425）
  → provider chatopens
  → ChatToAPI（127.0.0.1:8787/v1）
  → Playwright
  → 上游 Chatopens
```

两层 API 鉴权分别配置：

| 链路 | 鉴权方式 |
| --- | --- |
| 客户端 → magpie | 使用 magpie 配置的网关 Key，客户端的 OpenAI base URL 为 `http://127.0.0.1:3425/v1` |
| magpie → ChatToAPI | provider 使用 ChatToAPI 的 `ctk_...` API Key，通过 `Authorization: Bearer ctk_...` 请求 |

上游账号登录凭据由 ChatToAPI 在本机管理，与这两层 API Key 分开。

## 快速开始

前提：已安装 magpie CLI，网关在 `127.0.0.1:3425` 运行，并已按[登录说明](../README.md#登录与凭据管理)完成 Chatopens 登录。

1. 在项目目录启动 ChatToAPI，并保持终端运行：

   ```powershell
   npm start
   ```

2. 在另一个终端注册 provider：

   ```powershell
   npm run magpie:register
   ```

脚本会自动获取新的 ChatToAPI API Key，通过 magpie CLI 注册 `chatopens`，并验证接入结果。自动取 Key 会轮换现有 Key，旧 Key 立即失效。

已有有效 Key 时，可以手工传入，避免自动轮换：

```powershell
npm run magpie:register -- --key ctk_xxx
```

客户端连接 magpie 的 `http://127.0.0.1:3425/v1`，使用网关 Key，并从网关 `/v1/models` 返回的列表中选择模型名称。

## 自动取 Key 的机制与代价

未传入 `--key` 时，脚本调用 ChatToAPI 的 `POST /auth/key/rotate` 获取明文 API Key。请求必须同时满足以下条件：

| 条件 | 要求 |
| --- | --- |
| 来源 | 仅允许回环连接，从本机直接访问 ChatToAPI |
| 请求头 | `X-ChatToAPI-Rotate: <本地主密钥的 SHA-256>`，正文类型为 `Content-Type: application/json` |
| JSON 正文 | `{"confirm":"rotate"}` |

令牌由脚本读取 `.chattoapi-master.key` 派生（遵循 `CHATTOAPI_MASTER_KEY` 环境变量），不落盘、不打印。回环地址在同机的 Windows 用户之间是共享的，该令牌用于确认调用方与运行中的服务属于同一用户；两者主密钥不一致时返回 403。

该操作是轮换，不是读取已有 Key。轮换后旧 Key 立即失效，其他直接调用 ChatToAPI 的客户端和已有 provider 配置也需要更新。即使后续注册或验收失败，旧 Key 也已失效；需要重新注册并同步其他调用方。

## 注册参数

参数通过 `npm run magpie:register -- <参数>` 传入。

| 参数 | 用途 |
| --- | --- |
| `--exe` | 指定 magpie CLI 可执行文件路径；路径含空格时加引号 |
| `--base-url` | 指定 ChatToAPI 的 API base URL，必须带 `/v1`，例如 `http://127.0.0.1:8787/v1` |
| `--key` | 使用已有的 ChatToAPI API Key，跳过自动取 Key 和轮换 |
| `--models` | 指定注册的模型列表，模型名称应与 ChatToAPI `/v1/models` 一致 |
| `--no-verify` | 跳过验证；使用后不能据退出码判断模型和对话是否可用 |

## 退出码

| 退出码 | 含义 |
| --- | --- |
| 0 | 成功；使用 `--no-verify` 时不代表已通过对话验收 |
| 2 | ChatToAPI 未启动或无法连接 |
| 3 | Key 获取或校验失败 |
| 4 | magpie 网关不可达 |
| 5 | provider 状态不明 |
| 6 | 模型未出现在网关列表中 |
| 7 | 对话验收失败 |

## 错误对照

| 现象 | 排查与处理 |
| --- | --- |
| ChatToAPI `/health` 拒连 | 确认 `npm start` 仍在运行、端口为 8787，且 `--base-url` 指向正确实例；健康检查路径不带 `/v1` |
| `/auth/status` 返回 `loggedIn:false` | 运行 `npm run login`，完成登录后进入实际 AI 对话并发送一条消息，再检查登录状态；轮换 API Key 不会修复上游登录 |
| ChatToAPI `/v1/models` 返回 401 | 检查 Bearer Key 是否缺失、错误或已被轮换；用当前有效 Key 重跑注册脚本，并更新其他调用方 |
| magpie 网关不可达 | 确认 magpie 已启动并监听 `127.0.0.1:3425` |
| 网关返回 `model not found` | 检查 `chatopens` provider 状态和网关 `/v1/models`；使用列表返回的完整模型名称，检查 `--models` 后重新注册 |
| HTTP 成功但 SSE 流内出现 `error` | 读取流内错误信息，检查上游登录、模型权限与连接；HTTP 200 或收到结束标记都不能单独证明对话成功 |
| 自动取 Key 被拒绝 | 检查是否直接通过回环连接访问，且请求包含指定请求头和确认正文；已有有效 Key 时可用 `--key` |

## 已知边界

- magpie 会明文保存 provider Key。不要分享包含 Key 的配置；ChatToAPI 本机的凭据加密不会保护 magpie 保存的副本。
- ChatToAPI 返回的 `usage` 恒为 0，不能据此统计实际 Token 用量或费用。
- 该 provider 仅提供 Chat Completions 文本能力，不支持工具调用或多模态输入。
- provider 配置不填 `responses=`、`anthropic=`、`gemini=`；ChatToAPI 未提供这些协议端点。
- provider 的 base 必须带 `/v1`，即 `http://127.0.0.1:8787/v1`。
- `magpie provider test chatopens` 有假阳性，不能作为唯一验收依据；还需确认网关模型列表，并通过网关完成真实文本对话且无流内错误。

## 更新与卸载

换 Key 后，用新 Key 重跑脚本更新 provider：

```powershell
npm run magpie:register -- --key ctk_xxx
```

也可以直接重跑 `npm run magpie:register`，自动轮换并注册；此时需同步更新其他使用旧 Key 的调用方。

移除 provider：

```powershell
magpie provider rm chatopens
```

移除 provider 不会停止 ChatToAPI，也不会撤销 ChatToAPI 的 API Key。
