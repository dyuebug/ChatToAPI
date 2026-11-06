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
  upstream.js    上游传输：请求分发、Windows curl、Work/Sorux SSE 读取
  server.js      本地认证路由和 OpenAI 兼容路由
  stations/
    contracts.js    站点 ID、事件类型、错误工厂
    model-catalog.js 模型别名、路由与模型列表
    patch-reducer.js Work 的 JSON Patch / 工具活动状态机
    sorux.js        Sorux 请求体、请求头与适配器
    oneopenai.js    ChatGPT-Work 请求体、请求头与适配器
    index.js        resolveStation() 与模型列表聚合
  ui-server.js   本地控制台网关：启动令牌、会话 Cookie、静态资源与安全头
  ui/
    index.html   控制台语义结构
    app.js       状态轮询、登录/轮换/流式对话交互
    app.css      设计令牌与响应式布局
    lib.js       脱敏与增量 SSE 解析器
  logger.js      分级日志
scripts/
  login.mjs      独立登录助手
  rotate-key.mjs API Key 轮换
  import-headers.mjs 兼容旧的人工导入工具
  smoke.mjs      真实上游烟囱测试
test/
  station-routing.test.js 站点路由与模型目录
  credential-v2.test.js   凭据 v2 迁移、隔离与脱敏
  work-reducer.test.js    Work JSON Patch 状态机
  work-adapter.test.js    Work 请求体、请求头与 reducer 接线
  mock.test.js         模拟 SSE 和上下文转换（含 Work 流式/非流式/回退）
  login-code.test.js    动态码路由与凭据逻辑
  upstream-error.test.js 401 和 endpoint 回退
  ui.test.js            控制台网关、会话与轮换双通道
  ui-lib.test.js        脱敏、增量 SSE 解析器与流式增量辅助函数
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
  | resolveStation(model, cfg) 决定站点与上游模型
  v
src/upstream.js
  | streamUpstream() 按 stationId 分发
  | Sorux: conduit 请求体 + delta SSE
  | Work:  /backend-api/f/conversation + JSON Patch reducer
  | Windows: curl.exe + Schannel；其他: Node http/https
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
| `CHATTOAPI_UI_TOKEN` | 覆盖控制台启动令牌；设置后不写 `.chattoapi-run/ui-token` |

`config.example.json` 的 `ui` 段：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `ui.enabled` | `true` | 是否启用 `/ui` 本地控制台 |
| `ui.sessionTtlMs` | `28800000` | 控制台会话有效期（8 小时） |

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

实际落盘为 v2 结构（旧状态在首次加载时自动迁移一次）：

```text
{
  version: 2,
  activeStation: "Sorux" | "OneOpenAI",
  stations: {
    Sorux: { credential: { cookie, bearerToken }, headers: {...}, cookieCount, capturedAt },
    OneOpenAI: { credential: { cookie, bearerToken }, headers: {...}, cookieCount, capturedAt }
  },
  apiKeyHash, apiKeyCreatedAt, lastLoginAt
}
```

`CredentialManager.loadIntoConfig(stationId)` 只注入指定站点的凭据；
`invalidateStation(id)` 只清理该站，`status().stations` 按站点输出布尔状态与
捕获时间，不含任何凭据内容。

开发代码只能通过 `status()` 输出布尔状态、路径和协议形状。禁止将 Cookie、
Bearer Token、动态码、Key 或消息正文写入日志、测试输出和 HTTP 状态响应。

Key 生成流程：

1. 使用随机字节生成 `ctk_` 前缀 Key。
2. 仅保存 SHA-256 哈希。
3. 校验时使用 `crypto.timingSafeEqual`。
4. 轮换时覆盖哈希，使旧 Key 立即失效。

## 6. 登录捕获流程

`CredentialManager.startLogin()` 使用 Playwright 的持久化 Chromium Context。
入口地址取决于本地是否已有加密凭据：有凭据时复用 Profile 并直接打开
`/Web/List.html`，无凭据时才打开登录页。因此 `status().loggedIn` 只表示
“本地存在加密凭据”，不代表上游会话仍然有效；有效性由下一次真实请求验证，
401 会触发 `invalidateUpstream()` 清除凭据。

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

### 7.1 ChatGPT-Work 站协议

Work 站（`car=OneOpenAI`）使用独立站点会话与另一套请求形状，适配器位于
`src/stations/oneopenai.js`：

```text
POST /backend-api/f/conversation
```

请求体关键字段：

```text
action: "next"
model: "gpt-6.1-terra-wm" 等
conversation_origin: "tpp"
thinking_effort: "min" | ...
timezone / timezone_offset_min
turn_attribution
client_contextual_info
genui_state_snapshots
client_prepare_state
messages[].author.role / content.content_type / content.parts
parent_message_id: "client-created-root"
```

与 Sorux 的差异：

- 不发送 `suggestions`、`history_and_training_disabled`、`force_paragen`、
  `websocket_request_id`、`local_function_signatures`。
