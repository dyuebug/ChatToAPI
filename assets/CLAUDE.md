[根目录](../CLAUDE.md) > **assets**

# assets — 上游页面静态快照

## 模块职责

`assets/` 是从 chatopens.ai 站点保存下来的静态页面与脚本副本，用于理解上游页面结构、`data-action` 入口与登录流程。它**不是本项目源码**：

- 不被 `src/`、`scripts/`、`test/` 中的任何代码 `import` 或读取。
- 不由本地 Node 服务托管。
- 不参与构建、测试或运行时。

同类的根目录文件 `site_home.html` 是“选车 / List”页面的单文件快照。

## 内容分组

| 分组 | 代表文件 | 说明 |
| --- | --- | --- |
| 站点首页与列表 | `Home.html`、`List.html` 对应内容、`plan_home.html`、`plan_index.html` | 页面结构与入口按钮 |
| 登录 | `Login.html`、`Login.js`、`plan_login.html`、`plan_login_js.js` | 登录页、动态码相关脚本 |
| 订阅 / 定价 / 订单 | `Subscribe.html`、`Subscribe.js`、`PayOrder.js`、`plan_pricing.html`、`plan_order.html` | 业务页面参考 |
| 对话 / 文档 / 模型 | `plan_chat.html`、`plan_doc.html`、`plan_model.html`、`plan_chat_js_v_1_5.js` | 对话与模型列表页面 |
| 通知 / 代理 / 日志 | `Notice.html`、`Notice.js`、`plan_agent.html`、`plan_log.html` | 其他站点页面 |
| 第三方库 | `jquery.js`、`layui.js`、`qrcode.js`、`confetti.browser.min.js`、`plan_static_jquery.min.js`、`plan_marked_min_js.js`、`plan_highlight_min_js.js` | 站点使用的第三方前端库副本 |
| 全局脚本 | `sGlobal.js`、`wGlobal.js`、`plan_global.js`、`plan_sglobal.js` | 站点全局逻辑 |

共 47 个文件；文件清单可通过目录直接查看。

## 与源码的关系

- `src/credentials.js` 中的登录流程会打开 `/Web/List.html`，并根据 `data-action` 选择 AI 入口：
  - `AutoVIP${car}`
  - `AutoFree${car}`
  - `Jump${car}`
- 这些动作名与页面结构直接对应本快照中的 List / 首页内容。
- 若上游站点改版，选择器可能失效；应重新保存页面快照并更新 `src/credentials.js` 与 `docs/DEVELOPMENT.md`。

## 安全与使用注意

1. 快照可能包含站点内联脚本、第三方库与业务文案；不要直接部署到公网或作为本地服务静态目录。
2. 第三方库版权归各自作者；本目录仅作技术参考。
3. 不要在快照中补充真实账号信息、Cookie、Token 或 API Key。
4. 不要把本目录当作可信输入执行；其中的脚本可能依赖站点全局变量。

## 维护建议

- 若确认不再需要，可整体移到 `docs/reference/` 或加入 `.gitignore`，避免与运行时源码混淆。
- 更新快照时记录来源 URL 与抓取时间（不要记录登录态）。
- 修改 `src/credentials.js` 的选择器前，先在快照中确认 `data-action` 是否仍存在。

## 相关文件清单

- `assets/` 下 47 个静态文件
- `site_home.html`（根目录，选车页快照）
- 引用方：`src/credentials.js`

## 变更记录

| 时间 | 变更 | 说明 |
| --- | --- | --- |
| 2026-11-03 00:19:02 | 初始化模块文档 | 仅登记文件与用途，未读取或修改静态资源内容 |
