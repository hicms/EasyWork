# 默认组合包

> GitHub 模块制品与兼容矩阵：[发布说明](https://github.com/techflag/easywork/releases)。当前验证 Harness **0.1.6-alpha.2 Web**；内置 **0.1.2-rc.1** 的旧桌面入口缺失尚未修复，本包不包含该兼容修复。

状态：**P0 实现中，含 P1 展示切片**。当前包含安装/生命周期探针、公共侧栏、全局技能目录和真实新任务入口；完整产品组合尚未实现。

- 实现阶段：P0
- 主任务：P0-02，详见 [需求与范围](../../apps/web/docs/REQUIREMENTS.md)
- 职责：组合各功能插件，预构建 tgz 可安装。
- 边界：不实现 Agent loop 或私有启动器。

## 开发前阅读

[规则](../../apps/web/AGENTS.md)、[验收要求](../../apps/web/docs/ACCEPTANCE.md)、[契约](../../apps/web/docs/CONTRACTS.md)、[团队设计](../../apps/web/docs/CONTRACTS.md)。

所有业务操作遵守服务端主体和组织上下文；页面与 Agent 工具调用相同领域服务。可选功能接入通过公开契约与生命周期注入。

## 验收与下一步

### 本地默认插件

新建工作区和新会话会拒绝磁盘、共享盘或文件系统根目录，请选择具体的可写子文件夹。新会话目录不可用时，界面会提示检查磁盘连接、目录权限和可用空间，也可从侧栏添加其他文件夹作为工作区；不会自动迁移已有会话、切换到其他目录或删除文件。该处理由 Desktop/Web 共用的 Profile 提供，已有会话仍可打开。

文件与目录右键菜单：右侧栏“文件”树的行、已发送消息中的 `@` 文件/目录引用，以及助手回复里的文件链接，右键会出现按类型区分的菜单。文件提供预览、打开、打开方式、在文件管理器中显示、复制路径、复制相对路径和添加到对话；目录提供在文件管理器中打开、复制路径、复制相对路径和添加到对话。打开类动作只在 Host 报告可使用桌面时出现，依赖官方 Session Remote 的 `canOpenWorkspacePath`、`openWorkspacePath` 与 `workspacePathApplications`。输入框与其他可编辑区域、选中文字内的右键、助手回复里的目录和行内代码路径保持原生菜单。该能力只读取 DSH 已渲染的 DOM 标记，不修改 DSH；`apps/web/tests/file-context-menu-contract.test.mjs` 在升级 DSH 时核对这些标记，`context-menus.browser.mjs` 用无头 Chromium 验证拦截与放行（菜单组件为替身，真实菜单外观需在 Desktop/Web 中验收）。

网页链接右键菜单：会话消息区里的 http/https 链接（Markdown 链接和搜索来源链接）右键会出现“在侧栏浏览器中打开”（仅当侧栏注册了浏览器页类型）、“在浏览器中打开”和“复制链接地址”，Desktop 与 Web 共用同一实现，左键行为仍由官方链接处理。输入框、选中文字内的右键、mailto 与会话外的链接保持原生菜单。`apps/web/tests/file-context-menu-contract.test.mjs` 同样核对官方链接锚点与打开路径。

技能、专家、资料库、连接器和项目由本仓库源码构建，随应用提供本地默认版本。插件安装与管理使用完整官方 DSH 界面，保留社区市场入口。个人 Profile、配置、数据和显式安装的插件由官方加载机制管理；官方 DSH 及依赖继续使用 `upstream.json` 锁定版本。

整体外观通过公开的 `ThemeRuntime.overrideTokens` 应用 `easywork-ui` 共享配色与尺寸。主题层由 Cordis 注入和 effect 管理，停用 bundle 后撤销自身覆盖，恢复此前的主题组合；不写用户的浅色、深色或跟随系统偏好。官方 Sidebar、Conversation、Composer、Settings 和右栏仍由官方包渲染。升级 DSH 时，`apps/web/tests/theme-contract.test.mjs` 核对安装包实际消费的 token 和主题生命周期，并继续执行版本对齐、打包运行与 UI 验收。

Desktop 与 Web 的空会话首页共用 EasyWork Logo 和名称，Logo 通过公开 `conversation.hero.brand.mark` Slot 注入。首页标题与思考状态文案由本包集中维护中英翻译：显示“正在思考…”、“正在思考，已用时 …”及“思考完成”，保留原生耗时与无障碍状态。锁定版本的 LocaleRuntime 没有翻译覆盖层，因此本包只装饰公开的 `bind` 方法来替换有限键；不修改官方词典、语言偏好或会话实现，停用时撤销装饰与自有词典。`apps/web/tests/branding-contract.test.mjs` 核对锁定官方消费者、语言回退和恢复行为。

插件激活前的启动加载页显示“EasyWork / 正在加载插件…”。本包与 Desktop carrier 共用 `startup-branding.mjs`，只在发送给浏览器的官方入口脚本响应中替换这两个字面量；HTML 指向独立的脚本响应地址以避免复用旧缓存，启动页首次创建即使用新文案。官方发布文件、加载进度和失败处理保持原样；Web 路由与 index tap 由 Profile 生命周期管理。`apps/web/tests/startup-branding.test.mjs` 核对当前官方发行包、两端响应和停用恢复。

完成对应 PLAN 任务及 [验收矩阵](../../apps/web/docs/ACCEPTANCE.md) 场景，记录真实测试证据后才更新状态。先验证公开接口，再实现；Host 入口输出激活/清理标记；Client 通过官方 Slots 提供 EasyWork 导航、业务面板及诊断面板。新任务直接进入原生 Conversation，诊断页调用真实 pluginInventory Remote，不提供假业务响应。

本地候选版本 **0.1.0-alpha.46**。build/typecheck 使用包内脚本，安装验证由根 scripts/probe-install.mjs 提供。源码经 TypeScript/TSX 编译后打包，不依赖上游 checkout。

Skill 已拆为 `easywork-plugin-skills@0.1.0-alpha.30` 的独立 Host/Client 安装层，本包不再导入或直接调用其初始化函数。开发时运行 `corepack pnpm build` 和 `corepack pnpm preview:install`，由官方 CLI 将这两个精确版本的 tgz 安装到预览 Profile。仅安装本包提供品牌、工作台展示和诊断，不会暗中初始化 Skill；需要技能时显式安装 Skill 包。

Workbench alpha.11 仍随展示产物编译，但通过 `ctx.plugin(workbench)` 建立正式子插件生命周期。它尚无独立安装制品，本轮不宣称所有规划模块均可独立分发。技能页面和侧栏能力中心入口归 Skill Client 所有。初始 URL 在官方 Client 组合完成后解析，缺失页面回到原生 Conversation，避免先选择尚未注册的面板。

浏览器验收：根目录先 build，再运行 corepack pnpm probe:browser。`easywork-view=home` 为旧地址兼容并归一化到原生 `conversation`；接入诊断必须显式使用 `diagnostics=1&easywork-view=diagnostics`，普通产品 URL 不注册诊断页面或导航。新任务使用 Harness 原生空会话编辑器。无需模型 API Key。
