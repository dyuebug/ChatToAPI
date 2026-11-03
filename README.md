# ChatToAPI

将已登录的 Chatopens 账号转换为本地 OpenAI 兼容接口。项目只支持用户主动登录自己的账号；登录凭据保存在本机加密文件中，不会返回给 API 客户端。

详细文档：

- [用户使用教程](docs/USER_GUIDE.md)
- [开发文档](docs/DEVELOPMENT.md)

## 首次启动

要求 Node.js 20+，并安装 Chrome 或 Edge。启动：

```powershell
npm install
npm start
```

也可以使用项目自带的 PowerShell 管理脚本在后台运行：

```powershell
# 启动后台服务（命令立即返回，后台等待 /health 返回 200）
npm run service:start

# 查看进程和健康状态
npm run service:status

# 持续监控，按 Ctrl+C 退出监控
npm run service:monitor

# 停止由脚本启动的实例；也支持 service:restart
npm run service:stop
```

Windows `cmd.exe` 或资源管理器中也可以直接使用根目录的 `chattoapi.bat`：

```bat
# 不带参数进入交互式菜单
chattoapi.bat

# 也可以直接选择具体操作
chattoapi.bat start
chattoapi.bat status
chattoapi.bat monitor
chattoapi.bat stop

# 明确接管已在配置端口运行的旧实例（需确认）
chattoapi.bat adopt
```

直接运行 `chattoapi.bat` 后，在菜单中输入数字：

```text
1. Start service
2. Stop service
3. Restart service
4. Show status
5. Monitor service
6. Adopt an existing service on the configured port
7. Exit
```

如果启动时提示端口已被占用，先选择 `6`。菜单会要求输入 `ADOPT`，确认后记录该
Node 进程的 PID；之后可以通过菜单执行状态、监控和停止。无法确认进程属于本项目时，
接管会自动取消。

PowerShell 下也可以进入同一个菜单：

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts/chattoapi.ps1 menu
```

批处理入口会自动调用 PowerShell，并使用 `-ExecutionPolicy Bypass` 仅对本次调用生效，
不会修改系统执行策略。

脚本将 PID 状态保存到 `.chattoapi-run/process.json`，标准输出和错误输出保存到
`.chattoapi-run/stdout.log`、`.chattoapi-run/stderr.log`。运行目录已加入 Git 忽略，
停止命令只会处理状态文件中、PID 与启动时间匹配的 Node 进程。

如需在不影响已有实例的情况下并行运行，可临时设置 `CHATTOAPI_PORT`；登录浏览器 Profile 也可通过 `CHATTOAPI_PROFILE_DIR` 指定独立目录。

首次启动会在终端显示一次 `ctk_...` API Key。请立即保存；服务重启后不会再次显示明文 Key。

如果自动找不到浏览器，可设置浏览器可执行文件路径：

```powershell
$env:CHATTOAPI_BROWSER_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
npm start
```

## 登录与凭据管理

可以直接运行登录助手：

```powershell
npm run login
```

它会打开持久化浏览器并等待登录请求捕获，默认最多等待 10 分钟。也可以在服务运行后访问本机接口 `/auth/login` 触发相同流程。

1. 仅从本机访问 `http://127.0.0.1:8787/auth/login`。
2. 在弹出的浏览器窗口中完成账号登录。
3. 登录成功后，在站点首页选择一个 AI 入口进入实际对话（例如“全模型-镜像站”），再发送一条消息。仅停留在登录页或站点列表页不会产生 Bearer 请求，服务无法完成凭据捕获。
4. 通过 `http://127.0.0.1:8787/auth/status` 查看是否完成登录（只返回状态，不返回凭据）。

凭据保存位置默认为 `data/credentials.enc.json`，加密主密钥默认为项目根目录的 `.chattoapi-master.key`。这两个路径都已加入 `.gitignore`。也可以设置 `CHATTOAPI_MASTER_KEY` 覆盖本地密钥文件。