- 不发送 `x-conduit-token`、`openai-sentinel-*` 等 Sentinel 头；只使用显式
  白名单中的浏览器头（`accept`、`content-type`、`authorization`、`cookie`、
  `user-agent`、`sec-ch-ua*`、`origin`、`referer`、`oai-client-*` 等）。
- 必须使用 Work 站自己的 Cookie jar；用 Sorux 的 Cookie 请求会得到 403。
- Work 允许在尚未输出任何内容时先返回 HTTP 429 / `model_at_capacity`，因此
  `server.js` 对 Work 延迟写响应头，以便执行容量回退或返回结构化 429。

SSE 帧语义（由 `src/stations/patch-reducer.js` 解释）：

| 帧 | 处理 |
| --- | --- |
| `{"type":"delta_encoding"}` / `data: "v1"` | 版本声明，忽略（非对象帧不得进入 reducer） |
| `o=add/append/replace/remove` + `p`/`v` | 对消息文档应用 JSON Patch |
| `/message/content/parts/0` | 正文增量 |
| `/message/content/thoughts/*/summary` | 思考摘要（需显式开启） |
| `/message/metadata/dil_v2_reasoning/appData/items` | `command_execution` 工具活动 |
| `{"type":"message_stream_complete"}` | 结束 |
| `data: [DONE]` | 结束 |
| `{"error_code":"model_at_capacity"}` | 容量错误 |

输出映射：

- 正文 → `choices[0].delta.content`。
- 思考摘要 → `choices[0].delta.reasoning_content`。
- 工具活动 → `choices[0].delta.chattoapi_tool_activity`：
  `{ id, type: "command_execution", phase: "started"|"updated"|"completed", label, icon, active }`。
- 非流式工具列表 → 顶层 `chattoapi.work_tools`；非流式正文与工具列表以
  reducer 最终快照为准，因此上游对正文执行 `replace`/`remove` 改写时不会残留旧文本。
- 最终流式帧 → 顶层 `chattoapi`：`site`、`upstream_model`、`tool_count`、
  `warnings`、`fallback_from`、`fallback_to`。
- 客户端传入 `tools` / `tool_choice` 时忽略并加入
  `client_tools_not_supported_by_work` 警告；Work 不返回标准 `tool_calls`。

容量回退默认开启：候选顺序为请求模型后接
`upstream.stations.OneOpenAI.fallbackModels`（默认 `gpt-6.1-terra-wm`、
`gpt-6-sol-wm`、`gpt-5.6-sol-wm`），最多尝试 3 个，且只在未输出任何可见内容时
重试。仅当错误明确为 `model_at_capacity` 且 `can_retry !== false` 时才换模型；
普通 HTTP 429 限流不会触发切换。`autoFallback=false` 时直接映射为 HTTP 429。

## 8. SSE 解析器

`splitSse()` 负责基础帧拆分；Sorux 的增量语义由 `streamSorux()` 处理，
Work 的 JSON Patch 语义由 `src/stations/patch-reducer.js` 处理。Sorux：

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
chat.completion.chunk (reasoning_content increments，仅 Work 且开启时)
chat.completion.chunk (chattoapi_tool_activity，仅 Work)
chat.completion.chunk (finish_reason=stop)
data: [DONE]
```

Work 的 reducer 在单个 `reduce(frame)` 内维护消息文档、已输出正文、
思考摘要上限、工具活动快照去重与 `toolPhases`，返回结构化事件：

```text
content | reasoning | tool_activity | meta | warning | done | capacity
```

`server.js` 只消费事件，不直接理解 JSON Patch。

## 9. 本地 HTTP API

| 方法 | 路径 | 用途 | 认证 |
| --- | --- | --- | --- |
| GET | `/health` | 健康检查 | 无 |
| GET | `/auth/status` | 脱敏登录状态 | 仅回环 |
| GET/POST | `/auth/login` | 启动登录捕获，`?station=Sorux\|OneOpenAI` | 仅回环 + `Sec-Fetch-*` 来源校验 |
| GET | `/auth/login/form` | 动态码表单 | 仅回环 |
| POST | `/auth/login/code` | 提交动态码，`?station=...` | 仅回环 + `Sec-Fetch-*` 来源校验 |
| POST | `/auth/key/rotate` | 轮换 API Key 并返回明文一次 | 仅回环 + 主密钥摘要或 UI 会话 |
| GET | `/ui` | 本地 Web 控制台 | 回环 + 会话 Cookie |
| GET | `/ui/app.js`、`/ui/app.css` | 控制台静态资源 | 回环 + 会话 Cookie |
| GET | `/v1/models` | 模型列表 | API Key |
| POST | `/v1/chat/completions` | 对话接口 | API Key |

`/auth/login` 与 `/auth/login/code` 额外校验 `Sec-Fetch-Dest` / `Sec-Fetch-Site`：只接受浏览器导航
（`document` / `none`、`same-origin`）或同源脚本请求（`empty` / `same-origin`），
拒绝跨站页面通过 `<img>` 或 `text/plain` 表单触发登录与动态码提交。
`?station` 只接受 `Sorux` / `OneOpenAI`，其他值返回 400，避免静默回落到默认站点；
动态码提交要求目标站点与当前打开的登录窗口一致，否则返回 400。

### 9.1 本地控制台安全模型

- 启动时由 `resolveUiToken()` 生成 24 字节随机令牌；`CHATTOAPI_UI_TOKEN` 可覆盖。
- 打开 `/ui?t=<令牌>` 后返回 `303 /ui` 并设置 `HttpOnly; SameSite=Strict` 会话 Cookie，
  有效期由 `ui.sessionTtlMs` 控制（默认 8 小时）。无会话、令牌错误或 Host 被伪造时一律 404。
- 响应头固定包含严格 CSP、`X-Frame-Options: DENY`、`nosniff`、`no-referrer`、
  `Cache-Control: no-store`；前端不使用内联脚本或内联样式。
- 轮换 API Key 支持双通道：`X-ChatToAPI-Rotate`（主密钥摘要）或 UI 会话 +
  `X-ChatToAPI-UI: 1`；两者都要求请求来自回环地址。
- 未设置 `CHATTOAPI_UI_TOKEN` 时，令牌写入 `.chattoapi-run/ui-token`（ACL 限制为当前用户），
  供 `service:status` 与 `chattoapi.bat console` 读取；只有实际写入的实例在退出时清理该文件。
- 前端只在页面内存中保留 API Key；仅主题偏好写入 `localStorage`。

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
node --check src/ui-server.js
node --check src/ui/app.js
node --check src/ui/lib.js
```

