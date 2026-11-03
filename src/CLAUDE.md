[根目录](../CLAUDE.md) > **src**

# src — 核心运行时

## 模块职责

`src/` 是 ChatToAPI 的唯一运行时实现，负责：

1. 读取并合并配置。
2. 管理加密凭据、浏览器登录捕获与本地 API Key。
3. 暴露本地 HTTP 服务，鉴权后把 OpenAI 请求翻译为上游 conduit 请求。
4. 通过 Node `http/https` 或 Windows `curl.exe` 访问上游，并解析 delta SSE。
5. 把上游增量翻译为 OpenAI 风格的 JSON 或 SSE。

模块不依赖任何第三方库；唯一外部依赖 `playwright-core` 只被 `credentials.js` 使用。

## 入口与启动

入口：`src/index.js`（`npm start` → `node src/index.js`）。

启动顺序：

1. `loadConfig()`：读取 `config.example.json`，若存在本地 `config.json` 则深度合并覆盖。
2. 若设置 `CHATTOAPI_PROFILE_DIR`，写入 `cfg.auth.profileDir`。
3. `setLevel(cfg.logLevel || 'info')`。
4. 创建 `CredentialManager`，调用 `loadIntoConfig()` 把加密存储中的上游凭据和请求头注入配置。
5. 解析 `CHATTOAPI_HOST` / `CHATTOAPI_PORT`，默认 `127.0.0.1:8787`。
6. `createServer(cfg, { credentials }).listen(...)`。
7. 若 `auth.requireApiKey !== false`，首次启动时生成并打印一次 `ctk_...` API Key。

配置或凭据存储失败时直接 `process.exit(1)`。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `index.js` | 组合根：配置、日志、凭据管理器、HTTP 服务启动 |
| `config.js` | `config.example.json` + `config.json` 深度合并；`ROOT` 由模块路径推导 |
| `server.js` | 本地 HTTP 路由、API Key 鉴权、OpenAI 请求解析、SSE 重包装 |
| `upstream.js` | conduit 请求体、请求头、Windows curl 回退、SSE delta 解析、超时与回退 |
| `credentials.js` | AES-256-GCM 存储、Playwright 登录捕获、动态码、API Key 生成/校验/轮换 |
| `logger.js` | `debug/info/warn/error` 分级日志，全部写 `stderr`，带 ISO 时间戳 |

## 对外接口

### 本地 HTTP 路由

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | `/health` | 无 | `{ ok: true }` |
| GET | `/` | 无 | 同 `/health` |
| GET | `/auth/status` | 仅回环 | 脱敏登录状态，见 `CredentialManager.status()` |
| GET/POST | `/auth/login` | 仅回环 | 启动登录捕获；`?force=1` 先关闭旧窗口 |
| GET | `/auth/login/form` | 仅回环 | 内置动态码 HTML 表单 |
| POST | `/auth/login/code` | 仅回环 | 提交动态码，body `{ "code": "..." }`，上限 10 KB |
| POST | `/auth/key/rotate` | 仅回环 + 主密钥令牌 | 轮换 API Key，返回明文一次；响应带 `Cache-Control: no-store` |
| GET | `/v1/models` | API Key | 固定模型列表 |
| POST | `/v1/chat/completions` | API Key | 流式 / 非流式对话，body 上限 5 MB |

鉴权规则：当 `cfg.auth.requireApiKey !== false` 时，所有以 `/v1/` 开头的请求都必须带 `Authorization: Bearer ctk_...`，否则返回 401 `authentication_error`。

`/auth/*` 只允许回环地址（`127.0.0.1`、`::1`、`::ffff:127.0.0.1`），否则 403。

`/auth/key/rotate` 额外要求 `X-ChatToAPI-Rotate` 携带 `keyRotationToken()`（本地主密钥的 SHA-256，常量时间比较）。回环地址是机器级的，该令牌用于区分同机的其他 Windows 用户。

未知路由返回 404 OpenAI 错误 JSON。

### `/v1/chat/completions` 请求映射

