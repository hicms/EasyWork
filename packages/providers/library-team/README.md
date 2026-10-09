# 团队资产提供方

状态：**规划中，尚未实现**。目录已建立，不代表功能完成。

- 实现阶段：P3
- 主任务：P3-02，详见 [需求与范围](../../../apps/web/docs/REQUIREMENTS.md)
- 职责：共享存储、修订、并发与权限实现。
- 边界：保持资产契约；不直接访问本地插件数据表。

## 开发前阅读

[规则](../../../apps/web/AGENTS.md)、[验收要求](../../../apps/web/docs/ACCEPTANCE.md)、[契约](../../../apps/web/docs/CONTRACTS.md)、[团队设计](../../../apps/web/docs/CONTRACTS.md)。

所有业务操作遵守服务端主体和组织上下文；页面与 Agent 工具调用相同领域服务。可选功能接入通过公开契约与生命周期注入。

## 验收与下一步

完成对应 PLAN 任务及 [验收矩阵](../../../apps/web/docs/ACCEPTANCE.md) 场景，记录真实测试证据后才更新状态。先验证公开接口，再实现；目前仅保留骨架，不声明加载入口、假工具或成功响应。

## 2026-09-30 复查

下一阶段暂不开发独立 provider。先复用现有资料库业务契约及企业数据库适配；仅在验证出现共享资产存储缺口后再决定独立 backend。 详见[当前架构](../../../apps/web/docs/ARCHITECTURE.md)和[验收要求](../../../apps/web/docs/ACCEPTANCE.md)。
