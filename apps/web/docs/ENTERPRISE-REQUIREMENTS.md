# 个人与企业产品边界

共同要求与机器索引见 [REQUIREMENTS](REQUIREMENTS.md) 和 [requirements.json](requirements.json)。本文只保留企业组合的产品约束，实际支持与验收按 [ACCEPTANCE](ACCEPTANCE.md) 判定。

1. 官方核心不修改。个人 Web/Desktop、企业 Web/Desktop 使用同一产品目标版本和完整官方客户端，实际安装版本分别核对；Desktop alignment 与 packaged-runtime 不由 Web 检查替代。
2. 专家、技能、MCP/连接器和资料库复用同一插件、业务服务和页面；身份、存储、执行与同步差异在明确适配边界处理。
3. 企业 Web 在单 ECS 按账号按需运行官方 DSH，同账号多登录复用进程。官方基础只读共用，账号数据、配置、凭据、文件与授权分开；Profile 不作为账号或安全边界。
4. 企业 Desktop 在本机运行官方 DSH，企业身份/账号/退出由同一插件提供。插件在不可变安装中携带并仅企业激活，不要求员工安装 tgz；成员同名副本覆盖被拒绝。个人默认不激活账号插件。
5. 协作、通知及业务应用仍外置独立安装与更新，企业账号例外不扩大默认闭包。官方插件管理保留，客户市场由客户自选，不默认集成 SkillHub 或旧推荐目录。
6. 独立后台拥有组织、成员、权限和审计。普通成员不能读取他人正文；管理员仅通过显式本组织只读授权访问，并为每次访问留审计。组织管理员不拥有宿主运维权限。
7. 后台通过 Spring AI 管理多上游和内部模型 API。成员在完整官方模型设置页手工配置内部地址、Key、协议与模型；个人模型仍可用，不添加企业模型 provider 或自动同步设置。
8. 管理员打包配置只接受 enterprise.backendUrl 并固定 origin，不含账号、密码、token、内部模型 Key、供应商秘密或服务器 service key。后台始终按真实成员凭据授权，企业数据与个人空间分离。
9. 正文同步的内容、访问范围、归属、重试、撤权和在途取消分别声明。客户端上报不能被当作不可绕过的完整审计。代码、无密钥测试、真实模型、GUI、安装升级与平台实机验收分开。

后续任务采用 [FEATURE-DEVELOPMENT-CONTRACT](FEATURE-DEVELOPMENT-CONTRACT.md)，不复制官方设置、页面、Host、Client、Agent 执行器或已退役路线的兼容层。
