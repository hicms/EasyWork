# 公开领域与执行契约

本文件约束 EasyWork 自有服务及其官方适配。实际 TypeScript 定义由 `packages/contracts` 与各包的公开入口拥有；未来草案不能当成官方 API。模块来源见 [ARCHITECTURE](ARCHITECTURE.md)，验收见 [ACCEPTANCE](ACCEPTANCE.md)。

## 身份、资源与授权

ActorContext 必须从 Host 可信身份解析；浏览器和模型传入的 principalId、organizationId、sessionId、路径或 scope 不作为授权证据。领域读取、修改、搜索、下载、预览、订阅及后台工具逐次校验实际资源归属。页面和 Agent 工具调用同一业务服务。

资源引用保存稳定对象 ID、所有者和精确修订；显示名称不作身份。Profile 仅选择插件与配置。AccessGrant、连接授权、官方 approval 与 runtime enforcement 分别判断，任一必要层缺失、撤权或不满足保证均失败关闭。

CredentialBinding 只表达凭据引用、连接实例、目标指纹与外部主体，不包含明文。执行时解析真实秘密并重新校验账号与 tool scope，轮换不能静默改变外部主体。日志、模型上下文、配置描述、导出与同步不能带入凭据。

## 领域所有权与修订

| 领域 | 服务意图与边界 |
| --- | --- |
| experts | 草稿、校验、发布、归档、解析执行；发布固定不可变修订 |
| skills | 发现、导入、创建、编辑、启停、卸载；官方 registry/provider 拥有运行目录 |
| connectors | 定义、实例、健康与发现、授权选择；官方 MCP/Tools/Credentials 拥有传输和运行 |
| library | 原件、检索、建议修订、接受与成果注册；拥有唯一正文 |
| projects | 配置修订、能力/资产关联、业务待办与活动；关联不授予源对象权限 |
| office | 授权工作副本、格式模型、人工租约、CAS 编辑与固定修订导出 |
| activity | 投影原生 Team 和持久领域事实，不复制执行状态机 |

修改与接受建议携带 expectedRevision，冲突拒绝静默覆盖。项目只保存资产与能力引用；移除关联不卸载源对象。归档和卸载保留历史引用或明确返回不可用诊断。列表和读取均按当前主体过滤，缓存不能改变授权结果。

## 执行绑定与会话事实

专家、应用或项目提供默认值，用户明确选择优先；组织限制始终单独约束。任务建立时固定专家/技能修订、preset 指纹、模型、项目、资产和连接账号。恢复、fork、交接及每个子任务重新解析身份、资源与执行授权，不能回退最新修订或其他连接账号。

EasyWork 通过官方 preset、Session Controller、Agent 与 Team 公开接口执行，不另建 Agent loop。PromptReceipt 只表示持久入队；结果以原生 sessionId、durable cursor、turn/step 与工具结算读取。中断请求、mailbox 接受或 provider 移除不表示已停止，部分/未知结果不能宣称完整交付。

原生 Session 拥有消息、工具、步骤、运行审批与子 Agent 事实；业务待办、资产修订、组织授权和自动化由各领域拥有。原生工具或 Team 完成不能直接完成项目待办，成果须经过资料服务校验并返回修订引用。持久化读取、导出或交接前按官方机制 flush。

交接只传选定且接收方可读的摘要与资产；prepare 和 claim 均重查授权，不复制原私有会话历史。连接在接收方重新绑定，已发生的外部写入不重放。后台同步保存原 Session/Run 的成员与组织绑定，不用当前窗口账号替代。

## 外部提交与自动化

提供方声明幂等、查询与部分结果能力。提交回执包含操作 ID、外部记录 ID 与可读摘要；未知结果先核对，不把超时直接当失败重试。取消或撤权不能声称已完成外部副作用回滚。

自动化规则、持久幂等键与运行历史属于 automations；触发先保存 source/delivery/rule 事实，再协调原生 Session。HTTP 202、dispatch 或 Job terminal snapshot 都不能单独宣称业务运行完成。未实现的自动化与共享运行入口保持不可加载。

## 官方传输与生命周期

跨插件只消费公开 exports/types，不导入内部类或读取其他领域表。一元业务协议使用官方 Typert Remote；Host 签名为唯一来源，Client 消费生成类型，身份 lookup 不生成授权。可预期错误使用稳定 domain/reason code，不依赖错误消息或跨边界 instanceof。

技能管理使用官方 Client Connection 的精确 JSON/流式 Fetch route 适配当前生成器兼容限制；Host 校验 payload、来源、上传大小、中止与受控根。该适配不形成新的通用 transport。全局技能导入不冒用会话附件 receipt；导入只检查数据，拒绝穿越、符号链接与不合法 SKILL.md，确认后原子发布。

Agent 工具定义严格 schema、规范 JSON、模型内容和独立 UI presentation；原生与 PTC 调用经过同一 guard、授权、approval、审计和结算。工具尊重 exec.signal；发布后台 Job 后，取消和结算由 Job 生命周期拥有。

资源、Remote、监听、timer、watcher、连接与子进程由 Cordis Fiber 托管。可选服务缺失返回明确诊断；必需服务不可用时不能假成功。unload/reinstall 不残留贡献、工具、子进程或订阅。

## Office 与预览

Office 页面和工具使用同一已保存工作副本模型；样式、列表和 revision 更新通过严格 Host 校验。预览原件与原生编辑能力分别声明，不能承诺任意格式无损转换。HTML 在无 Host 与未授权网络能力的沙箱内展示。

content_export 授权读取已保存修订，baseRevision 不匹配返回冲突；稳定摘要路径的已有同字节文件可复用，不同字节不能覆盖。写入与交付组合官方 bash/present，继承 scope/token/signal；未知写入不交付，present 回执才可标记 presented。导出文件与工作副本修订分开，不冒充完整跨重启导出 Job 协议。