完整测试：

```powershell
npm test
```

测试覆盖：

- 动态码提交和登录路由。
- 站点路由、模型目录与 Work 请求体/请求头白名单。
- 凭据 v2 迁移幂等、站点隔离、按站点失效与脱敏状态。
- Work JSON Patch reducer：正文、思考摘要、工具活动去重、容量错误。
- OpenAI SSE 转换。
- system/user/assistant 多轮上下文合并。
- 200 JSON 未登录响应映射为 401。
- `api mode not supported` 回退到旧 endpoint。
- 401 自动清理凭据。
- API Key 正确值/错误值校验。
- Work 流式/非流式输出、容量回退与关闭回退时的 429。
- Work 非流式正文改写/删除、`can_retry:false` 与普通 429 不触发回退。
- `/auth/login/code` 跨站拒绝与未知站点 400。
- 控制台会话令牌、Cookie 属性、Host 伪造与畸形 Cookie 降级。
- 轮换双通道：主密钥摘要与 UI 会话；旧 Key 立即 401、新 Key 可用。
- `Sec-Fetch-*` 登录来源校验（跨站拒绝、导航与同源 fetch 放行）。
- 前端引用的 DOM id 与静态 HTML 一致性。
- 脱敏规则、增量 SSE 解析器与流式增量辅助函数。

真实上游烟囱测试应谨慎执行，因为会消耗上游账号请求额度。推荐使用短文本
和当前账号实际可用模型：

```powershell
node scripts/smoke.mjs --station OneOpenAI
node scripts/smoke.mjs work-gpt-6.1-terra "请仅回复 OK" --station OneOpenAI
```

烟测会通过 `CredentialManager.loadIntoConfig()` 注入指定站点的加密凭据，
不会把凭据写入日志；Work 站只打印工具阶段与脱敏标签。

禁止在真实测试输出中打印完整请求头、Cookie、Token、Key 或消息正文。

## 11. 修改指南

### 增加模型别名

在 `src/stations/model-catalog.js` 中修改 `SORUX_ALIASES` 或 `WORK_ALIASES`，
并同步 `soruxModelList()` / `workModelList()`、`src/server.js` 的响应模型字段与
用户文档。Work 别名必须映射到 `*-wm` 上游 ID。先用上游 `/backend-api/models`
验证模型确实存在。

### 增加站点适配器

站点特定逻辑集中在 `src/stations/`，不要在 `server.js` 中增加站点分支：

1. 在 `contracts.js` 的 `STATION_IDS` 增加 ID。
2. 新建适配器模块，导出 `id`、`deferHeaders`、`resolveModel`、`buildRequest`、
   `buildHeaders`、`createReducer`、`listModels`。
3. 在 `stations/index.js` 注册，并确保 `resolveStation()` 能按模型前缀路由。
4. 凭据白名单、`normalizeStationId()`、Profile 目录与 `status().stations`
   需要同步支持新站点。
5. 增加 adapter、reducer 与 mock 端到端测试。

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
- 采样参数与多模态内容尚未完整映射。
- Work 工具由上游执行，不支持客户端提供函数定义后回填工具结果；标准
  `tool_calls` 不会出现。
- Work 的请求体、头白名单与工具字段基于当前站点抓包，站点升级后需重新验证。
- 当前账号使用兼容旧 endpoint；新版 `/f` endpoint 返回 API mode 不支持。
- sentinel 动态字段已在浏览器协议中观察到，但当前兼容旧 endpoint 不依赖它；
  如果未来站点切换到新版 endpoint，需要实现请求级 sentinel 刷新。
- 若要支持多用户，需要额外设计用户隔离、Key 命名空间、并发控制和凭据租约，
  当前代码默认是单机单账号模型。

