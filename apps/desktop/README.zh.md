# EasyWork Desktop 外壳

[English](README.md)

本包构建 Electron 应用，包含一套个人运行时 Profile。官方 DeepSeek Harness 拥有 Host、完整 Web 客户端及核心执行；EasyWork 功能包提供共同的专家、Skill、资料库和 MCP/连接器。这是默认自有功能边界，不代表预装全部定义或 MCP 服务。当前 Desktop 仅支持个人工作区。

## 个人工作区

打开应用即自动准备并启动原有个人 Home/Profile，无需选择模式或登录企业。Desktop/Web 共用 EasyWork 账号与模型插件，登录 `https://ask.vigoai.cn` 后使用服务下发的模型目录。`ModelAdapter` 复用官方发布运行时，JWT 保存在 Host 凭据记录中。其余官方设置、插件管理、会话、侧栏和右侧面板继续使用官方所有者。退出账号保留本地数据与显式安装的插件。

主窗口提前加载安装包中的官方页面，等待本机后台就绪后在同一页面继续启动。关闭窗口会隐藏它并保留后台任务、会话、草稿和页面状态；Windows/Linux 通过托盘、macOS 通过 Dock 重新打开。再次启动应用也会恢复原窗口。“应用程序 → 退出 EasyWork”或托盘中的“退出 EasyWork”会停止后台并退出。

窗口装饰沿用官方 Desktop 的方式：Windows 隐藏系统标题栏和传统菜单栏，在 40 像素顶部区域保留原生窗口按钮与“应用程序 / 编辑”菜单，颜色跟随页面主题；macOS 使用嵌入侧栏的红黄绿按钮与侧栏毛玻璃。顶部空白区域可拖动窗口，全屏时让出窗口控制区域，重新加载后同步当前全屏状态；Windows 可用 F11 切换全屏，Esc 返回普通窗口。Linux 保留官方使用的原生窗口装饰。

桌面快捷键通过外壳桥接到官方客户端，偏好由同一已发布 Profile 内的官方快捷键协议管理，保存在 Desktop 用户数据目录下的 `keybindings.json`。外壳不携带第二套 DSH 依赖。

Desktop 不提供企业登录、账号认证桥接、成员空间或公司专用打包配置。启动时不迁移或删除既有历史企业数据。终端命令始终使用个人空间；应用程序菜单可按需安装、修复或移除 dsh 命令。

首次启动且个人 Home 中还没有工作区或会话时，默认工作区目录为 Windows 的 `%USERPROFILE%\Documents\EasyWork\default-workspace`。Desktop 通过 `EASYWORK_WORKSPACE_ROOT` 提供根目录；需要把默认工作区放到其他位置时，可将它设置为绝对路径，实际目录会使用该路径下的 `default-workspace`。已有工作区、会话和历史目录不会自动迁移。

## Windows 更新与手动发布

启用更新器的 Windows x64 NSIS 安装版会在启动完成后及之后每六小时检查本渠道更新，不阻塞离线工作。也可使用**应用程序 → 检查更新**。更新在后台自动下载，期间可以继续工作；菜单和任务栏显示进度。下载并校验完成后，右下角显示**新版本就绪**，提供**更新日志**、**重启升级**和关闭按钮。请先保存草稿并结束运行中的任务；点击“重启升级”即确认静默安装并自动重新打开，不再显示第二次安装向导。关闭提示后，仍可通过应用程序菜单重启升级。普通退出不会安装。重启操作在停止 Host 前重新校验候选版本、大小和 SHA-512；签名发行还须校验发布者签名；缓存缺失或变化会在关闭后台前报错，并允许重新下载。外壳只有在安装器进程成功启动后才退出；创建进程不代表安装成功。更新提示在首次检查前同步启动页面语言，并跟随之后的外观设置变化，无需先打开菜单。安装前必须收到 Host 关闭完成确认、等待正常退出，并确认 Windows Job 中没有剩余子进程。无法确认时暂缓安装，提示重新启动后重试。官方 Host 自身的关闭流程可能终止超时任务；失败或强制结束都不能成为安装依据。开发态、浏览器 worker、免安装目录、portable 和普通未签名本地包不启用更新器；下述明确启用的未签名验收包例外。

