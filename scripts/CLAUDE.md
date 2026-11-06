[根目录](../CLAUDE.md) > **scripts**

# scripts — 登录与运维脚本

## 模块职责

`scripts/` 提供与核心服务解耦的操作入口：

1. 独立完成浏览器登录与凭据捕获。
2. 轮换本地 API Key。
3. 兼容旧版手工导入请求头。
4. 对真实上游做一次性烟雾测试。
5. 在 Windows 下后台启动、停止、监控、接管 Node 服务。

脚本通过 `import` 复用 `src/config.js`、`src/credentials.js`、`src/upstream.js`，不复制业务逻辑。

## 文件与入口

| 文件 | 入口方式 | 职责 |
| --- | --- | --- |
| `login.mjs` | `npm run login -- [--station OneOpenAI]` | 指定站点启动登录浏览器，轮询该站 `status().stations[id].loggedIn`，成功后关闭并退出 0；超时退出 1 |
| `rotate-key.mjs` | `npm run key:rotate` 或 `node scripts/rotate-key.mjs` | 生成新 `ctk_...` Key，只向 stdout 输出一次；旧 Key 立即失效 |
| `import-headers.mjs` | `node scripts/import-headers.mjs [headers-file]` | 旧版兼容：解析浏览器 Request Headers，写入 `config.json` |
| `smoke.mjs` | `node scripts/smoke.mjs [model] [text] [--station ...]` | 注入站点加密凭据后直连真实上游；默认 Sorux `gpt-5-5-mini` / `hi`，`--station OneOpenAI` 默认 `work-gpt-6.1-terra`，120 秒硬超时 |
| `daemon.mjs` | 由 `chattoapi.ps1` 调用 | 以 detached 方式启动 `node src/index.js`，写 PID 文件 |
| `service.mjs` | `npm run service:*` | 跨 shell 包装器：用 Node 调用 `chattoapi.ps1`，兼容 CMD / PowerShell / Git Bash |
| `chattoapi.ps1` | `npm run service:*`、`chattoapi.bat` | Windows 服务管理：`menu/start/stop/restart/status/monitor/console/adopt/login-sorux/login-work` |

根目录的 `chattoapi.bat` 是 CMD / 资源管理器入口：无参数进入交互菜单；`start` / `restart` 以最小化窗口异步调用 PowerShell；其余命令同步转发。仅对本次调用使用 `-ExecutionPolicy Bypass`，不修改系统策略。

`chattoapi.ps1` 以 **UTF-8 with BOM** 保存。Windows PowerShell 5.1 在没有 BOM 时会按 ANSI 解析，中文注释的尾字节可能吞掉换行并导致语法错误。

## 对外接口

### CLI

```powershell
npm run login                           # 登录 Sorux
npm run login -- --station OneOpenAI    # 登录 ChatGPT-Work
npm run login:sorux                     # 同上，显式 Sorux
npm run login:work                      # 同上，显式 ChatGPT-Work
npm run smoke -- [model] [text] [--station ...]
npm run key:rotate
npm run service:console                 # 打开本地 Web 控制台
npm run service:adopt
node scripts/smoke.mjs [model] [text] [--station Sorux|OneOpenAI]
node scripts/import-headers.mjs [path-to-headers-file]
```