- `messages` 必须是数组且非空，否则 400。
- 每个消息被转换为 `[role]\n<text>` 文本块，块之间以空行连接；至少需要一条 `[user]` 文本，否则 400。
- `content` 支持字符串和数组；数组中的 `text` / `content` 字段会被提取，`image_url` / `input_image` 替换为 `[image omitted]`。
- `stream` 默认 `true`（判断条件是 `j.stream !== false`）。
- `model` 默认 `DeepSeek-V4-Flash`。
- `temperature`、`max_tokens`、`top_p`、`presence_penalty`、`frequency_penalty`、`stop` 会被解析但当前**不映射**到上游。
- 非流式：累积全部内容后返回 `chat.completion`，`usage` 固定为 0。
- 流式：先发 role chunk，再逐段发 content chunk，最后发 `finish_reason: "stop"` 与 `data: [DONE]`。
- 客户端断开时通过 `AbortController` 中止上游请求。

### 模型别名

`mapModel()` 的映射（显示名 → 上游 slug）：

| 输入 | 上游 model |
| --- | --- |
| `gpt-5.1` | `gpt-5-1` |
| `gpt-5.5` | `gpt-5-5` |
| `gpt-5.5-mini` | `gpt-5-5-mini` |
| `gpt-5.5-thinking` | `gpt-5-5-mini` |
| `gpt-5` | `gpt-5` |
| `deepseek-v4-flash` / `DeepSeek-V4-Flash` | `DeepSeek-V4-Flash` |
| `deepseek-v4-pro` / `DeepSeek-V4-Pro` | `DeepSeek-V4-Pro` |
| `gpt-4o` / `o3` / `o4-mini` | 原样 |

注意：`/v1/models` 当前只列出 `gpt-5.5`、`gpt-5.5-mini`、`gpt-5.1`、`deepseek-v4-flash`、`deepseek-v4-pro`，与 `mapModel()` 的完整别名集合并不完全一致；修改时需同步两处和 `docs/`。

## 上游协议

### 请求

`streamCompletion()` 构造并发送：

```text
POST {upstream.baseUrl}{upstream.conversationPath}
```

默认路径 `/backend-api/f/conversation`。请求体字段（`buildRequestBody`）：

```text
action, conversation_id (null), conversation_origin, model,
timezone_offset_min, suggestions, history_and_training_disabled,
messages[].author.role, messages[].content.content_type,
messages[].content.parts, parent_message_id,
websocket_request_id, force_paragen, supported_encodings
```

请求头：

- `authorization: Bearer <bearerToken>`
- `cookie: <cookie>`
- `accept: text/event-stream`
- `content-type: application/json`
- `oai-client-build-number`、`oai-client-version`、`oai-device-id`、`oai-language`
- `x-conduit-token`
- `openai-sentinel-chat-requirements-token`
- 可选 `openai-sentinel-turnstile-token`
- `user-agent`

这些值来自配置或登录捕获，文档中不记录真实值。

### 传输

- Windows + HTTPS：通过系统 `curl.exe --config <临时配置>` 发送，使用 Schannel，兼容站点的 TLS 重协商。临时目录包含请求头与配置，权限 `0600`，进程结束/失败后删除；请求体从 stdin 写入，避免出现在命令行。
- 其他情况：Node 原生 `http` / `https`。
- 超时：`upstream.requestTimeoutMs`，默认 120000 ms；超时或取消统一映射为 `status = 504`。

### Endpoint 回退

候选路径为 `conversationPath` 与 `conversationFallbackPath`（默认 `/backend-api/conversation`，且与主路径不同才加入）。

触发回退的条件：

1. HTTP 404 或 405。
2. HTTP 500 且响应正文匹配 `api mode not supported`（Sorux 对旧账号的业务错误）。

其他 5xx 不静默重试。

### SSE 解析

`streamCompletion()` 逐行读取 `data:`：

- 忽略 `event:`、注释行、`delta_encoding` 字符串声明、`server_ste_metadata`、`title_generation`。
- JSON Patch 形状（含 `o` / `p` / `v`）：
  - `o=add` 且 `p=""`：完整节点；若已带正文按快照输出，否则只更新状态。
  - `o=append` 且路径含 `/message/content/parts/0`：调用 `onContent()`。
  - 其他 `parts` 路径：调用 `onReasoning()`。
  - 状态类 patch（`/message/status`、`/message/end_turn`）忽略。
  - 省略 `o` / `p` 且 `v` 为标量时继承上一条 delta 的 `o` / `p`。
