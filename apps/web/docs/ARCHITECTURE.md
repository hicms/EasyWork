# 架构与源码所有权

产品范围见 [REQUIREMENTS](REQUIREMENTS.md)，实现规则见 [FEATURE-DEVELOPMENT-CONTRACT](FEATURE-DEVELOPMENT-CONTRACT.md)。本文件描述唯一实现与适配边界。

官方 DSH 拥有 Host、Client renderer、Conversation、Workspace、Session、Loader、插件管理、Skill runtime、模型调用基础与 Agent loop。EasyWork 通过共享 `easywork-plugin-models` 接管账号登录、模型设置、输入框选择器和 `/model`。完整 Web 清单仍由 `scripts/official-web-clients.mjs` 从锁定官方包导出，保留官方条件与 `!!js` 标签；自有 Profile patch 单独声明账号/模型替换，运行检查核对这些替换和其他完整官方客户端。

`profiles/shared/easywork-features.json` 声明共同业务包来源。个人和企业复用同一领域插件、业务服务、工具与页面；不同组合只提供实际身份、存储、执行和同步适配。共同来源清单不决定默认安装，交付边界见 [EXTERNAL-PLUGINS](EXTERNAL-PLUGINS.md)。

技能、专家、资料库、连接器和项目的唯一维护源码位于本仓库 `packages/plugins/{skills,experts,library,connectors,projects}`。Desktop 与 Web 使用相同源码构建，本地默认插件随应用打包；构建与启动不依赖独立后端。

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
| easywork-admin | 独立企业治理后台、登录、组织授权、审计与内部模型 API |

个人 Web/Desktop 使用同一账号/模型插件连接 `https://ask.vigoai.cn`；模型服务登录只授权远程模型，不改变本地 Home 或业务身份。JWT 保存在官方 Host credential record，通过 Host Connection 返回脱敏账号和目录，浏览器不直接持有 JWT 或请求中转服务。模型目录的名称、厂商、档位、价格倍率、能力和思考参数由服务下发；`ModelAdapter` 通过发布适配器和公开 payload hook 映射三种聊天协议。登录、恢复和目录刷新协调官方默认模型，显式会话选择由官方持久化。退出或 401 撤销本插件凭据与在途调用，保留本地数据。服务尚无刷新令牌接口，过期后重新登录。企业 Web 的历史独立进程适配保持外置范围；Profile 不是账号或安全边界。

历史企业身份、成员进程与协作适配保持独立外置，不进入当前个人 Desktop 组合。EasyWork 模型服务账号不提供企业身份或成员空间；Web 部署进程也不作为 Desktop 本机执行器。

后台通过 Spring AI 提供内部模型 API；成员通过官方模型设置手工填写地址、Key、协议和模型。不添加企业模型 provider、自动同步模型配置或复制官方设置页面。管理员访问本组织会话正文使用专用只读授权与访问审计，不获得宿主运维权限。

领域服务拥有业务对象；原生 Session 事件拥有执行事实。项目引用资料库正文，专家引用 Skill 修订，活动投影原生运行状态；不生成第二套正文、技能注册表或任务执行状态。持久对象、npm 版本、schema、发布修订与执行绑定分别标识。

所有服务、Remote、订阅、timer、watcher、连接、子进程和临时资源由 Cordis Fiber 拥有，可撤销并等待清理。官方 Slot owner 拥有界面位置，React 组件仅接收公开 props 和所需 callback，不持有 Cordis ctx 或凭据。验收采用 [有限场景](ACCEPTANCE.md)，源码与无密钥检查不能替代真实模型、浏览器或 Desktop packaged-runtime/GUI 验收。
