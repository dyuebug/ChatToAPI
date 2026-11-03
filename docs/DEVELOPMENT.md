# ChatToAPI 开发文档

## 1. 开发目标

ChatToAPI 是一个 Node.js 本地服务，将用户自己登录的 Chatopens 浏览器会话
转换成 OpenAI 兼容 HTTP API。核心目标是：

1. 通过浏览器完成用户主动登录。
2. 捕获必要的 Cookie、Bearer Token 和客户端请求头。
3. 对凭据进行本地加密存储。
4. 生成只在本地校验的 `ctk_...` API Key。
5. 将上游 SSE 转换为 OpenAI 风格响应。

## 2. 技术栈和目录

```text
src/
  index.js       启动配置、凭据管理器和 HTTP 服务
  config.js      config.example.json + config.json 合并
  credentials.js 浏览器登录、凭据捕获、AES-GCM 和 API Key
  upstream.js    上游 HTTP、Windows curl、请求体和 SSE 解析
  server.js      本地认证路由和 OpenAI 兼容路由
  logger.js      分级日志
scripts/
  login.mjs      独立登录助手
  rotate-key.mjs API Key 轮换
  import-headers.mjs 兼容旧的人工导入工具
  smoke.mjs      真实上游烟囱测试
test/
  mock.test.js         模拟 SSE 和上下文转换
  login-code.test.js    动态码路由与凭据逻辑
  upstream-error.test.js 401 和 endpoint 回退
config.example.json    脱敏配置模板
```

## 3. 运行时架构

```text
客户端
  |
  | Authorization: Bearer ctk_...
  v
src/server.js
  | 解析 OpenAI messages / model / stream
  v
src/upstream.js
  | 构造 conduit 请求体
  | Windows: curl.exe + Schannel
  | Linux/HTTP: Node http/https
  v
Chatopens 上游
  | SSE delta / JSON Patch
  v
OpenAI JSON 或 SSE 响应
```

登录和凭据捕获是独立链路：

```text
/auth/login
  -> Chromium 持久化 Profile
  -> 注入已保存 Cookie / localStorage token
  -> 打开 /Web/List.html
  -> AutoVIP/AutoFree Sorux 入口
  -> 监听 request/response
  -> captureHeaders()
  -> AES-256-GCM 保存
```

## 4. 配置加载

`src/config.js` 先读取 `config.example.json`，再用本地 `config.json` 深度合并。
正式凭据由 `CredentialManager.loadIntoConfig()` 从加密状态注入，明文配置中的
旧凭据不会绕过加密存储。

常用环境变量：

| 变量 | 作用 |
| --- | --- |
| `CHATTOAPI_PORT` | 覆盖监听端口 |
| `CHATTOAPI_HOST` | 覆盖绑定地址 |
| `CHATTOAPI_PROFILE_DIR` | 覆盖浏览器 Profile 目录 |
| `CHATTOAPI_BROWSER_PATH` | 指定 Chrome/Edge 可执行文件 |
| `CHATTOAPI_MASTER_KEY` | 覆盖本地主密钥文件 |

默认安全边界是回环绑定和本地认证路由。远程暴露需要在应用外增加安全层。

## 5. 凭据和 API Key 状态

`CredentialManager` 的持久化状态位于 `data/credentials.enc.json`，结构经过
AES-256-GCM 加密。逻辑状态包含：

```text
{
  upstream: {
    credential: { cookie, bearerToken },
    headers: { selected client headers }
  },
  apiKeyHash: "sha256 hex",
  apiKeyCreatedAt: "ISO timestamp",
  lastLoginAt: "ISO timestamp"
}
```

开发代码只能通过 `status()` 输出布尔状态、路径和协议形状。禁止将 Cookie、
Bearer Token、动态码、Key 或消息正文写入日志、测试输出和 HTTP 状态响应。

Key 生成流程：

1. 使用随机字节生成 `ctk_` 前缀 Key。
2. 仅保存 SHA-256 哈希。
3. 校验时使用 `crypto.timingSafeEqual`。
4. 轮换时覆盖哈希，使旧 Key 立即失效。

## 6. 登录捕获流程

`CredentialManager.startLogin()` 使用 Playwright 的持久化 Chromium Context。
捕获器同时监听：

- `request`：记录方法、路径、认证头存在性和请求体形状。
- `response`：记录状态、内容类型和 SSE/JSON 响应形状。
- `localStorage["token"]`：覆盖登录接口只返回业务成功码的情况。

捕获完成条件不是第一个认证初始化请求，而是最终对话路径的响应：

- `/backend-api/f/conversation`
- `/backend-api/conversation`
- `/API/Web/ConversationMessage/Completions`

这样可以避免在 `user_granular_consent` 等初始化请求阶段过早关闭浏览器。

入口选择器按照以下顺序尝试：

```text
AutoVIP${car}
AutoFree${car}
Jump${car}
```

如果卡片尚未渲染，会记录脱敏诊断并等待下一次定时检查。

## 7. 已验证的上游协议

真实站点初始化请求包括：

```text
POST /backend-api/conversation/init
GET  /backend-api/conversations
POST /backend-api/sentinel/chat-requirements/prepare
POST /backend-api/sentinel/chat-requirements/finalize
```

sentinel prepare 响应包含：

```text
persona
prepare_token
proofofwork
turnstile
```

对话请求体的稳定字段为：

```text
action
conversation_id
conversation_origin
model
timezone_offset_min
suggestions
history_and_training_disabled
messages[].author.role
messages[].content.content_type
messages[].content.parts
parent_message_id
websocket_request_id
force_paragen
supported_encodings
```

