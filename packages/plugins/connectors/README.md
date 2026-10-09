# 连接器管理

状态：**0.1 alpha 开发候选，提供 MCP 连接、官方凭据引用与按会话选择；本轮实际验收见[验收要求](../../../apps/web/docs/ACCEPTANCE.md)**。

- 实现阶段：P1
- 主任务：P1-04，详见 [需求与范围](../../../apps/web/docs/REQUIREMENTS.md)
- 已实现：多个 stdio/Streamable HTTP MCP 实例、官方工具/资源发现、实际健康检查、运行时启停、增删改配置、官方凭据引用、能力中心页面与按会话工具隔离。
- 历史限定证据：旧候选曾通过官方凭据服务建立腾讯文档连接、发现 224 个工具并查询账号文档；这不是本轮 0.2.0-rc.2 源码的真实供应商验收。
- 后续职责：交互式 OAuth、多账号身份切换、公共授权、安装目录与完整审计。
- 边界：成员使用权限不允许读取密钥；禁止跨账号回退。

## 开发前阅读

[规则](../../../apps/web/AGENTS.md)、[验收要求](../../../apps/web/docs/ACCEPTANCE.md)、[契约](../../../apps/web/docs/CONTRACTS.md)、[团队设计](../../../apps/web/docs/CONTRACTS.md)。

所有业务操作遵守服务端主体和组织上下文；页面与 Agent 工具调用相同领域服务。可选功能接入通过公开契约与生命周期注入。

MCP client 是一种执行适配，复用官方 stdio/Streamable HTTP 生命周期、工具发现和重连。令牌只写入 DSH 官方凭据服务，连接器配置、列表和诊断接口仅返回凭据引用或“已配置”状态。stdio 仅传显式最小 env，HTTP `Authorization` 在服务端由凭据层解析；专用 API 与 Web provider 不强制转换成 MCP。

## 验收与下一步

当前源码精确锁定 DSH `0.2.0-rc.2` / Cordis `4.0.4`。随包示例通过 `@deepseek-ai/dsh-mcp-client@0.2.0-rc.2` 连接本地子进程，模型可调用 `mcp__workdsh-example__connector_status` 与 `mcp__workdsh-example__search_catalog`；官方资源工具可列出并读取 `workdsh://connector/guide` 和 `workdsh://catalog/{id}`。远程连接器使用同一个官方 MCP Client。旧工具、资源、多实例和会话隔离探针仅作为历史证据，当前实际结果见[验收要求](../../../apps/web/docs/ACCEPTANCE.md)；页面状态来自实际子插件与工具发现，不凭配置存在显示“已连接”。

新会话默认不选择连接器。已保存的会话选择在刷新和重启后保留，即使尚未发送第一条消息。用户在输入框的链形图标中选择后，名称显示在输入框旁，Host 在官方 `agent/created` 生命周期中只开放对应 `mcp__<server>__*` 工具命名空间。连接器的全局启用状态与当前会话选择互相独立。

完整 D05 仍须完成对应 PLAN 任务及 [验收矩阵](../../../apps/web/docs/ACCEPTANCE.md) 的交互式 OAuth、多账号、公共授权、写操作确认和审计场景。本 alpha 不代表完整连接器产品已验收。

## 项目界面联动

按 [项目设计第 7 节](../../../apps/web/docs/ARCHITECTURE.md) 实现本领域相关交互，验收 UI01—UI08 适用项。领域对象与项目关联分离，取消不提交选择，个人连接按当前主体解析。新增目录仍为 planned。

实现前必须阅读 [ADR-0007](../../../apps/web/docs/CONTRACTS.md)，完成相应 B/Q 边界用例；不可只用提示词或 UI 达成权限保障。

页面及配置弹窗随 Harness 原生主题变化；文件类型图标与文档原文保留自身颜色。

当前企业使用独立账号进程中的相同 ConnectorManager、官方 Tools、McpResources、Credentials 和存储。会话选择读写由必需的 SessionAccess 逐次校验；没有 Session 或归属不匹配时拒绝。`ConnectorManagerOptions.seedExample` 可关闭本地示例种子，默认个人行为保留。旧共享 Host 的 selector、Agent 谓词和运行名称映射装配已删除。独立进程及凭据/工具隔离的实际验收见[验收要求](../../../apps/web/docs/ACCEPTANCE.md)。
