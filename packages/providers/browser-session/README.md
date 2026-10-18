# 受管浏览器会话提供方

状态：0.1 开发中（任务 BROWSER-01）。目标是让官方 Playwright MCP 工具和 EasyWork 当前会话右栏操作同一个受管 Chromium 页面。浏览器所有权和清理由官方 `SessionResources` 承担，工具接入使用官方 `McpClient`；本模块不实现第二套 Agent loop 或 MCP 传输。

目前已有可加载的 Host provider 入口。每个官方 Agent Session 分配独立临时 Chromium profile 和随机本机 CDP 端点，官方 `McpClient` 通过 `@playwright/mcp` 连接该浏览器；Session 关闭时清理进程和 profile。Host 内部的 `easyworkBrowserSession` 服务可捕获 JPEG 画面并执行点击、输入和滚动，所有操作经同一 `SessionResources` 队列串行化。真实浏览器集成测试验证两个官方 Agent Session 的工具发现、分别导航、页面隔离，以及 Host 点击被 MCP 页面快照观察到。

本包同时包含 Host 与 Client，Host 的启用条件和配置由 `easywork-bundle/cordis.patch.yml` 统一提供；普通 Web 预览使用官方 Playwright provider，只有传入 `DSH_ELECTRON_EXECUTABLE` 时才启用本包。`dsh.bundle.patch` 显式声明为空列表，表示本包不自行插入 Host 条目，也避免插件市场将只有 `dsh.client` 声明的包识别为纯客户端插件、绕过 Profile 条件无配置挂载 Host。修改包声明后需要重新安装预览包；`--skip-setup` 会继续复用已安装的旧声明。

原始 CDP 端点只保留在 Host。`/api/easywork-browser-session` 通过官方 Connection 的已认证 Fetch 路由接收当前个人本机身份的请求，按 Session ID 再解析实时 Agent；失效 Session 和非个人身份被拒绝。真实浏览器测试证明 Remote 点击会被 Agent 的 MCP 快照看到。该规则只覆盖个人本机部署，团队身份还没有会话归属授权，不能启用同一路由。

模块已有基于官方 `sidebar.right.pane.tab` 的 Client 组件，按当前 Session 拉取同页 JPEG 并把点击、键盘和滚动送回 Host；仅在浏览器工具实际使用后尝试自动打开。组件已构建，但尚未装入默认 bundle，也未做浏览器实机视觉/交互验收。用户明确要求 Desktop 不额外打包浏览器。Desktop 已有隔离 worker 入口，可复用 Electron 自带 Chromium；本模块新增 `electronExecutable` 路径按 Session 启动该 worker，并保留 Web 的外部浏览器路径。开发态 Electron worker 与 Playwright 连通、导航和点击探针通过，安装包尚未验证。正式接入前还须验证取消/恢复、并发工具调用、真实 HTTP Connection 准入、不同视口与键盘输入，以及 Windows/macOS 安装包内的 worker 启动。现阶段不得将其描述为已完成的浏览器侧栏体验。

当前源码精确锁定官方 DSH `0.2.1-rc.2` / Cordis `4.0.5`；当前实际运行与验收见[验收要求](../../../apps/web/docs/ACCEPTANCE.md)。上述旧探针不能代替本轮源码、浏览器实机和 Desktop 安装包验收。

源码模式启动 Electron worker 还需设置 `electronAppPath` 为 Desktop 应用目录。Desktop 自动通过 `EASYWORK_ELECTRON_APP_PATH` 传入该值；安装包模式省略它。真实 worker 回归测试使用 `DSH_ELECTRON_TEST_EXECUTABLE` 和 `DSH_ELECTRON_TEST_APP_PATH` 指定本机 Electron 与已构建的 Desktop。

Playwright 在首次启动会话浏览器时加载。仅导入提供方或启动工作区不会加载浏览器控制库；首次使用后的会话隔离与清理流程保持一致。