`electron-updater` 精确锁定 **6.8.10**，设置 `autoDownload=false`、`autoInstallOnAppQuit=false`。控制器在发现新版本后自动下载，上游自动下载开关保持关闭以保证此顺序。签名模式的下载结果（包括缓存命中）必须通过带时间戳的 Authenticode 发布者签名校验；校验工具不可用时阻止更新。其完整依赖打入 `lib/desktop-updater.cjs`；外壳仍只有一套官方 DSH Profile，不增加根级运行时依赖安装。渠道严格隔离：`x.y.z-alpha.n` 只接收 alpha，`x.y.z` 只接收稳定版（`latest`）。签名 GitHub Releases 使用规范的 `vVERSION` 标签，沿用应用和更新缓存标识。请保留历史 Setup 与 blockmap：差量下载依赖旧安装包缓存和旧版 blockmap。缓存缺失、blockmap 不可用或差量校验失败时，更新器回退全量下载。差量仅优化下载流量；EXE、ASAR、unpacked 文件和运行时仍完整配套安装。旧版没有更新器，必须先正常安装一次带更新器的版本，之后才具备 A→B 更新能力。

**Windows release** 工作流仅手动触发。请从默认分支发起，填写完整源提交 SHA、该提交中已写入的 Desktop 版本和对应渠道。`draft` 验证提交可从默认分支到达，并在同一 SHA 运行 Desktop 与 Web CI。原生 Windows x64 构建只准备一次 Profile/运行时，只生成 NSIS，签名应用、卸载器和 Setup，再验证带时间戳的发布者签名、最终 SHA-512 和重新计算的 blockmap。现有外壳、归档依赖闭包、原生命令注册、fuse 和 packaged-runtime 门禁继续保留。另在隔离 Home 中启动免安装目录的实际 Windows 界面，检查个人启动、项目操作并截图。完整且校验通过的制品才上传到 Release 草稿；客户端不能发现草稿。

本地可用根目录脚本代替手工填写工作流参数：`corepack yarn release:windows` 会从干净且已推送的 `main` 触发 `draft`；正式公开前使用 `corepack yarn release:windows --operation=publish --candidate-run=RUN_ID --acceptance-file=PATH`。脚本只负责触发工作流，签名、实际验收和发布门禁仍由 GitHub Actions 执行。

保留 GitHub environments `desktop-release-signing`、`desktop-release-publish` 及其已配置的部署保护。工作流不要求第二位维护者，也不额外强制审批人或禁止自行审批设置。签名环境需要 secrets `WIN_CSC_LINK`（electron-builder 接受的 PKCS#12 证书）、`WIN_CSC_KEY_PASSWORD`，以及与证书发布者名称精确一致的变量 `EASYWORK_WIN_PUBLISHER`。缺少签名配置会阻止正式发行，本地未签名 `package-win.ts` 路径独立保留。两个安装包入口都会在构建前检查实际链接的 builder 补丁与 `yarn.lock` 一致，并包含所需 NSIS 保护；依赖树过期时，须在获准发行构建前明确执行 `corepack yarn install --immutable` 同步。Builder 在签名之后生成更新元数据；之后不得修改或再次签名 Setup。

正式安装包把更新目标绑定到当前可执行文件所在的安装目录，短暂等待该目录的进程自然退出；无法确定进程归属或查询失败时停止安装，不会终止其他 EasyWork 安装的进程。移除旧文件使用本次签名的新卸载器，执行相同的目录和进程检查，不运行已安装的旧卸载器。启动、移除文件和校验锁定的 7za 解压器出错都会停止安装。安装原地替换，**不支持自动回滚**。若安装失败，请关闭 EasyWork，重新运行完整的已签名 Setup 修复。个人 Home、会话、凭据、文件和显式安装的插件不属于安装包替换内容。

