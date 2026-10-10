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

### 插件版本与手动更新

官方「插件」页面新增「插件版本与更新」入口。页面展示当前安装版本、来源、可用版本、兼容检查及更新状态；点击「检查更新」才联网，确认版本和说明后才安装，不随启动检查或自动升级。成功安装后提示重启，重启后按实际版本及官方插件运行状态核对生效。

技能、专家、资料库、连接器和项目使用独立 Rust 后端提供的 [插件服务中心](../../apps/plugin-center/README.md)。在更新页保存中心地址及 Ed25519 发布公钥；未配置时如实显示无更新源。中心签名清单和 SHA-512 固定本次安装包，不追随变化的 latest。官方 DSH 及其依赖保持应用锁定版本。

Profile 自行安装的 npm bundle 使用该 Profile 的包管理来源配置查询。安装包携带的第三方插件由应用版本管理；Git、本地目录、任意 tgz/URL 尚无统一更新协议，不推测其 npm 来源。需要认证的私有归档下载及安装脚本审批尚不支持；失败不会显示为已是最新。

更新包必须声明可由官方 Loader 核对的运行条目；只有配置覆盖、没有运行条目的 bundle 当前会在安装校验时拒绝并恢复旧版。

包操作共用官方 Profile 文件锁和 pnpm 实现，完整备份依赖树并在隔离官方 Host 中验证目标模块；失败、取消或兼容拒绝时原位恢复依赖和包文件，不先卸载。配置、启停状态和个人数据保留。断电或强制终止进程不属于自动恢复保证；连接中断时需重新核对结果。

完成对应 PLAN 任务及 [验收矩阵](../../apps/web/docs/ACCEPTANCE.md) 场景，记录真实测试证据后才更新状态。先验证公开接口，再实现；Host 入口输出激活/清理标记；Client 通过官方 Slots 提供 EasyWork 导航、业务面板及诊断面板。新任务直接进入原生 Conversation，诊断页调用真实 pluginInventory Remote，不提供假业务响应。

本地候选版本 **0.1.0-alpha.46**。build/typecheck 使用包内脚本，安装验证由根 scripts/probe-install.mjs 提供。源码经 TypeScript/TSX 编译后打包，不依赖上游 checkout。

Skill 已拆为 `easywork-plugin-skills@0.1.0-alpha.30` 的独立 Host/Client 安装层，本包不再导入或直接调用其初始化函数。开发时运行 `corepack pnpm build` 和 `corepack pnpm preview:install`，由官方 CLI 将这两个精确版本的 tgz 安装到预览 Profile。仅安装本包提供品牌、工作台展示和诊断，不会暗中初始化 Skill；需要技能时显式安装 Skill 包。

Workbench alpha.11 仍随展示产物编译，但通过 `ctx.plugin(workbench)` 建立正式子插件生命周期。它尚无独立安装制品，本轮不宣称所有规划模块均可独立分发。技能页面和侧栏能力中心入口归 Skill Client 所有。初始 URL 在官方 Client 组合完成后解析，缺失页面回到原生 Conversation，避免先选择尚未注册的面板。

浏览器验收：根目录先 build，再运行 corepack pnpm probe:browser。`easywork-view=home` 为旧地址兼容并归一化到原生 `conversation`；接入诊断必须显式使用 `diagnostics=1&easywork-view=diagnostics`，普通产品 URL 不注册诊断页面或导航。新任务使用 Harness 原生空会话编辑器。无需模型 API Key。
