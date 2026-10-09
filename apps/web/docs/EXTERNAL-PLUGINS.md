# 默认与独立插件交付

产品规则见 [REQUIREMENTS](REQUIREMENTS.md)，安装审查见 [PLUGIN-DELIVERY](PLUGIN-DELIVERY.md)。源码同仓库不决定默认交付，实际安装与激活清单决定。

| 类别 | 交付方式 |
| --- | --- |
| 专家、技能、资料库、MCP/连接器 | 默认自有功能插件及必要基础依赖；不预装所有用户定义 |
| Office、项目、活动与其他自有业务 | 可选独立插件，显式安装和更新 |
| 企业身份、账号与退出 | 同一源码；Desktop 不可变携带、仅企业激活；个人 Web 不默认安装，企业 Web 显式组合 |
| 企业协作、通知与业务应用 | 外置独立安装和更新，账号例外不默认携带这些功能 |
| 官方 DSH 基础与完整 Web | 同一锁定官方发布组合，独立于自有业务功能计数 |
| 客户第三方插件与市场 | 保留来源、许可证、版本和兼容验证，不默认安装 |

个人默认源包闭包由 `scripts/check-plugin-delivery.mjs` 验证。开发 preview 与测试 Profile 的完整组合不代表产品默认；`profiles/shared/workdsh-features.json` 是共同来源，不是 Desktop 发行清单。

企业账号安装副本由 Desktop 发行维护，成员 Profile 的同名包覆盖在启动前拒绝；个人激活清单不拼入企业 patch。账号本地数据、凭据与配置属于成员可写空间，不能通过共享 node_modules 链接写入安装包。

企业身份与协作分别由 identity-enterprise provider 与 enterprise-collaboration 插件拥有；企业 Web 启动器和网关位于 deploy/member-process。后台模型 API 由 Spring AI 提供，成员通过官方页手工配置。企业 Desktop 固定后台 origin 由管理员打包提供，不能打包账户或秘密。