公开发布需要**第二次手动触发**：设置 `operation=publish`，填写相同源提交、版本、渠道，以及成功草稿运行的 `candidate_run`。`acceptance_json` 必须包含从 `release.json` 复制的 `sourceCommit`、`version`、`channel`、`installerSha512`，仓库 issue/discussion 的 `evidenceUrl`，以及包含 [`ACCEPTANCE_CHECKS`](../../scripts/desktop-release-policy.mjs) 全部键的 `checks`。每项只有在**实际验收通过后**才能设为 `true`。证据需记录必需插件实际 UI、安装运行时、A→B 及下载字节量、缓存缺失回退、断网重试、损坏差量回退、数据保留、普通退出、忙碌任务退出、进程清理和安装失败修复，附截图与日志。发布操作者及环境中已配置的审批人须核对这些证据。工作流再次比对所有远端制品摘要，再一次性公开完整草稿；不会覆盖公开制品，也不会为发布重新构建候选。保留历史安装包和 blockmap，启用 GitHub 不可变 Releases 并保护发行标签。CI 制品保留 30 天，请在期限内完成发布。

验收明确区分 `mode: "bootstrap"` 和 `mode: "upgrade"`。每个渠道第一个带更新器的版本可以使用 bootstrap：实际完成 `BOOTSTRAP_CHECKS` 的全部项目，包括覆盖旧应用的正常安装和数据保留。其余 `ACCEPTANCE_CHECKS` 键必须列入 `unperformed`，不得标为通过。经过认证并完整分页的发行历史必须确认该渠道尚无带更新器的公开版本；查询失败就阻止发布。Bootstrap 不代表 A→B 或差量验收通过。之后所有发行均要求 upgrade 模式和全部升级检查。

公开前验证 A→B 时，请使用可丢弃的 Windows 虚拟机，先正常安装已签名的基线 A，再将精确的签名草稿 B 和基线 A 制品集（各含 `release.json`）下载到不同目录。已有 Web Playwright 依赖后，明确运行：

```powershell
node apps/desktop/tests/acceptance/accept-windows-update.mjs --confirm-isolated-vm --app="C:\Users\tester\AppData\Local\Programs\EasyWork\EasyWork.exe" --home="C:\tests\fresh-home" --output="C:\tests\results" --baseline="C:\tests\A" --candidate="C:\tests\B" --scenario=delta
```

该工具使用全新的测试 Home 打开已安装 A，只把当前受检进程中的 GitHub 发现请求和 updater 会话重定向到本机测试服务。应用版本、签名制品和签名校验保持原样，产品更新源不变。请先在测试 Home 中创建有代表性的本地数据，结束任务，再点击真实更新提示或菜单中的重启操作。工具记录完成的载荷字节与 Range 请求。请关闭安装器自动重新打开的 B：Windows Shell 重启应用时可能不会继承 A 进程中的测试 Home 设置。然后保持 `--app`、`--home` 等全部参数不变，在原命令末尾追加 `--verify-installed` 再运行。该模式复用原测试 Home，断言 B 的实际版本和用户数据路径，记录 `installed-observation.json`，并打开 B 供人工检查数据与 UI。只在这个已核实的 Home 中比较数据；截图、数据保留和进程退出仍须实际核对。每个场景前恢复虚拟机快照。分别使用 `missing-blockmap`、`corrupt-blockmap`、`offline`；离线场景中输入 `online` 并回车恢复服务，再重试检查。测试缓存缺失时，只在可丢弃虚拟机中移除 A 的缓存（`release.json` 指定的 `%LOCALAPPDATA%\<updaterCacheDirName>`），再运行 delta 场景；真正差量测试必须保留缓存。该工具不代表场景已通过，不自动审批证据；只有选择真实的重启操作才安装。

非构建实现检查为 `corepack yarn typecheck`、`corepack yarn check:updates`。小型合成字节夹具运行实际锁定的差量下载器，验证 Range 复用、重建后的 SHA-512，以及缓存缺失、blockmap 损坏和缓存字节损坏时的全量回退。无界面检查还覆盖候选复验、启动顺序、PowerShell 进度/错误处理和语言同步。这些检查不执行 NSIS，不能证明真实应用 A→B、节省率、断网恢复、数据保留或 UI 验收。构建、运行时准备、签名、打包、触发 CI 和安装仍须明确执行；真实安装结果及未验证场景请以该发行版本对应的 Windows 验收制品为准。

