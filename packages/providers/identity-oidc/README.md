# SSO 身份提供方

状态：**规划中，尚未实现**。目录已建立，不代表功能完成。

- 实现阶段：P3
- 主任务：P3-01，详见 [需求与范围](../../../apps/web/docs/REQUIREMENTS.md)
- 职责：OIDC 身份验证与受控成员映射。
- 边界：不能仅解码未验证 token。

## 开发前阅读

[规则](../../../apps/web/AGENTS.md)、[验收要求](../../../apps/web/docs/ACCEPTANCE.md)、[契约](../../../apps/web/docs/CONTRACTS.md)、[团队设计](../../../apps/web/docs/CONTRACTS.md)。

所有业务操作遵守服务端主体和组织上下文；页面与 Agent 工具调用相同领域服务。可选功能接入通过公开契约与生命周期注入。

## 验收与下一步

完成对应 PLAN 任务及 [验收矩阵](../../../apps/web/docs/ACCEPTANCE.md) 场景，记录真实测试证据后才更新状态。先验证公开接口，再实现；目前仅保留骨架，不声明加载入口、假工具或成功响应。
