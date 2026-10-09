# EasyWork Desktop 外壳

[English](README.md)

本包构建 Electron 应用，包含一套个人运行时 Profile。官方 DeepSeek Harness 拥有 Host、完整 Web 客户端及核心执行；EasyWork 功能包提供共同的专家、Skill、资料库和 MCP/连接器。这是默认自有功能边界，不代表预装全部定义或 MCP 服务。当前 Desktop 仅支持个人工作区。

## 个人工作区

打开应用即自动准备并启动原有个人 Home/Profile，无需选择模式或登录企业。官方设置、模型配置、插件管理、侧栏和右侧面板保留完整界面。个人数据与显式安装的插件继续保存在可写 Profile 中。

主窗口提前加载安装包中的官方页面，等待本机后台就绪后在同一页面继续启动。关闭窗口会隐藏它并保留后台任务、会话、草稿和页面状态；Windows/Linux 通过托盘、macOS 通过 Dock 重新打开。再次启动应用也会恢复原窗口。“应用程序 → 退出 EasyWork”或托盘中的“退出 EasyWork”会停止后台并退出。

Desktop 不提供企业登录、账号认证桥接、成员空间或公司专用打包配置。启动时不迁移或删除既有历史企业数据。终端命令始终使用个人空间；工具菜单仍可按需安装、修复或移除 dsh 命令。

## 开发与验证

使用 Node.js `^22.19.0` 或 `>=24`，以及通过 Corepack 启动的 Yarn 4.18.0。在仓库根目录执行：

```sh
corepack yarn install --immutable
corepack pnpm --dir apps/web build
node apps/desktop/scripts/pack-workdsh-profile.mjs apps/web
corepack yarn dev
```

`dev` 构建外壳、准备固定版本 Profile 和主运行时，再启动 Electron。图形启动保持显式。无界面验证使用：

```sh
corepack yarn typecheck
corepack yarn check:bilingual-docs
corepack yarn check:desktop-dsh-alignment
```

`corepack yarn check` 是完整 headless 门禁。`corepack yarn workspace dsh-plugin-desktop package:dir` 生成未压缩应用并检查重复 DSH 依赖树。构建和类型检查不代表真实窗口、打包运行时或服务器验收。

Windows 安装器性能比较使用 `node apps/desktop/scripts/build-windows-nsis-ab.ts --label=candidate`，从同一未压缩应用生成直接解压和暂存复制两种安装器，不修改仓库中的 builder 补丁。基线与候选分别在各自 worktree 构建，再用 `apps/desktop/scripts/run-windows-nsis-ab.ps1` 消费对应清单。冷测量须先准备统一的 VM 快照，每种方案、每个场景均从该快照恢复；在热系统交替运行不能证明冷安装或升级性能。生成清单、测量结果和截图保存在本地制品目录。

`corepack yarn release:pack` 构建并打包同一提交的 Web 源码与经过核对的 Desktop 组合，保留干净源码发行门禁。Web 发行目录同时生成 `desktop-release-manifest.json` 与对应哈希命名制品，供已发布 Desktop 打包使用。

先在 EasyWork 构建五个自有功能及必要支撑包。`pack-workdsh-profile.mjs` 在 `build/workdsh-profile-release` 生成不可变制品与版本/哈希清单；其他候选通过 `WORKDSH_RELEASE_DIRECTORY` 显式选择。运行时准备安装固定官方版本，生成可移植锁文件，并携带 pnpm JavaScript CLI 支持显式插件操作。门禁拒绝额外默认功能包，并验证真实插件管理器恰好展示五个 EasyWork bundle。同一 Profile 保留固定的 SkillHub 0.2.16 和 dshmarket 1.66.8 目录集成，不代表目录内容全部安装或经 EasyWork 审核。不打包正在使用的用户配置或凭据。

Desktop pin 与共同产品目标均为 **DSH 0.2.0-rc.2**，由用户明确选择。未修改的官方 `dsh-v0.2.0-rc.2` tag 固定提交 `639ed015397290b3745d163aafe02ffee4aa3f84`。既有安装包和 Profile 的实际版本需要单独核验。Desktop alignment、Desktop checks 和 packaged-runtime 验收都通过后才能宣布统一升级完成；Web Docker 证据不能代替。默认选择经过验证的官方稳定版。

构建只消费已发布官方包和校验锁定的二进制制品。外壳源码与打包脚本在本目录，功能包源码属于 EasyWork，Web 启动与部署由 apps/web 拥有。参见 [Desktop 归属](../../docs/desktop-boundaries.md)。
