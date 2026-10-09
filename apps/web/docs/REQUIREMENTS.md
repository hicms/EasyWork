# 产品要求与提交契约

本文保留产品要求与源码契约，不保存开发顺序、进度日记、部署现场或测试输出。机器索引为 [requirements.json](requirements.json)，模块索引为 [modules.json](modules.json)，有限验收见 [ACCEPTANCE](ACCEPTANCE.md)。每条要求包含源码所有者、支持入口、交付分类、数据与凭据边界、契约影响、现有检查及验收场景。

个人 Web/Desktop 与企业 Web/Desktop 使用同一个经过兼容验证的官方目标版本和相同业务插件、服务与页面。身份、执行位置与数据位置分别声明；Profile 仅选择插件和配置。官方目标版本以 package.json 的精确锁定为准，实际安装版本与 Desktop pin、alignment 和 packaged-runtime 分别核对。

| 要求 | 有限范围 | 唯一来源 | 交付 |
| --- | --- | --- | --- |
| R01 | 官方运行版本与完整 Web | `package.json` | infrastructure |
| R02 | 安装、交付闭包与卸载 | `scripts/install-project-release.mjs` | infrastructure |
| R03 | 真实主体、授权与审计 | `packages/plugins/access` | infrastructure |
| R04 | 专家、修订与原生执行组合 | `packages/plugins/experts` | default |
| R05 | 技能管理与官方运行目录 | `packages/plugins/skills` | default |
| R06 | MCP 与连接账号绑定 | `packages/plugins/connectors` | default |
| R07 | 资料与成果的单一正文源 | `packages/plugins/library` | default |
| R08 | 项目配置与业务待办 | `packages/plugins/projects` | optional |
| R09 | Office 工作副本与文件交付 | `packages/plugins/office` | optional |
| R10 | 活动投影与企业协作 | `packages/plugins/activity` | optional |
| R11 | 受管浏览器会话 | `packages/providers/browser-session` | infrastructure |
| R12 | 企业身份与执行适配 | `packages/providers/identity-enterprise` | mode-specific |
| R13 | 自动化去重与恢复契约 | `packages/plugins/automations` | planned |
| R14 | 未实现扩展保持不可加载 | `packages/plugins/applications` | planned |
| R15 | 共同契约、页面与源码所有权 | `packages/contracts` | infrastructure |

default 表示专家、技能、MCP/连接器、资料库这些自有功能；不表示预装所有用户定义。optional 独立安装，infrastructure 为必要基础依赖，planned 为不可加载骨架。mode-specific 的企业账号在企业 Web 显式组合，在 Desktop 不可变安装中携带并仅企业激活。企业协作、通知和业务应用仍外置独立安装。详见 [交付边界](EXTERNAL-PLUGINS.md)。

企业 Web 部署在单 ECS，按账号按需启动官方进程，同账号多登录复用；运行安装共用只读基础，账号数据、配置、凭据与文件分开。Desktop 企业模式在本机执行官方 DSH，以真实成员凭据访问管理员固定后台。管理员打包配置只含 enterprise.backendUrl，不能含账号、密码或任何 Key。

企业后台独立拥有组织、成员、权限、审计与 Spring AI 内部模型 API。成员通过完整官方模型设置页手工填写内部地址、Key、协议与模型；个人模型仍可配置。普通成员不能查看他人会话，组织管理员的正文读取必须明确授权、只读并留审计；组织管理员不获得宿主运维权限。

不默认安装 SkillHub、插件广场、旧推荐目录或客户第三方市场。删除默认项不删除用户既有技能、配置、会话与显式安装记录。未来功能按 [共同开发契约](FEATURE-DEVELOPMENT-CONTRACT.md) 声明有限支持范围，不能由骨架、菜单或构建成功推导交付完成。
