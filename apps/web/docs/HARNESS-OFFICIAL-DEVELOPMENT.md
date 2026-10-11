# 官方 Harness 扩展规范

外部插件只消费当前精确锁定发布包的公开 exports、类型、服务、Remote、Resource 与 Slot。发布包与现有公开探针为版本契约依据；文档和旧实现与锁定版本不一致时做最小验证，不读取私有入口、不修改官方核心或静默升级。

| 官方所有者 | 公开扩展面 | 自有用途 |
| --- | --- | --- |
| 左侧栏 | sidebar.panellist、sidebar.brand.*、settings 子 Slot | 品牌与独立业务入口 |
| 主区 | main；原生 main.conversation | 全局领域页面与返回原生会话 |
| 会话右栏 | rightbar.session、sidebar.right.*、ctx.sidebarRight | 当前 Session 的资源和成果 |
| 临时浮层 | shell.overlay 或页面所属局部层 | 选择器、确认与暂时提示 |

EasyWork 不复制 Workspace、Session 列表、Conversation、Composer、模型设置、插件管理或执行状态。左栏使用新稳定 list id，与 main keyed entry 配对，不占用已有 single/keyed owner。右栏属于确定 Session，tab 身份由 kind/address 决定；注册 tab definition 与 keyed pane 正文，通过公开 Resource provider 交接数据。

全局外观由 `easywork-ui` 提供同一份明暗主题令牌，`easywork-bundle` 通过官方 `ctx.theme.overrideTokens` 注册，并由 `ctx.effect` 释放。用户的 `light`、`dark`、`system` 偏好仍由官方设置拥有；移除 EasyWork 覆盖只恢复此前的主题叠加结果，不重写用户配置。业务页面复用共享控件、字体、间距和表面样式；官方侧栏、会话、设置与右栏继续使用自己的布局和行为，不依赖其编译后 CSS 类名或 DOM 层级。

DSH 升级时，除版本对齐、类型检查和完整构建外，还必须运行 `check:build` 中的主题契约检查：从当前安装的官方包验证使用的主题令牌，检查覆盖与释放以及用户偏好的保留。随后分别完成实际安装 Profile、打包 Desktop 和明暗模式下的页面、会话、设置与导航验收。令牌和 Slot 契约变化需要先适配再升级；无源码分叉不等于跳过兼容性验证。

Client 通过 `ctx.slots.inject` 等待 owner 声明，owner 卸载时撤销贡献。组件 props 来自公开 Slot 类型；owner 已知状态使用 props，私有 callback 使用 entry inject，共享视图使用 Slot store。React 组件不接收 Cordis ctx、Remote service、凭据或领域服务；复杂页面使用 TSX，由官方唯一 renderer 挂载。

Cordis 与官方 Harness 运行依赖通过 `peerDependencies` 声明兼容边界，开发依赖精确锁定。Client bundle 的 dsh.client.inject 记录所需官方模块；必需服务写入 inject，可选服务按操作解析，配置顺序不表示依赖。跨插件只用公开类型和服务，不导入内部组件或数据表。

service、Remote、registry、监听、timer、watcher、连接、子进程与临时资源属于当前 Fiber。返回 disposer 的注册用 `ctx.effect` 管理，事件用 ctx.on；顺序清理在同一异步 disposer 中等待。不得跨 Fiber 缓存 Session scope、service handle 或 AbortSignal。

官方 Skill registry/provider 拥有发现、正文按需加载与 /name 执行。全局技能管理不从 Session 汇总目录，也不冒用会话附件 receipt。创建技能交接原生 Session 与输入 action；导入经官方 Connection 鉴权的精确流式路由，只检查数据，限制大小和展开范围、拒绝穿越与符号链接，确认后原子发布。目录和修订由 Host 解析，不让 Client 拼接 Host 路径。停用和卸载可恢复且不修改原文。

当前技能管理采用公开 Client Connection 的 exact Fetch 适配生成器的外部 workspace 兼容限制；JSON 与 streaming route 各自有界、中止传播、稳定错误与清理，不复制成通用私有协议。其他一元业务协议优先官方 Typert 生成 Remote，Host 签名为唯一来源；lookup 提供身份解析而非权限。

每次变更核对官方 owner、公开入口、交接数据、生命周期和有限验收。需要新增能力时先验证公开包，未实现骨架不声明加载入口。原生输入、附件、权限、模型、Session、Skill、MCP 与文件执行继续由官方拥有。相关无密钥行为、typecheck、build 和独立安装检查完成后，再分别判定真实模型、界面及平台运行。
