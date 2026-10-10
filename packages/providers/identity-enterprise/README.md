# 企业身份、账号与 Desktop 正文同步

当前候选版本为 `0.1.0-alpha.2`，官方版本族为 DSH `0.2.0-rc.2`、Cordis `4.0.4`。本包是按需安装的外部插件，不随基础 Desktop 预装。安装后经后台验证公司账号，才由 Main 启用固定成员身份。企业 Agent 与工具在本机运行；服务器只承担管理、授权、协作数据与模型转发。

## 公开入口

| 入口 | 职责 |
| --- | --- |
| 根入口与 `./client` | 在官方 `settings.section` 贡献同一个“企业账号”页；Node 根入口不建立身份服务 |
| `./desktop` | Main 受控本机认证桥、固定成员身份，以及本机可见正文同步；保留官方本机会话存储 |

`@deepseek-ai/dsh` 精确 peer 声明为 optional，由 Desktop 的官方安装 anchor 提供并核验实际版本；不因此安装另一套 DSH。实际使用的 Session Controller、Session、Connection 和官方客户端 peer 仍为精确版本要求。

## 企业 Desktop 本机适配

`./desktop` 的纯 JSON Config 为 `{ authFile, principalId, organizationId, deviceId }`。Desktop Main 先经后台核验成员，再提供这些固定值；插件读取 Main 所属账号目录中的 `enterprise-auth.json`，核对 `authorityUrl`、桥能力 `authorityKey`、`backendUrl` 及同一成员、组织和设备。authority 仅允许字面回环 `127.0.0.1` 的受控随机端口，拒绝重定向与绑定变更。

真实后台成员 token 仅保存在 Electron Main 内存。文件中的随机能力只允许调用本机桥的封闭路由，不是后台成员 token；页面、模型和 Profile 不接收它。本包不持有服务器 service key。POSIX 检查文件 0600 权限和当前 UID；Windows 拒绝符号链接并核对文件描述符，依赖 Main 创建的当前 OS 用户 userData 目录 ACL。目录分离不构成同 OS 用户之间的安全沙箱，Windows 实际打包尚未验收。

企业装配须移除个人身份提供方，安装 `./desktop`，并显式启用共同 access 的 `autoBindFixedMemberSessions`。每次企业身份解析和同步操作都通过 Main 复验固定成员，不因 Profile 或缓存信息而放行；登录过期、成员变化、密码待修改及后台不可达时拒绝，不降级个人身份。

客户端仍使用同源 `/api/auth/me` 和 `/api/auth/logout`。Desktop 由本插件贡献这些受官方 Connection 托管的 Host 路由；账号响应含 `desktop: true`，退出响应为 `{ local: true }`，页面不跳转远程登录。Main 拥有窗口、进程停止、认证文件清理及后台撤销生命周期。账号页同时显示同步状态，并提供重试与明确的后台正文删除操作。

本包不注册模型 provider、不自动写入模型配置。企业成员仍在完整官方自定义模型 API 页手工填写公司内部地址、Key、协议和模型；个人自配模型可以并存。协作和通知仍是独立外置插件，本次身份适配不表示其 Desktop 装配已完成。

## 可见正文同步契约

同步监听官方公开 `session/created`、`session/event` 与 `session/flush`，随后通过共同 `easyworkSessionAccess.inspect` 冷读，核验真实固定成员及 Session 所有权。上传范围只包括 `source.kind === 'user'` 的用户文字和已提交的助手文字，包括已提交的中断前缀；系统消息、注入内容、思考、工具轨迹和附件不进入 payload。

正文是按官方事件序号稳定标识的可见文字日志：后续编辑不会改写已上传的旧前缀。客户端只提交 `{ version: 1, deviceId, sessionId, revision, requestId, entries }`，entry 仅含 `{ seq, recordId, role, text }`；组织和成员由后台当前登录确定。Main 注入冻结设备，后台拒绝同一 Session 的无约束多设备写入。

受保护的 `enterprise-visible-sync.json` 与 authFile 位于同一账号目录，保存待发送正文、修订及 requestId。发送前持久化请求；丢失回执时重试原 payload，不生成另一份记录。后台只接受严格新增的不可变前缀，返回实际修订与条数；失败保留本地记录和错误状态，不虚报成功。后台限制 JSON 512 KiB、512 条、单条文字 64 KiB、文字总计 256 KiB；超限拒绝，不静默截断。

删除后台正文前先持久化删除意图并暂停该会话上传。后台 tombstone 幂等，丢失响应可在重启后重试；确认后该会话不再上传。本地官方会话数据保留。`session/disposed` 只是释放/回滚，不被当作删除事件；官方界面本地删除也不等于后台正文删除。

客户端过滤已知 private key、API token、JWT、Bearer 等形状及实际桥能力，后台也拒绝明显凭据形状；这不能语义保证任意正文不含秘密。后台接收的是客户端提交的可见日志，不是不可绕过的终端完整审计。管理员读取须由后台组织范围授权且留访问审计，不能获得成员凭据或 Host 管理权限。

## 验收要求

构建和类型检查必须覆盖本包以及共同 access；身份测试覆盖后台认证、固定成员、同步重试和删除、过期和撤权拒绝、认证文件保护以及 process 生命周期。通过源码和 headless 检查后，仍需分别验收企业服务器部署与 Desktop 安装、登录、退出、重启、升级及 Windows/macOS 图形行为。模型和工具任务须通过实际授权的完整官方客户端验收；文件目录或 Profile 名称不能替代身份与资源授权。

共享功能与交付要求见 [功能开发契约](../../../apps/web/docs/FEATURE-DEVELOPMENT-CONTRACT.md)、[企业需求](../../../apps/web/docs/ENTERPRISE-REQUIREMENTS.md) 和 [验收要求](../../../apps/web/docs/ACCEPTANCE.md)。

## 独立业务插件认证

历史 Desktop 身份入口提供 `easyworkEnterprise` 服务，业务插件通过 Cordis 注入，使用 `identity()` 与 `request()` 调用当前公司后台。凭据留在 Main，不读取 Token；允许的路径为 `/api/extensions/<plugin>/<operation>`。接口见[公开企业契约](../../contracts/src/enterprise.ts)，历史实现见[Desktop 身份入口](src/desktop.ts)；当前个人 Desktop 不提供企业登录或认证桥接，也不启用本包。