### Windows 服务管理

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts/chattoapi.ps1 menu
powershell.exe ... -File scripts/chattoapi.ps1 start
powershell.exe ... -File scripts/chattoapi.ps1 stop
powershell.exe ... -File scripts/chattoapi.ps1 restart
powershell.exe ... -File scripts/chattoapi.ps1 status
powershell.exe ... -File scripts/chattoapi.ps1 monitor
powershell.exe ... -File scripts/chattoapi.ps1 console
powershell.exe ... -File scripts/chattoapi.ps1 adopt
powershell.exe ... -File scripts/chattoapi.ps1 login-sorux
powershell.exe ... -File scripts/chattoapi.ps1 login-work
```

参数：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `-Command` | `menu` | `menu/start/stop/restart/status/monitor/console/adopt/login-sorux/login-work` |
| `-IntervalSeconds` | 5 | `monitor` 轮询间隔，1–3600 |
| `-StartupTimeoutSeconds` | 30 | 启动后等待 `/health` 的超时，5–300 |
| `-LoginTimeoutSeconds` | 600 | 等待站点登录捕获的超时，30–3600 |

`npm run service:*` 通过 `scripts/service.mjs` 调用上述 PowerShell 命令，因此在 CMD、PowerShell 与 Git Bash 中行为一致；`node scripts/service.mjs <command> [秒数]` 等价。

## 关键依赖与配置

- Node 内置：`fs`、`path`、`child_process`。
- 复用模块：`src/config.js`、`src/credentials.js`、`src/upstream.js`、`src/logger.js`。
- Windows 需要 PowerShell 5+、`node.exe`、`curl.exe`。
- 服务地址解析顺序：环境变量 `CHATTOAPI_HOST` / `CHATTOAPI_PORT` → `config.json` 的 `host` / `port` → 默认 `127.0.0.1:8787`。
- 运行目录：`.chattoapi-run/`。

## 数据模型与状态文件

### `daemon.mjs`

参数顺序固定：

```text
node scripts/daemon.mjs <project-root> <stdout-log> <stderr-log> <pid-file>
```

行为：以 `cwd = projectRoot`、`detached: true`、`windowsHide: true` 启动 `node src/index.js`，stdout/stderr 追加写入指定日志，PID 写入指定文件，随后 `unref()`。

### `.chattoapi-run/process.json`

由 `chattoapi.ps1` 写入：

```text
{
  pid, host, port, url, startedAt
}
```

- `startedAt` 用于校验 PID 是否被系统复用（启动时间偏差 > 5 秒视为非本进程）。
- `adopt` 额外写入 `adoptedAt`。
- 同目录还包含 `stdout.log`、`stderr.log`、`launcher.log`、`launcher-error.log`、`child.pid`、`ui-token`。

### `.chattoapi-run/ui-token`

由 `src/index.js` 在未设置 `CHATTOAPI_UI_TOKEN` 时写入，权限限制为当前用户。`chattoapi.ps1` 用它拼接 `UiUrl = <url>/ui?t=<token>`：

- `status` 的 `UiUrl` 字段为空表示未运行、控制台被禁用或令牌文件不存在。
- `console` 读取该文件并用默认浏览器打开；环境变量 `CHATTOAPI_UI_TOKEN` 优先。
- `start` 在实际拉起新实例前删除旧文件，避免 `ui.enabled=false` 时残留；`stop`（包括未运行时）也会删除。
- 令牌是敏感信息，不在 `monitor` 输出中打印。

### 服务管理行为

- `start`：若已有受管进程且健康则直接返回；若端口已有响应则拒绝；通过 `daemon.mjs` 启动并等待 `/health` 200。后台进程用 `Start-Process -WindowStyle Hidden` 拉起，不继承调用方 stdout，避免 `npm run service:start` 在管道中挂起。
- `stop`：只停止状态文件中 PID 与启动时间匹配的进程；10 秒未退出则强制结束。
- `status`：输出 `Running`、`Healthy`、`Pid`、`Host`、`Port`、`Url`、`UiUrl`、`StartedAt`、日志路径。
- `console`：以 `/health` 判断服务可用（状态文件丢失或 `npm start` 启动时也可用），读取启动令牌并打开本地控制台；无法打开浏览器时提示复制 URL。
- `monitor`：循环打印 `时间 [healthy|starting/unhealthy|stopped] pid=... url=...`，Ctrl+C 退出。
- `adopt`：要求目标端口 `/health` 正常且监听进程名为 `node`；交互菜单中必须输入大写 `ADOPT`。
- `login-sorux` / `login-work`：服务健康时调用 `POST /auth/login?station=...`，让运行中实例自己完成捕获，并轮询 `/auth/status` 直到该站 `loggedIn` 或 `-LoginTimeoutSeconds` 超时；服务未运行时退化为 `node scripts/login.mjs --station ...`。
- 交互菜单项 8 / 9 分别对应两种站点登录，10 为退出。

## 实现差异与注意点

以下差异来自当前源码，修改脚本前必须了解：

1. **`smoke.mjs` 已注入加密凭据。** 它创建 `CredentialManager` 并按 `--station`（缺省取模型所属站点）调用 `loadIntoConfig()`，因此可使用浏览器登录保存的凭据；未保存凭据时会提示先执行登录。
2. **`import-headers.mjs` 是旧版兼容路径。** 它把 Cookie / Bearer Token 明文写入 `config.json`；而正式服务启动时 `CredentialManager.loadIntoConfig()` 会用加密状态覆盖 `cfg.upstream.credential`，没有加密状态时则置空。也就是说，手工导入的明文凭据**不会**被当前主服务直接采用。新环境应使用浏览器登录。
3. **`rotate-key.mjs` 会直接覆盖状态并落盘。** 若服务正在运行，它的内存中仍是旧哈希；需要重启服务或通过服务接口完成后续操作，才能保证运行中实例接受新 Key。
4. **`chattoapi.ps1` 仅支持 Windows。** 它依赖 `Get-NetTCPConnection`、`netstat.exe`、`Start-Process` 与 PowerShell 进程 API；`service.mjs` 在非 Windows 平台会直接提示改用 `npm start`。

## 测试与质量

- `scripts/` 没有独立单元测试；其复用逻辑由 `test/` 覆盖。
- `scripts/smoke.mjs` 是手工验证工具，会消耗真实账号额度，不应纳入自动测试。
- 脚本只向 stderr 输出提示，向 stdout 输出结果（如新 Key、smoke 内容）。
- `login.mjs` 与 `rotate-key.mjs` 会读写加密状态；测试时不要指向真实 `data/`。

## 常见问题（FAQ）

**启动提示端口已被占用怎么办？**
先执行 `chattoapi.bat adopt` 或 `npm run service:*` 对应命令；接管需要确认目标端口由 Node 进程监听且 `/health` 正常。也可以设置 `CHATTOAPI_PORT` 换端口。

**后台服务日志在哪里？**
`.chattoapi-run/stdout.log` 与 `.chattoapi-run/stderr.log`。首次启动的明文 API Key 可能出现在 stdout，按敏感信息保护。

**为什么 `login.mjs` 超时？**
登录后必须进入对应站点的 AI 入口并发送一条消息，才能捕获最终对话请求。默认等待 `auth.loginTimeoutMs`（10 分钟）。Work 站使用独立 Profile，需单独执行 `npm run login:work`（菜单项 9 等价）。

**`rotate-key.mjs` 后旧客户端报 401？**
轮换会立即覆盖哈希，旧 Key 失效。把新 Key 更新到所有客户端；运行中的服务可能需要重启以加载新状态。

**`smoke.mjs` 失败会影响服务吗？**
不会修改服务状态，但会真实请求上游并消耗额度；失败时输出错误与 HTTP 状态。它只读取加密凭据，不会写回。

**`chattoapi.ps1` 能在 Linux/macOS 用吗？**
不能，服务管理脚本仅面向 Windows。Linux/macOS 可直接 `npm start`。

## 相关文件清单

- `scripts/login.mjs`
- `scripts/rotate-key.mjs`
- `scripts/import-headers.mjs`
- `scripts/smoke.mjs`
- `scripts/daemon.mjs`
- `scripts/service.mjs`
- `scripts/chattoapi.ps1`
- `chattoapi.bat`（根目录）
- `.chattoapi-run/`（运行时生成，已忽略）

## 变更记录

| 时间 | 变更 | 说明 |
| --- | --- | --- |
| 2026-11-03 00:19:02 | 初始化模块文档 | 基于当前脚本生成；未修改源代码 |
| 2026-11-03 00:19:02 | 补充实现差异 | 记录 smoke 凭据来源、import-headers 旧路径与 rotate-key 运行中状态问题 |
| 2026-11-03 21:30:00 | 新增控制台运维入口 | `console` 子命令、菜单项 7、`UiUrl` 状态字段与 `ui-token` 生命周期 |
| 2026-11-04 01:31:00 | 支持双站点登录与烟测 | `login.mjs --station`、`smoke.mjs` 注入站点凭据并输出 Work 工具阶段 |
| 2026-11-05 21:40:00 | 重构启动入口 | 新增 `service.mjs` 跨 shell 包装；`npm run service:*` 改为 Node 调用；菜单新增 Sorux / Work 登录；`start` 改用 `Start-Process` 避免管道挂起；脚本转为 UTF-8 BOM |
