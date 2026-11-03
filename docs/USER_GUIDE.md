# ChatToAPI 使用教程

## 1. 项目用途

ChatToAPI 将用户自己登录的 Chatopens 账号封装为本机 OpenAI 兼容接口。
调用方只需要使用本地生成的 `ctk_...` API Key，不需要接触上游 Cookie、
Bearer Token 或浏览器会话。

当前实现默认面向 Sorux 入口，并已验证 `DeepSeek-V4-Flash` 的真实上游
调用。项目只支持用户主动登录自己的账号，不提供账号共享、验证码代填或
第三方凭据导入服务。

## 2. 环境要求

- Windows、Node.js 20 或更高版本。
- 已安装 Google Chrome 或 Microsoft Edge。
- 能够访问 `https://www.chatopens.ai`。
- Windows 环境需要可执行 `curl.exe`，系统通常自带。

检查 Node.js 和 curl：

```powershell
node --version
curl.exe --version
```

## 3. 安装与首次启动

在项目根目录执行：

```powershell
npm install
npm start
```

### 3.1 使用运行管理脚本

Windows 下可以让项目在后台运行，并通过同一个脚本完成停止和监控：

```powershell
npm run service:start       # 后台启动，命令立即返回
npm run service:status
npm run service:monitor   # 按 Ctrl+C 退出监控
npm run service:stop
```

还提供 `npm run service:restart`。脚本只管理自己记录的 Node 进程，状态文件和
日志位于 `.chattoapi-run/`：`process.json`、`stdout.log`、`stderr.log`。如果直接
调用脚本，也可以使用：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/chattoapi.ps1 status
```

也可以在 `cmd.exe` 中运行，或直接双击根目录的 `chattoapi.bat`：

```bat
# 不带参数进入交互式菜单
chattoapi.bat

# 或直接传入命令
chattoapi.bat start
chattoapi.bat status
chattoapi.bat monitor
chattoapi.bat stop

# 明确接管配置端口上已运行的旧实例
chattoapi.bat adopt
```

菜单选项如下，输入对应数字后按回车：

```text
1. Start service
2. Stop service
3. Restart service
4. Show status
5. Monitor service
6. Adopt an existing service on the configured port
7. Exit
```

如果选择 `1` 启动时提示端口已被占用，先选择 `6`。程序会要求输入大写 `ADOPT`，
确认后才会记录该端口对应的 Node PID。接管成功后，状态、监控和停止操作都可以管理
这个旧实例；如果端口属于其他程序，接管会拒绝执行。

PowerShell 也可以显式进入菜单：

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts/chattoapi.ps1 menu
```

批处理入口不会修改 Windows 的全局 PowerShell 执行策略，只对当前调用临时使用
`Bypass`，然后把命令转交给同一个 PowerShell 管理脚本。

`service:start` 会等待 `/health` 返回 200 才报告启动成功；如果启动失败，请先查看
`.chattoapi-run/stderr.log`。标准输出可能包含首次生成的 API Key，请按敏感信息保护。

默认监听地址为：

```text
http://127.0.0.1:8787
```

首次启动时，终端会显示一次新生成的 `ctk_...` API Key。请立即保存。
服务重启后不会再次显示该 Key 的明文。

如果系统没有自动找到浏览器，可以显式指定 Chrome 路径：

```powershell
$env:CHATTOAPI_BROWSER_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
npm start
```

## 4. 登录和凭据捕获

### 4.1 启动登录

服务运行后，在本机访问：

```text
http://127.0.0.1:8787/auth/login
```

也可以运行独立登录助手：

```powershell
npm run login
```

程序会打开一个持久化浏览器窗口。首次使用时，按上游网站要求完成扫码或
动态码登录。

### 4.2 完成一次真实对话

登录成功后，必须进入实际 AI 对话页面并发送一条消息。推荐流程：

1. 在站点列表选择“全模型-镜像站”或 Sorux 入口。
2. 等待对话页面完全加载。
3. 发送一条简单测试消息，例如 `请仅回复 OK`。
4. 等待上游响应完成。

仅停留在登录页或“选车”列表页，通常不会产生最终对话请求，程序也就无法
完整捕获协议头。

### 4.3 查看登录状态

```powershell
Invoke-WebRequest http://127.0.0.1:8787/auth/status
```

重点字段：

- `loggedIn`：是否存在有效的加密上游凭据。
- `needsLogin`：是否需要重新登录。
- `apiKeyConfigured`：本地是否已经生成 API Key 哈希。
- `loginInProgress`：捕获浏览器是否仍在运行。
- `captureAttempts`：捕获到认证请求的次数。
- `lastCapturePath`：最近一次捕获来源路径。
- `recentTraffic`：最多 40 条脱敏请求/响应摘要。

`recentTraffic` 只包含方法、路径、资源类型、状态、内容类型、认证头是否
存在，以及协议字段的形状；不会返回 Cookie、Token、动态码、请求正文或
响应正文。

### 4.4 动态码页面无响应时

打开本地表单：

