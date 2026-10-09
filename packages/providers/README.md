# 提供方目录

本目录仅分类，不创建统一 npm 包或版本。各子提供方按计划独立开发、版本化和管理生命周期。

- [identity-local](identity-local/README.md)：本地身份。
- [identity-enterprise](identity-enterprise/README.md)：每实例一成员的企业服务端身份适配，开发验证中。
- [identity-oidc](identity-oidc/README.md)：SSO 身份。
- [library-team](library-team/README.md)：团队资产。
- [runtime-isolated](runtime-isolated/README.md)：隔离执行。

identity-local、identity-enterprise 和 browser-session 已有开发实现；identity-oidc、library-team、runtime-isolated 仍为规划骨架。实现状态不等于已在企业部署启用。目录名不改变包身份；示例仍位于 examples。新增模块同步 [模块台账](../../apps/web/docs/modules.json) 和 workspace。开发顺序见 [逐插件计划](../../apps/web/docs/PLUGIN-DELIVERY.md)。

企业服务器当前路线与边界见[架构](../../apps/web/docs/ARCHITECTURE.md)和[验收要求](../../apps/web/docs/ACCEPTANCE.md)。library-team 暂不开发；执行隔离需求保留，runtime-isolated 是否独立实现须先核对官方接口。