没有 Windows 签名证书时，可明确执行 `corepack yarn build:win --target=installer --acceptance-updates --skip-install` 构建启用更新的验收安装包，要求干净的默认分支源码和 alpha 版本。不需要 Windows TESTSIGNING；Windows 可能将未签名应用标为未知发布者。此模式只接受 `acceptance-vVERSION` 预发布版，使用 HTTPS GitHub 元数据、精确大小和 SHA-512 校验，不验证 Authenticode 发布者身份。签名发行通道仍强制验签。两个模式使用相同的安全退出与 NSIS 安装器；普通未签名打包仍禁用更新。

构建后，明确执行 `node apps/desktop/tests/acceptance/accept-windows-package.mjs --local --unsigned-updates`，再执行 `node apps/desktop/scripts/stage-unsigned-windows-release.mjs`。`dist/acceptance/VERSION` 中的制品包括 Setup、blockmap、`alpha.yml`、`release.json` 和绑定源码/包身份的 UI 证据。基线 A 和候选 B 均保持为 Release 草稿，用两个标签和 `scenario=all` 手动触发 **Windows update acceptance**。它在可丢弃的 Windows runner 中核对制品与源码，安装 A，点击真实更新提示，静默安装 B，观察自动重新打开并检查项目、文件及浏览器偏好保留。四个场景覆盖差量下载、缓存缺失、损坏 blockmap 和断网重试；同一手动工作流针对 B 的源码提交运行 Desktop 与 Web 检查，并单独记录验收工具提交。全部场景通过后，才公开已验收的字节，不重建替换。此结果不代表已验证签名发布者、真实账号凭据或任意外部插件保留。禁用更新器的旧版（包括 alpha.5）需要先手动安装一次 A；之后请保留历史 Setup/blockmap，供差量更新使用。

## 开发与验证

启动诊断保存在 Desktop 用户数据目录下的 `logs/startup.log`（Windows 默认为 `%APPDATA%\EasyWork`）。日志记录 Host、插件加载阶段、耗时、资源状态和加载进度；启动仍在等待时，每五秒记录一次。单文件达到 2 MiB 时轮转，保留三份备份。运行时输出只保留元数据摘要，不记录请求正文、认证头或会话文本。致命异常会在用户数据目录留下一个小型 `startup-fatal.log` 元数据文件。

打包后的 Desktop 将唯一的 Profile 放入 `app.asar/profiles/easywork`，以 Electron 的 Node 模式和 `--expose-internals` 启动官方 Host。JavaScript 和清单按发布原样归档，原生二进制和 Office 引擎资源保留在归档外；外壳固定使用受支持的 Electron 版本。启动不再预读整个模块树。`app.start.osUptimeSeconds` 记录系统开机后的秒数，热启动结果不能代替电脑重启后的首次启动验收。需要逐插件分析时，在上述 `logs` 目录创建空文件 `startup-trace.enabled`，下次启动会额外生成 `host-startup-*.json` 和 `.cpuprofile`。诊断结束后删除该标记即可停止采样。

使用 Node.js `^22.19.0` 或 `>=24`，以及通过 Corepack 启动的 Yarn 4.18.0。在仓库根目录执行：

```sh
corepack yarn install --immutable
cd apps/web
corepack pnpm install --frozen-lockfile
corepack pnpm build
cd ../..
node apps/desktop/scripts/pack-easywork-profile.mjs apps/web
corepack yarn dev
```

`dev` 构建外壳、准备固定版本 Profile 和主运行时，再启动 Electron。Web 构建对所选包及其依赖各执行一次；单个包的 `build` 命令也会准备所需依赖。主运行时和 Office 准备会复用内容一致的文件，私有构建记录让后续运行在文件标识、大小、权限和修改/变更时间均一致时复用已核对的文件对；文件缺失或变化时重新比较并按需修复。记录不随产品发行，也不作为发行完整性证据。Python、Office、技能及既有校验和与打包运行时门禁全部保留。图形启动保持显式。无界面验证使用：

