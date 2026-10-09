# 共同资源授权

本包提供Host侧资源授权、持久grant、Session owner/runtime binding、内部受控Session服务及官方工具流水线审计。它是个人与企业共同的业务授权基础；旧enterprise-host和共享多人Host专用Remote/文件/设置装配已退役。

AccessManager消费storageDomain、workdshIdentity与workdshAudit。操作读取可信主体、组织和有效成员资格，owner或同组织/同资源/同操作显式grant决定授权；修订更新与撤销串行处理，结果写入审计。页面过滤不构成授权，组织管理员不自动绕过私有资源规则。

ToolAccessBridge使用官方tools/pre-execute授权及tools/result形成审计，Session flush/插件卸载等待相关记录排空。个人首次调用可使用显式个人自动绑定；固定成员且独立UID/目录的账号进程可显式开启autoBindFixedMemberSessions，不能用于共享多人Host或跳过owner冲突检查。

SessionAccessBridge是共同内部Host服务，通过公开sessionController创建/读取/恢复会话并核验持久owner绑定，不建立第二套执行器或通用企业网关。企业浏览器入口的当前账号认证、进程路由、文件/网络/运行边界由服务器装配承担，不能据本包API存在宣布完整远程授权。

后台管理员经专门组织范围授权只读查看会话正文并审计；该能力不授予所有Agent工具、资源、凭据或宿主运维权。

阅读 [规则](../../../apps/web/AGENTS.md)、[验收要求](../../../apps/web/docs/ACCEPTANCE.md)、[契约](../../../apps/web/docs/CONTRACTS.md) 与 [组织边界](../../../apps/web/docs/CONTRACTS.md)。按受影响路径核对个人行为、固定成员调用、跨账号/跨组织拒绝、撤权、审计及实际工具执行。验收边界见 ACCEPTANCE。
