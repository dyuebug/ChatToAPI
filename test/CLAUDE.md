[根目录](../CLAUDE.md) > **test**

# test — 自测脚本

## 模块职责

`test/` 用**纯 Node 脚本**验证关键链路，不依赖 Jest / Mocha / `node:test`：

1. 本地 OpenAI 兼容层与上游 SSE 的翻译。
2. 动态码登录与凭据保存。
3. 上游错误映射、endpoint 回退、凭据失效处理。

所有测试都使用本地临时 HTTP 服务与假凭据，不访问真实 chatopens.ai。

## 入口与启动

```powershell
npm test
# 等价于：
node test/mock.test.js && node test/login-code.test.js && node test/upstream-error.test.js
```

也可以单独运行任一文件。脚本通过 `process.exit(0/1)` 或 `assert` 抛错表示结果；`npm test` 串行执行，任一失败即中止。

## 文件与覆盖点

### `mock.test.js`

端到端 mock 测试：

- 启动 mock 上游 `127.0.0.1:8899`，返回 conduit 形状的 SSE。
- 启动真实 `createServer()` 于 `127.0.0.1:8799`，指向 mock 上游，注入 `fakeCredentials`。
- 校验：
  - 无 API Key 访问 `/v1/models` 返回 401。
  - `/auth/login?force=1` 会先调用 `closeLogin()`。
  - `/auth/login/form` 返回包含 `/auth/login/code` 与 `/auth/status` 的 HTML。
  - `/auth/login/code` 正确提交动态码。
  - `POST /v1/chat/completions` 的 SSE 被翻译为 `你` + `好` + `世界`。
  - `[DONE]` 存在。
  - system / assistant 上下文被合并进上游 prompt。
- 固定端口：`8899`、`8799`。若本机端口被占用，测试会失败。

### `login-code.test.js`

动态码逻辑：

- 使用 `node:assert/strict` 与临时上游。
- 构造无浏览器的 `CredentialManager` 原型对象，验证：
  - 失败响应 `{ code: 500, msg: '动态码错误' }` 映射为 `{ ok: false, message: '动态码错误' }`。
  - 请求路径为 `/API/Web/User/DynamicCodeLogin`。
  - Referer 为 `/Web/Login.html`。
  - 浏览器 page 分支与成功分支。
  - 成功时保存 `state.upstream.credential.cookie` 并关闭登录上下文。
- 覆盖“页面尚未导航时也能提交动态码”的回归场景。

### `upstream-error.test.js`

上游错误与回退：

- 上游返回 HTTP 200 但正文 `{ "error": "还未登录" }` 时，`streamCompletion()` 抛出 `status = 401` 且带 `upstreamBody`。
- 主路径返回 500 + `api mode not supported` 时，自动回退到 `/backend-api/conversation`，最终内容为 `OK`。
- 本地服务收到上游认证错误时返回 HTTP 401 `authentication_error`，并调用 `invalidateUpstream()` 一次。
- 使用 `assert.rejects` 与临时端口。

## 关键依赖与配置

- Node 内置：`http`、`assert`。
- 被测模块：`src/server.js`、`src/upstream.js`、`src/credentials.js`。
- 测试配置是内联对象，不读取 `config.json`；因此不会触碰真实凭据。
- `mock.test.js` 使用固定端口；其余测试使用 `listen(0)` 动态端口。

## 数据模型

测试不持久化数据：

- `mock.test.js` 使用内存中的 `fakeCredentials`，不会写入 `data/`。
- `login-code.test.js` 把 `save` 替换为空函数，避免写盘。
- `upstream-error.test.js` 只检查内存状态与返回值。

## 测试与质量

当前覆盖：

- OpenAI SSE 转换与 `[DONE]`。
- system/user/assistant 多轮上下文合并。
- 动态码登录成功/失败。
- 上游 200 JSON 未登录 → 401。
- endpoint 回退。
- 401 清理凭据。
- API Key 正确/错误校验（通过 mock 的 `verifyApiKey`）。

尚未覆盖的缺口：

- `config.js` 的深度合并与缺失 `config.json` 场景。
- AES-256-GCM 加解密往返、错误主密钥、损坏密文。
- JWT 过期检测。
- 非流式 `chat.completion` 响应体。
- `/v1/models` 列表与 `mapModel()` 别名一致性。
- 客户端中断流式请求时的上游中止。
- `import-headers.mjs` 解析边界。

## 常见问题（FAQ）

**为什么 `mock.test.js` 报端口占用？**
它固定使用 8899 与 8799。先停止占用这些端口的进程，或临时修改脚本中的端口（属于测试代码变更）。

**测试会访问真实站点吗？**
不会。真实上游只由 `scripts/smoke.mjs` 触发。

**为什么不用 `node --test`？**
当前脚本以独立进程和退出码组织，便于 `&&` 串行与直接观察输出；迁移到 `node:test` 需要重构断言与端口管理。

**测试会打印敏感信息吗？**
不会。假凭据为固定字符串，输出只包含 SSE 文本和 PASS/FAIL。

## 相关文件清单

- `test/mock.test.js`
- `test/login-code.test.js`
- `test/upstream-error.test.js`
- 被测：`src/server.js`、`src/upstream.js`、`src/credentials.js`

## 变更记录

| 时间 | 变更 | 说明 |
| --- | --- | --- |
| 2026-11-03 00:19:02 | 初始化模块文档 | 基于当前测试生成；未修改源代码 |
