# 架构与源码所有权

产品范围见 [REQUIREMENTS](REQUIREMENTS.md)，实现规则见 [FEATURE-DEVELOPMENT-CONTRACT](FEATURE-DEVELOPMENT-CONTRACT.md)。本文件描述唯一实现与适配边界。

官方 DSH 拥有 Host、Client renderer、Conversation、Workspace、Session、Loader、模型设置、插件管理、Skill runtime 与 Agent loop。个人和企业消费同一精确锁定的官方版本族；完整 Web 清单由 `scripts/official-web-clients.mjs` 从锁定的官方 base/Web 包导出到 `profiles/shared/official-web-clients.json`，保留官方条件与 `!!js` 标签。

`profiles/shared/workdsh-features.json` 声明共同业务包来源。个人和企业复用同一领域插件、业务服务、工具与页面；不同组合只提供实际身份、存储、执行和同步适配。共同来源清单不决定默认安装，交付边界见 [EXTERNAL-PLUGINS](EXTERNAL-PLUGINS.md)。

| 来源 | 唯一所有权 |
| --- | --- |
| packages/contracts | 小而明确的跨插件领域契约与引用 |
| packages/ui | 无持久业务状态的展示组件 |
| packages/bundle | 插件与展示组合 |
| packages/plugins/<domain> | 领域对象、授权服务、工具、页面和持久化 |
| packages/providers/<name> | 可信身份、存储与运行差异的显式适配 |
| profiles/shared | 官方完整客户端及共同功能来源 |
| deploy/member-process | 企业 Web 账号进程、路由网关与唯一 Docker 配方 |
| Desktop carrier | 窗口、设备凭据、本机进程、固定后台配置与安装生命周期 |
| workdsh-admin | 独立企业治理后台、登录、组织授权、审计与内部模型 API |

个人 Web 使用完整官方客户端和个人身份，不依赖企业后台。企业 Web 在单 ECS 按账号按需运行独立官方 DSH 进程，同账号多个登录复用；运行安装只读共用，数据、配置、凭据与文件目录属于账号。Profile 不是账号或安全边界，目录隔离和实际资源授权分别检查。

企业 Desktop 在本机运行同一官方 DSH，企业身份由同一账号插件提供。企业数据空间与个人分开；管理员通过安装包固定企业后台 origin，后端按真实成员凭据授权。账号包不可变携带、仅企业激活；协作与业务插件外置安装。Web 部署进程不作为 Desktop 本机执行器。

后台通过 Spring AI 提供内部模型 API；成员通过官方模型设置手工填写地址、Key、协议和模型。不添加企业模型 provider、自动同步模型配置或复制官方设置页面。管理员访问本组织会话正文使用专用只读授权与访问审计，不获得宿主运维权限。

领域服务拥有业务对象；原生 Session 事件拥有执行事实。项目引用资料库正文，专家引用 Skill 修订，活动投影原生运行状态；不生成第二套正文、技能注册表或任务执行状态。持久对象、npm 版本、schema、发布修订与执行绑定分别标识。

所有服务、Remote、订阅、timer、watcher、连接、子进程和临时资源由 Cordis Fiber 拥有，可撤销并等待清理。官方 Slot owner 拥有界面位置，React 组件仅接收公开 props 和所需 callback，不持有 Cordis ctx 或凭据。验收采用 [有限场景](ACCEPTANCE.md)，源码与无密钥检查不能替代真实模型、浏览器或 Desktop packaged-runtime/GUI 验收。