```sh
corepack yarn typecheck
corepack yarn check:bilingual-docs
corepack yarn check:desktop-dsh-alignment
```

`corepack yarn check` 是完整 headless 门禁。`corepack yarn workspace dsh-plugin-desktop package:dir` 生成未压缩应用并检查重复 DSH 依赖树。构建和类型检查不代表真实窗口、打包运行时或服务器验收。

Windows 安装器性能比较使用 `node apps/desktop/scripts/build-windows-nsis-ab.ts --label=candidate`，从同一未压缩应用生成直接解压和暂存复制两种安装器，不修改仓库中的 builder 补丁。基线与候选分别在各自 worktree 构建，再用 `apps/desktop/scripts/run-windows-nsis-ab.ps1` 消费对应清单。冷测量须先准备统一的 VM 快照，每种方案、每个场景均从该快照恢复；在热系统交替运行不能证明冷安装或升级性能。生成清单、测量结果和截图保存在本地制品目录。

`corepack yarn release:pack` 构建并打包同一提交的 Web 源码与经过核对的 Desktop 组合，保留干净源码发行门禁。Web 发行目录同时生成 `desktop-release-manifest.json` 与对应哈希命名制品，供已发布 Desktop 打包使用。

先在 EasyWork 构建五个自有功能及必要支撑包。`pack-easywork-profile.mjs` 在 `build/easywork-profile-release` 生成不可变制品与版本/哈希清单；其他候选通过 `EASYWORK_RELEASE_DIRECTORY` 显式选择。运行时准备安装固定官方版本，生成可移植锁文件，并携带 pnpm JavaScript CLI 支持显式插件操作。门禁拒绝额外默认功能包，并验证真实插件管理器恰好展示五个 EasyWork bundle。同一 Profile 保留固定的 SkillHub 0.2.16 和 dshmarket 1.66.8 目录集成，不代表目录内容全部安装或经 EasyWork 审核。不打包正在使用的用户配置或凭据。

发行 Profile 使用 pnpm `nodeLinker: hoisted`：Windows 安装包会把依赖链接展开成重复文件，因此准备阶段和 `afterPack` 都拒绝虚拟包存储目录或链接的包目录。嵌套官方依赖仍接受精确 DSH 版本检查。打包排除依赖源码映射、类型声明和 PDB 调试文件，保留运行时二进制、Office 资源、技能和许可证。这只调整随包发行布局，根 Yarn 工作区和 Web pnpm 工作区保持各自设置。准备独立 Profile 候选可用 `EASYWORK_RUNTIME_DIRECTORY` 指定 `apps/desktop/build` 内的专用目录；打包流程仍使用 `build/easywork-runtime`。

自有包、开发变量、数据目录与存储键统一使用 `easywork-*`、`EASYWORK_*` 和 EasyWork。carrier 使用 `easywork` Profile，不保留旧产品别名、回退路径或数据迁移逻辑。`corepack yarn check:naming` 对源码和文件路径中的旧名称实行零例外检查。

Web 和 Desktop Profile 打包还会检查压缩插件包内部及发行元数据中的名称。Desktop `afterPack` 启动隔离的 headless 运行时，检查实际注册的原生 Skill 命令和 MCP 工具 schema。可在仓库根目录运行 `node apps/desktop/scripts/verify-runtime-product-names.mjs <runtime-directory>`，复查准备目录或打包目录中的运行时；该检查不打开窗口，也不发送模型请求。

Desktop pin 与共同产品目标均为 **DSH 0.2.0-rc.2**，由用户明确选择。未修改的官方 `dsh-v0.2.0-rc.2` tag 固定提交 `639ed015397290b3745d163aafe02ffee4aa3f84`。既有安装包和 Profile 的实际版本需要单独核验。Desktop alignment、Desktop checks 和 packaged-runtime 验收都通过后才能宣布统一升级完成；Web Docker 证据不能代替。默认选择经过验证的官方稳定版。

构建只消费已发布官方包和校验锁定的二进制制品。外壳源码与打包脚本在本目录，功能包源码属于 EasyWork，Web 启动与部署由 apps/web 拥有。参见 [Desktop 归属](../../docs/desktop-boundaries.md)。
