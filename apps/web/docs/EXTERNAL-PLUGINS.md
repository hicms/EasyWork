# 默认与独立插件交付

产品规则见 [REQUIREMENTS](REQUIREMENTS.md)，安装审查见 [PLUGIN-DELIVERY](PLUGIN-DELIVERY.md)。源码同仓库不决定默认交付，实际安装与激活清单决定。

| 类别 | 交付方式 |
| --- | --- |
| 专家、技能、资料库、MCP/连接器 | 默认自有功能插件及必要基础依赖；不预装所有用户定义 |
| EasyWork 模型服务账号与目录 | Desktop/Web 默认共用 models 插件，Profile 显式替换官方账号/模型入口；JWT 留在 Host |
| Office、项目、活动与其他自有业务 | 可选独立插件，显式安装和更新 |
| 历史企业身份、账号与退出 | 保留独立源码和显式企业组合；当前个人 Desktop/Web 不携带或激活 |
| 企业协作、通知与业务应用 | 外置独立安装和更新，不经模型服务账号带入 |
| 官方 DSH 基础与完整 Web | 同一锁定官方发布组合，独立于自有业务功能计数 |
| 客户第三方插件与市场 | 保留来源、许可证、版本和兼容验证，不默认安装 |

个人默认源包闭包由 `scripts/check-plugin-delivery.mjs` 验证。开发 preview 与测试 Profile 的完整组合不代表产品默认；`profiles/shared/easywork-features.json` 是共同来源，不是 Desktop 发行清单。

个人激活清单不拼入历史企业 patch。EasyWork 模型服务凭据属于当前 Host 的可写凭据记录，不写入安装包，也不改变本地数据身份。

历史企业身份与协作分别由 identity-enterprise provider 与 enterprise-collaboration 插件拥有；企业 Web 启动器和网关位于 deploy/member-process。这些独立适配不参与当前 ask-service 接入，不能打包账户或秘密。
