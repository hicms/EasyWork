# 工作台

状态：**D02 本地展示基线完成，0.1.0-alpha.12**。主任务 P1-01；后续业务联动未实现。

工作区、会话、新会话、搜索、筛选、创建工作区、工作区菜单、会话菜单和设置全部保留 Harness 官方 Sidebar occupant。EasyWork 不替换整块 sidebar，也不复制这些行为；通过公开 Slot 增量加入项目、专家、技能、资料库和连接器。专家、技能和连接器各自拥有独立入口，页面内的能力标签继续可用；尚未实现的助理、定时任务和更多不注册入口。新任务继续使用原生 Conversation，因此 `/`、`@`、附件、权限、模型和 preset 均由 Harness 处理。

规范与边界见 [UI 规范](../../../apps/web/docs/ARCHITECTURE.md)、[共享页面契约](../../../apps/web/docs/CONTRACTS.md)、[ADR 0014](../../../apps/web/docs/CONTRACTS.md)。

本版本导出标准 `name/inject/apply`，由 bundle 使用官方 `ctx.plugin(workbench)` 注册，具有独立子插件生命周期；仍编译进展示产物，尚无独立 `dsh.bundle` 安装层，不宣称已独立分发。专家、技能、连接器入口分别由各自 Client 贡献，移除插件时随生命周期一并释放；工作台只贡献自己的入口，不重复注册。

Harness 装配位于 `src/harness/client.ts`，页面结构位于独立 TSX 组件，样式位于独立模块；公开 `src/index.ts` 不再混合界面结构。领域入口目前只展示清晰的未接入状态，不伪造团队权限、业务对象或管理能力。
