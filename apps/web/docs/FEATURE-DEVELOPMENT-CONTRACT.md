# 共同功能开发契约

个人 Web/Desktop 与企业 Web/Desktop 共用一个官方目标版本、领域插件、业务服务和页面。支持范围由 [REQUIREMENTS](REQUIREMENTS.md) 声明；身份、数据位置与执行位置分别选择，不能按入口复制业务实现。

| 内容 | 唯一所有者 |
| --- | --- |
| Host、Client、Agent、模型与工具基础 | 精确锁定的官方 DSH |
| 业务数据、服务、页面、工具与业务授权 | packages/plugins/<domain> |
| 身份、存储、运行与同步差异 | 有明确契约的 provider/adapter |
| 跨插件领域契约 | packages/contracts |
| 窗口、固定后台、设备凭据、本机进程与安装 | Desktop carrier |
| 企业治理、成员授权、内部模型 API 与审计 | 独立 workdsh-admin |
| ECS 账号进程、路由和部署 | deploy/member-process |

先扩展现有合适模块；只有独立领域或交付生命周期需要新包。新模块登记 [modules.json](modules.json)，与 workspace、包入口、依赖和对应要求同步。默认、可选、企业激活携带与外置安装沿用 [交付边界](EXTERNAL-PLUGINS.md)。共同功能清单不意味着所有功能默认安装。

每个功能变更必须有有限且可审查的契约：

- 源码所有者、目标与需求来源；声明复用的业务服务、页面和官方公开接口。
- 支持个人/企业 Web/Desktop 中哪些入口及必要能力；未支持入口不展示假菜单。
- default、optional、external、infrastructure、mode-specific 或 planned 的交付方式。
- 谁能读写，数据与凭据的真实所有者，执行位置、上传/分享/审计范围，离线与撤权策略。
- 公开契约、schema、插件依赖、锁文件、安装 Profile、后台与打包版本的影响。
- 有限正常、非法输入、越权/撤权场景与受影响组合验收，记录失败与未执行项。

页面和工具消费同一授权业务服务；异步运行保存实际 Session/Run 的主体与组织绑定。组织配置与窗口账号不是运行中任务的授权依据。受影响入口分别验证，源码构建通过不能代替承诺的真实运行、GUI 或安装验收。

公开契约变化同步更新调用方、适配与包版本，不保留已退役路线的兼容壳。官方升级核对工程依赖、已安装个人/企业 Profile、企业镜像与 Desktop pin 的实际版本，pin 变化与行为变化分别审查。

Desktop 企业账号来自同一不可变运行安装，成员同名本地包不得覆盖；其源仍由身份 provider 拥有，carrier 只负责安装和模式激活。固定后台配置只含公开 origin，真实成员授权、模型配置与秘密不打入安装包。

check:plan 检查本契约的静态映射、模块与文档完整性；[ACCEPTANCE](ACCEPTANCE.md) 定义产品完成条件。验收输出留在独立工作区/CI 产物，不把开发日志加入公开源码。