- 批量 patch：`{"o":"patch","v":[{o,p,v},...]}` 与 `{"v":[...]}` 逐项应用。
- 全量快照 `{"c":<游标>,"v":{message:{...}}}`：按 `message.id` 记录已输出文本，只补发新增后缀；仅接受 `author.role=assistant` 且 `recipient=all`。
- `parent_message_id` 固定为 `client-created-root`（新对话），随机 UUID 会被上游拒绝为「请重新创建一个对话使用」。
- `message_stream_complete` 或 `data: [DONE]`：结束。
- 若上游返回非 `text/event-stream`：读取正文；正文含未登录/未授权关键词时映射 401，否则 502。

`sse 解析` 的错误处理：401 会触发 `credentials.invalidateUpstream()`；非流式返回 401/503/504/502，流式发送 SSE error 帧后结束。

## 凭据与数据模型

### 加密存储

文件：`data/credentials.enc.json`（`auth.dataDir` 可改）。

外层 JSON：

```text
{ version: 1, iv: base64, tag: base64, data: base64 }
```

算法：`aes-256-gcm`；`iv` 12 字节；`tag` 为 GCM auth tag；`data` 为密文。

解密后的逻辑状态（不记录真实值）：

```text
{
  upstream: {
    credential: { cookie, bearerToken },
    headers: { oai-*, openai-*, x-conduit-token, user-agent }
  },
  apiKeyHash: "sha256 hex",
  apiKeyCreatedAt: "ISO timestamp",
  lastLoginAt: "ISO timestamp"
}
```

主密钥来源：

1. 环境变量 `CHATTOAPI_MASTER_KEY`：Base64 解码后 32 字节则直接使用，否则对字符串做 SHA-256。
2. 否则读取项目根 `.chattoapi-master.key`：文件不存在时生成 32 字节随机数并 Base64 写入，权限 `0600`；文件内容必须能解码为 32 字节。

### 本地 API Key

- 格式：`ctk_` + 32 字节随机数的 base64url。
- 只保存 SHA-256 哈希，不保存明文。
- 校验使用 `crypto.timingSafeEqual`。
- `rotateApiKey()` 覆盖哈希，旧 Key 立即失效。
- `getInitialApiKey()` 仅在尚无哈希时生成；之后重启不再返回明文。

### 登录捕获

`startLogin()`：

1. 选择浏览器：`CHATTOAPI_BROWSER_PATH` → `auth.browserPath` → Windows 常见 Chrome/Edge 路径 → Linux Chrome/Chromium 路径。
2. 创建持久化 Chromium Context（`auth.profileDir`，默认 `.chattoapi-profile`）。
3. 默认登录地址 `https://www.chatopens.ai/Web/Login.html`；若配置的是站点根路径则自动改为 `/Web/Login.html`。
4. 若已有加密凭据，注入 Cookie 与 `localStorage["token"]`，并直接打开 `/Web/List.html`。
5. 注入动态码回退脚本，拦截 `#divLogin` 点击，调用 `/API/Web/User/DynamicCodeLogin`。
6. 监听 `request` / `response`：
   - 记录脱敏流量（方法、路径、资源类型、内容类型、认证头是否存在、协议 body 形状）。
   - 捕获同时带 `Authorization` 与 `cookie` 的同源请求。
   - 保存首个认证请求，但**不立即结束**。
   - 只有最终对话响应才结束捕获：`/backend-api/f/conversation`、`/backend-api/conversation`、`/API/Web/ConversationMessage/Completions`。
7. 每 2 秒检查各页面 `localStorage["token"]` 和站点 Cookie；若在 `/Web/List.html` 且 `autoOpenAiEntry !== false`，尝试点击 AI 入口。
8. AI 入口选择器按 `AutoVIP${car}`、`AutoFree${car}`、`Jump${car}` 顺序；`car` 默认 `Sorux`，允许 `Sorux`、`FakeOAI`、`XYChatGPT`、`OneOpenAI`、`Gemini`、`Grok`。
9. 登录总超时 `auth.loginTimeoutMs`，默认 600000 ms；页面导航超时至少 30 秒，默认 60 秒。

