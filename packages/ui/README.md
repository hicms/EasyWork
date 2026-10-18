# 共享展示组件

状态：**已实现，0.1.0-alpha.7**。作为 EasyWork 插件共享的纯展示组件包，由官方 Client renderer 渲染。

当前提供 LogoMark、Icon、IconButton、NavItem、NavGroup、主题令牌、导航样式和公共 Modal。公开 `src/index.ts` 只导出 API；TSX 组件、设计令牌和 CSS 字符串分别位于 `components/` 与 `styles/`。共享包不创建 React root，不持有 Cordis Context、Remote、Host、账号、数据库或执行状态。领域插件只传入标题、正文、动作和关闭回调。

Modal 统一处理 `role=dialog`、遮罩与 Escape 关闭、焦点约束、关闭后的焦点返回和窄屏保留边距显示。技能详情已经复用该组件；专家、连接器和行业应用后续可以直接复用相同外壳，不复制弹框生命周期。

规范与边界见 [UI 规范](../../apps/web/docs/ARCHITECTURE.md)、[共享页面契约](../../apps/web/docs/CONTRACTS.md)、[ADR 0014](../../apps/web/docs/CONTRACTS.md)。

本版本通过 bundle 组合，子包不独立声明 dsh 加载入口。共享包只负责展示和可访问性交互，不承载技能安装、权限、团队对象或其他领域事实。

页面与弹窗使用 Harness 原生主题语义颜色，跟随官方外观设置及系统明暗切换。

`themeTokenOverrides` 是 Astryx 风格配色的唯一来源，由 EasyWork bundle 通过官方 `ThemeRuntime.overrideTokens` 应用。共享页面、官方会话、侧栏、设置和预览继续使用同一套 DSH 变量；没有第二套 React runtime 或复制的官方界面。

`pageCss` 提供统一页面节奏。普通页面根使用 `easywork-page`；保留领域布局的页面使用 `easywork-surface`。公共类包括 `easywork-page-content`、`easywork-page-header`、`easywork-page-title`、`easywork-page-description`、`easywork-page-eyebrow`、`easywork-toolbar`、`easywork-card` 和 `easywork-empty`。页面根、公共表单和 Modal 提供 `--easywork-*` 语义变量，颜色引用官方主题；领域组件只扩展自己的布局，不覆盖官方壳的内部选择器。

公共 Button/Input 适配官方 dsh-client-ui-primitives@0.2.1-rc.2；Select/Textarea 使用 HTML 原生语义，controlsCss 提供统一 36px 表单尺寸及主题状态。业务样式放在 easywork-business cascade layer，原生控件外观优先；controlsCss 必须与管理视图样式一起加载。