新建对话时必须满足两点，否则上游会返回 HTTP 200 且正文为
`{"detail":"请重新创建一个对话使用。(Nexus Trace ID: ...)"}`：

- `conversation_id` 为 `null`；
- `parent_message_id` 固定为 `client-created-root`，不能使用随机 UUID。

当前账号对新版 `/backend-api/f/conversation` 返回 `api mode not supported`，
因此 `streamCompletion()` 对该明确业务错误回退到
`/backend-api/conversation`。回退只针对 404、405 和该明确的 500 业务错误，
不会把所有 5xx 都静默重试。

## 8. SSE 解析器

`splitSse()` 负责基础帧拆分；`streamCompletion()` 负责增量语义：

- 忽略 `delta_encoding` 的字符串版本声明。
- 对 `o=add` 的消息节点：若已带正文则按快照处理，否则只更新状态。
- 对 `o=append` 且路径包含 `/message/content/parts/0` 的字符串调用
  `onContent()`；省略 `o`/`p` 的继承帧（`v` 为标量）同样按上一条路径处理。
- 批量 patch（`{"o":"patch","v":[{o,p,v},...]}` 或 `{"v":[...]}`）逐项应用。
- 全量快照帧 `{"c":<游标>,"v":{message:{...}}}`：按 `message.id` 记录已输出
  文本，只补发新增后缀；仅接受 `author.role=assistant` 且 `recipient=all`
  的消息，避免输出用户回显与工具消息。
- 其他 part 路径交给 `onReasoning()`。
- 忽略状态类 patch。
- `message_stream_complete` 或 `[DONE]` 结束读取。

本地 SSE 输出由 `server.js` 重新包装为：

```text
chat.completion.chunk (role)
chat.completion.chunk (content increments)
chat.completion.chunk (finish_reason=stop)
[DONE]
```

## 9. 本地 HTTP API

| 方法 | 路径 | 用途 | 认证 |
| --- | --- | --- | --- |
| GET | `/health` | 健康检查 | 无 |
| GET | `/auth/status` | 脱敏登录状态 | 仅回环 |
| GET/POST | `/auth/login` | 启动登录捕获 | 仅回环 |
| GET | `/auth/login/form` | 动态码表单 | 仅回环 |
| POST | `/auth/login/code` | 提交动态码 | 仅回环 |
| POST | `/auth/key/rotate` | 轮换 API Key 并返回明文一次 | 仅回环 + 主密钥摘要 |
| GET | `/v1/models` | 模型列表 | API Key |
| POST | `/v1/chat/completions` | 对话接口 | API Key |

上游 401 的处理顺序：

1. 调用 `credentials.invalidateUpstream()` 清除失效上游凭据。
2. 非流式请求返回 HTTP 401 `authentication_error`。
3. 流式请求发送 SSE error 帧和 `[DONE]`。

## 10. 测试和验证

静态语法检查：

```powershell
node --check src/credentials.js
node --check src/upstream.js
node --check src/server.js
```

完整测试：

```powershell
npm test
```

测试覆盖：

- 动态码提交和登录路由。
- OpenAI SSE 转换。
- system/user/assistant 多轮上下文合并。
- 200 JSON 未登录响应映射为 401。
- `api mode not supported` 回退到旧 endpoint。
- 401 自动清理凭据。
- API Key 正确值/错误值校验。

真实上游烟囱测试应谨慎执行，因为会消耗上游账号请求额度。推荐使用短文本
和当前账号实际可用模型：

```powershell
node scripts/smoke.mjs
```

禁止在真实测试输出中打印完整请求头、Cookie、Token、Key 或消息正文。

## 11. 修改指南

### 增加模型别名

在 `src/server.js` 的 `mapModel()` 添加显示名到上游模型 ID 的映射，同时更新
`/v1/models` 列表和用户文档。先用上游 `/backend-api/models` 验证模型确实存在。

### 增加上游 endpoint 回退

只在能区分业务语义的情况下添加回退条件。应当：

1. 保存原始响应状态和内容类型。
2. 只读取必要的错误摘要。
3. 不把响应正文写入公共诊断状态。
4. 增加 mock 回归测试。

### 修改登录捕获

先更新脱敏摘要，再修改捕获完成条件。不要通过“第一个带 Cookie 的请求”
结束浏览器，因为初始化请求不一定是最终对话请求。

## 12. 安全和发布检查清单

- [ ] `config.json`、`data/`、浏览器 Profile 和主密钥未进入发布包。
- [ ] 日志没有真实认证值、API Key 或消息正文。
- [ ] 默认仍绑定 `127.0.0.1`。
- [ ] Key 轮换会让旧 Key 立即失效。
- [ ] 上游 401 会清理失效凭据。
- [ ] 真实上游调用使用短测试消息并确认成功/失败状态。
- [ ] `node --check` 和 `npm test` 均通过。
- [ ] 文档中的模型和路径与当前站点实际协议一致。

## 13. 当前限制和后续方向

- 上游 `conversation_id` 尚未在本地跨请求持久化。
- 采样参数、工具调用和多模态内容尚未完整映射。
- 当前账号使用兼容旧 endpoint；新版 `/f` endpoint 返回 API mode 不支持。
- sentinel 动态字段已在浏览器协议中观察到，但当前兼容旧 endpoint 不依赖它；
  如果未来站点切换到新版 endpoint，需要实现请求级 sentinel 刷新。
- 若要支持多用户，需要额外设计用户隔离、Key 命名空间、并发控制和凭据租约，
  当前代码默认是单机单账号模型。