服务启动时会检查已保存 JWT 的过期时间；上游返回 401 后会自动清除失效凭据。此时重新访问 `/auth/login` 即可完成下一次登录；如果上一次登录窗口仍在运行，使用 `http://127.0.0.1:8787/auth/login?force=1` 先关闭旧窗口并重新打开。

`/auth/status` 只返回登录状态、捕获请求次数和最近路径（`captureAttempts`、`lastCapturePath`），以及最多 40 条脱敏流量摘要（`recentTraffic`）。摘要包含方法、路径、资源类型、内容类型和认证头是否存在；对会话协议请求还会补充 `bodyShape`，只记录字段名、类型、数组长度、字符串长度、HTTP 状态和 SSE 帧结构，不会返回 Cookie、Token、查询参数、请求正文或响应正文。

如果上游动态码页面按钮无响应，可打开本地表单 `http://127.0.0.1:8787/auth/login/form`；动态码提交默认 15 秒超时，可通过 `auth.loginCodeTimeoutMs` 调整。

默认会直接打开站点登录页 `/Web/Login.html`，捕获上游 `/backend-api/f/conversation` 和站点 `/API/Web/ConversationMessage/Completions` 请求；同时会检查登录页面的 `localStorage["token"]` 与当前站点 Cookie，以覆盖登录接口只返回成功码的情况。发送请求遇到 404/405，或新版路径返回明确的 `api mode not supported` 时，会自动回退到兼容的 `/backend-api/conversation`，也可通过 `upstream.conversationFallbackPath` 自定义。如果站点改版，可在 `auth.loginUrl` 或 `auth.capturePaths` 中调整路径。检测到过期 Token 时只清理该 localStorage 项，不会删除其他浏览器数据。

捕获器会先保存首个同时带 `Authorization` 和 Cookie 的认证请求，但不会因为普通初始化请求（例如用户授权或定价请求）立即关闭浏览器；只有观察到最终对话接口响应后才结束本次协议捕获。这样可以避免登录成功后尚未发送消息就错过真实对话请求。

## 调用 API

```powershell
$headers = @{ Authorization = 'Bearer ctk_你的Key'; 'Content-Type' = 'application/json' }
$body = @{ model = 'gpt-5.5-mini'; stream = $true; messages = @(@{ role = 'user'; content = '你好' }) } | ConvertTo-Json -Depth 8
Invoke-WebRequest http://127.0.0.1:8787/v1/chat/completions -Method Post -Headers $headers -Body $body
```

也兼容常见 OpenAI SDK 的 `base_url=http://127.0.0.1:8787/v1` 配置。

### 接入 magpie

通过本机 magpie 网关统一调用 ChatToAPI；在两个终端依次运行：

```powershell
npm start
npm run magpie:register
```

注册会自动轮换 API Key，使旧 Key 立即失效。详见 [magpie 接入文档](docs/MAGPIE.md)。

## 轮换 API Key

轮换会立即使旧 Key 失效，并且新 Key 只在本次命令输出：

```powershell
npm run key:rotate
```

## 当前边界

- 上游会话仍按单轮 HTTP 请求发送，但本地会将支持的多轮消息按角色合并到一个上下文文本中，尚未维护上游 `conversation_id`。
- `temperature`、`max_tokens`、tool calls 和多模态消息暂未映射到上游。
- 上游请求和流式读取默认总超时 120 秒，可通过 `upstream.requestTimeoutMs` 调整。
- Windows HTTPS 请求优先通过系统 `curl.exe`（Schannel）传输，以兼容部分站点的 TLS 重协商；请求配置文件只在临时目录短暂存在并在进程结束后清理。请确保系统可执行 `curl.exe`。
- 默认只绑定回环地址；如需远程访问，必须在反向代理层增加 TLS、认证和限流。
- 不要执行真实凭据的 debug 日志，也不要把 `config.json`、`headers.txt`、`data/` 或 `.chattoapi-master.key` 分享出去。