```text
http://127.0.0.1:8787/auth/login/form
```

输入动态码后点击“确认”。如果页面提示“登录成功，但凭据尚未捕获”，进入
Sorux 对话并发送一条消息，然后重新访问 `/auth/login`。强制重新打开捕获
窗口时使用：

```text
http://127.0.0.1:8787/auth/login?force=1
```

## 5. API Key 管理

### 5.1 使用已有 Key

Key 只通过请求头传递：

```text
Authorization: Bearer ctk_你的Key
```

不要把 Key 放在 URL、查询参数、日志或代码仓库中。

### 5.2 轮换 Key

轮换会立即使旧 Key 失效，新 Key 只在当前命令输出一次：

```powershell
npm run key:rotate
```

轮换后，所有客户端都必须更新为新 Key。

### 5.3 Key 丢失

程序只保存 Key 的哈希，无法从加密存储反向恢复明文。如果 Key 丢失，执行
`npm run key:rotate` 生成新 Key，并更新所有客户端配置。

## 6. 调用 API

### 6.1 查看模型

```powershell
$headers = @{ Authorization = 'Bearer ctk_你的Key' }
Invoke-WebRequest `
  http://127.0.0.1:8787/v1/models `
  -Headers $headers
```

当前服务列出：

- `deepseek-v4-flash`
- `deepseek-v4-pro`
- 兼容保留的 GPT 别名

实际可用模型以当前上游账号和站点返回结果为准。当前账号已验证的模型是
`deepseek-v4-flash`。

### 6.2 非流式调用

```powershell
$headers = @{
  Authorization = 'Bearer ctk_你的Key'
  'Content-Type' = 'application/json'
}

$body = @{
  model = 'deepseek-v4-flash'
  stream = $false
  messages = @(
    @{ role = 'user'; content = '请仅回复 OK' }
  )
} | ConvertTo-Json -Depth 8

Invoke-WebRequest `
  http://127.0.0.1:8787/v1/chat/completions `
  -Method Post `
  -Headers $headers `
  -Body $body
```

响应是标准 OpenAI 风格的 `chat.completion` JSON，包含 `choices[0].message`。

### 6.3 SSE 流式调用

```powershell
$headers = @{
  Authorization = 'Bearer ctk_你的Key'
  'Content-Type' = 'application/json'
}

$body = @{
  model = 'deepseek-v4-flash'
  stream = $true
  messages = @(
    @{ role = 'user'; content = '请用一句话介绍自己' }
  )
} | ConvertTo-Json -Depth 8

Invoke-WebRequest `
  http://127.0.0.1:8787/v1/chat/completions `
  -Method Post `
  -Headers $headers `
  -Body $body
```

流式响应使用 `text/event-stream`，最后以：

```text
data: [DONE]
```

结束。

### 6.4 OpenAI SDK

服务兼容常见 OpenAI SDK 的 `base_url` 配置：

```python
from openai import OpenAI

client = OpenAI(
    api_key="ctk_你的Key",
    base_url="http://127.0.0.1:8787/v1",
)

result = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[{"role": "user", "content": "请仅回复 OK"}],
)

print(result.choices[0].message.content)
```

## 7. 支持范围和限制

当前支持：

- OpenAI 风格的 `messages`、`model`、`stream`。
- system、user、assistant 多轮消息的文本合并。
- 非流式 JSON 和 SSE 流式响应。
- 文本消息中的常见字符串内容。

当前未完整映射：

- `temperature`、`max_tokens`、`top_p` 等采样参数。
- tool calls / function calling。
- 多模态图片内容，仅做占位处理。
- 上游持久化 `conversation_id`，当前每次请求按单轮上游请求发送。

## 8. 常见故障

### 返回 401 invalid or missing API key

检查：

- 请求是否包含 `Authorization: Bearer ctk_...`。
- Key 是否完整，是否误加了引号或空格。
- 是否刚执行过 `npm run key:rotate`。

### 返回 401 upstream error

这表示上游凭据失效或上游返回未登录。程序会自动清除本地失效凭据。
重新访问 `/auth/login`，完成登录并发送一条真实消息。

### 返回 502 api mode not supported

程序会自动尝试兼容的 `/backend-api/conversation`。如果仍失败，先调用
`/v1/models` 查看账号当前可用模型，并使用其中实际存在的模型 ID。

### HTTPS 请求超时

Windows 下程序默认使用系统 `curl.exe` 和 Schannel。确认 `curl.exe` 可执行，
并检查站点是否能在浏览器中正常访问。不要把 Cookie 或 Token 放入公开日志。

## 9. 安全建议

- 不要分享 `data/credentials.enc.json`、`.chattoapi-master.key`、`config.json`。
- 不要提交 `data/`、浏览器 Profile 或本地 Key 到 Git。
- 默认只绑定 `127.0.0.1`，不要直接暴露到公网。
- 如需远程使用，在反向代理层增加 HTTPS、认证、限流和访问审计。
- 不要启用包含真实请求头的 debug 日志后再把日志上传到公共位置。