`submitDynamicCode(code)`：优先在已打开的页面内用 `fetch` 调动态码接口（复用浏览器网络与 Cookie）；无 `page.evaluate` 时退化为 Node `fetch`（仅测试/嵌入场景）。成功时尝试从响应 payload 提取 token、保存 Cookie、加密写入并关闭浏览器；否则跳转 `/Web/List.html` 并等待捕获。

`status()` 只返回布尔值、计数、路径和脱敏结构；`recentTraffic` 最多 40 条。

`invalidateUpstream()`：删除 `state.upstream`、清空 `cfg.upstream.credential` 并落盘。

## 关键依赖与配置

- 运行时依赖：`playwright-core` ^1.63.0（使用本机已安装的 Chrome/Edge，不下载浏览器）。
- Node 内置：`http`、`https`、`crypto`、`fs`、`path`、`os`、`child_process`、`stream`。
- 配置来源：`config.example.json`（默认值）← `config.json`（本地覆盖，git 忽略）← 环境变量。
- 正式上游凭据只从加密状态注入；即使 `config.json` 中有明文 `upstream.credential`，也会被 `loadIntoConfig()` 覆盖为空（无有效加密凭据时）。

## 数据模型与状态文件

| 路径 | 内容 | 是否提交 |
| --- | --- | --- |
| `data/credentials.enc.json` | AES-GCM 加密的凭据与 Key 哈希 | 否 |
| `.chattoapi-master.key` | 本地主密钥 | 否 |
| `.chattoapi-profile/` | Chromium 持久化 Profile | 否 |
| `config.json` | 本地配置覆盖，可能含旧版明文凭据 | 否 |
| `headers.txt` | 旧版手工粘贴的请求头 | 否 |

## 测试与质量

- `test/mock.test.js`：验证鉴权、强制登录、动态码、SSE 翻译与上下文合并。
- `test/login-code.test.js`：验证动态码在页面未导航时可用、失败/成功路径与凭据保存。
- `test/upstream-error.test.js`：验证 200 JSON 未登录映射 401、`api mode not supported` 回退、HTTP 401 清理。
- 静态检查：`node --check src/index.js` 等逐文件执行。
- 当前没有 ESLint / Prettier / TypeScript 配置。

## 常见问题（FAQ）

**为什么上游返回 401？**
JWT 可能过期或站点判定未登录。服务会调用 `invalidateUpstream()` 清除凭据；重新访问 `/auth/login` 并发送一条真实消息。

**为什么捕获不到凭据？**
只停留在登录页或 `/Web/List.html` 不会产生最终对话请求。必须进入 Sorux 等 AI 入口并发送一条消息。

**为什么 Windows 要用 `curl.exe`？**
部分站点 TLS 重协商无法由 Node/OpenSSL 完成，系统 Schannel 可以。临时配置写入权限 `0600`，结束后删除。

**为什么 `usage` 全是 0？**
上游未提供 token 计量，当前仅返回占位值。

**为什么请求默认流式？**
判断条件是 `j.stream !== false`；显式传 `stream: false` 才走非流式。

**为什么 `/v1/models` 与 `mapModel()` 不完全一致？**
模型列表是面向客户端的稳定子集，别名表兼容更多历史名称。修改时需同步两者与 `docs/`。

**可以远程访问吗？**
默认只绑定回环。远程暴露必须在反向代理层增加 TLS、认证、限流与审计；`/auth/*` 仍只允许回环。

## 相关文件清单

- `src/index.js`
- `src/config.js`
- `src/server.js`
- `src/upstream.js`
- `src/credentials.js`
- `src/logger.js`
- `config.example.json`
- `scripts/`、`test/`、`docs/`

## 变更记录

| 时间 | 变更 | 说明 |
| --- | --- | --- |
| 2026-11-03 00:19:02 | 初始化模块文档 | 基于当前源码生成；未修改源代码 |
