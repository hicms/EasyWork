# 个人工作区的运行来源

当前 Desktop 自动启动个人工作区，使用精确锁定的官方 DSH 0.2.0-rc.2 版本族与完整客户端。企业登录、成员空间和协作接入已移除；历史企业扩展源码不代表当前 Desktop 支持。

| 来源 | 用途 |
| --- | --- |
| package.json与pnpm-lock.yaml | 精确官方版本族和工程依赖 |
| shared/easywork-features.json | 共同自有功能包来源，不等于全部默认安装 |
| scripts/official-web-clients.mjs | 从锁定官方base/Web及dsh.client元数据核对完整官方客户端 |
| scripts/install-preview.mjs | 安装完整官方个人Web及显式开发功能组合 |
| enterprise/README.md | 历史企业组合说明，当前 Desktop 不启用 |

资料库、项目、专家、技能与连接器复用共享包、服务和页面。其他外部插件按需安装。

Profile 是插件与配置组合，不是用户账号。个人数据、配置、凭据和显式安装的插件保存在个人空间；旧企业数据不自动迁移或删除。

历史 Web 验收记录见 [STATUS](../apps/web/docs/ACCEPTANCE.md)。Desktop 的实际安装包和窗口验收单独记录，不能以源码目标或 Web 证据代替。
