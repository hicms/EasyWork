# 企业管理后台

状态：**规划中，尚未实现**。目录已建立，不代表功能完成。

2026-09-27 的企业管理后台实施改为独立 `workdsh-admin` 仓库（Spring Boot + Vue/Arco）；本目录仍是历史规划骨架，不拥有当前企业成员数据库或管理 Web，不得声明已加载入口。DSH 端企业身份由 `packages/providers/identity-enterprise` 提供。

- 实现阶段：P1/P3
- 主任务：P1-10，详见 [需求与范围](../../../apps/web/docs/REQUIREMENTS.md)
- 职责：组织、成员、分发、连接、模型政策与审计界面。
- 边界：不另建特权绕过通道；基础授权首期已实现。

## 开发前阅读

[规则](../../../apps/web/AGENTS.md)、[验收要求](../../../apps/web/docs/ACCEPTANCE.md)、[契约](../../../apps/web/docs/CONTRACTS.md)、[团队设计](../../../apps/web/docs/CONTRACTS.md)。

所有业务操作遵守服务端主体和组织上下文；页面与 Agent 工具调用相同领域服务。可选功能接入通过公开契约与生命周期注入。

## 验收与下一步

完成对应 PLAN 任务及 [验收矩阵](../../../apps/web/docs/ACCEPTANCE.md) 场景，记录真实测试证据后才更新状态。先验证公开接口，再实现；目前仅保留骨架，不声明加载入口、假工具或成功响应。

首期实现组织概览、成员基础视图、组织能力和连接管理、基础审计；后续扩展 SSO、模型与用量。详见 [后台设计](../../../apps/web/docs/ENTERPRISE-REQUIREMENTS.md)。
