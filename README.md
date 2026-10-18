<p align="center"><img src="assets/brand/EasyWork-logo.svg" width="300" alt="EasyWork"></p>

EasyWork 是基于官方 DeepSeek Harness 的个人 AI 工作台，包含 Web 和 Electron 桌面端，共享项目、资料库、专家、技能和连接器功能。

Desktop 和 Web 共用 EasyWork 账号与模型服务。在“账号与模型”中登录 [模型服务](https://ask.vigoai.cn) 后，使用服务下发的模型目录；会话内可搜索、切换模型和调整思考参数。账号 JWT 保存在 Host 凭据记录中，退出账号保留本地会话、文件和已安装插件。接入说明见[账号与模型插件](packages/plugins/models/README.md)。

Windows x64 安装包通过 [GitHub Releases](https://github.com/hicms/EasyWork/releases) 提供，最新版可直接下载 [EasyWork-x64-Setup.exe](https://github.com/hicms/EasyWork/releases/download/easywork-download/EasyWork-x64-Setup.exe)。官方运行时版本由 [upstream.json](upstream.json) 锁定；桌面端只承载已发布的官方运行时。

需要 Node.js `^22.19.0` 或 `>=24.0.0`，并启用 Corepack。

```sh
corepack yarn install --immutable
corepack yarn check
corepack yarn dev
```

Web 使用独立的 pnpm 工作区：

只运行 Web 调试可在仓库根目录执行 `./scripts/dev-web.ps1`（Windows）或 `bash scripts/dev-web.sh`（macOS/Linux）。首次运行会安装 Web 依赖、构建共享插件并准备独立预览 Profile，然后在本机端口 `18989` 提供服务。打开终端输出的完整带 `token` 地址，按 Ctrl+C 停止。修改源码后重新运行即可更新插件。已有预览可用 `./scripts/dev-web.ps1 -SkipSetup -Port 19000` 或 `bash scripts/dev-web.sh --skip-setup --port=19000` 跳过准备。也可使用 `corepack yarn dev:web`。

```sh
cd apps/web
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm typecheck
corepack pnpm preview:install
corepack pnpm preview
```

Windows x64 本地打包在 Windows PowerShell 中执行：

```powershell
.\scripts\build.ps1
# 默认只构建免安装目录，完成后直接运行
.\apps\desktop\dist\win-unpacked\EasyWork.exe
# 需要安装包时单独构建
.\scripts\build.ps1 -Target installer
```

脚本默认安装锁定依赖、构建当前源码的 Web/共享插件、运行完整 Desktop 检查、准备官方运行时，并仅生成 `apps/desktop/dist/win-unpacked/` 免安装目录。直接运行其中的 `EasyWork.exe` 即可测试，无需安装，也无需每次启动重新解压。必须保留整个目录及其 `resources`、DLL 等文件，不能单独复制 EXE；需要分享测试包时可压缩整个目录，接收方解压一次后运行。个人数据仍由现有个人 Profile 管理。只有指定 `-Target installer` 才生成 `EasyWork-<版本>-x64-Setup.exe`。依赖已安装时可加 `-SkipInstall`；`-Help` 查看用法。也可执行 `corepack yarn build:win`。临时 Profile 档案用完即清理，准备的运行时复用固定目录，不累积新的候选副本。构建保持无界面，不提交、发布或启动应用；本地包未签名，正式发布仍走现有发行校验流程。Windows 包须在原生 Windows x64 环境构建。

GitHub Actions CI 仅支持手动运行，不会因 push 或 Pull Request 自动触发。需要云端验证时，在仓库的 Actions → CI → Run workflow 中手动启动；一次运行会检查 Desktop 和 Web。日常修改可按需使用本地检查。

Windows x64 NSIS 安装版会自动检查本渠道更新并在后台下载，准备好后在右下角显示“新版本就绪”。点击“重启升级”即可静默安装并重新打开；普通退出不安装。验收完整升级流程时，先手动安装 Release 说明指定的基线版，再通过提示升级到下一版本。旧版 alpha.5 没有更新器，需要这一次手动安装。验收包未签名，首次安装可能提示未知发布者，不需要开启 Windows 测试模式。签名发行使用独立的 **Windows release** 手动工作流；渠道、构建与验收要求见 [Desktop 更新与发布](apps/desktop/README.zh.md#windows-更新与手动发布)。

没有签名证书时，使用未签名验收渠道的一键入口。先把新版本写入 `apps/desktop/package.json`（必须是新的 `x.y.z-alpha.n`），提交并推送到 `main`，确认工作区干净，然后执行：

```powershell
corepack yarn release:acceptance --dry-run
corepack yarn release:acceptance
```

脚本会校验当前提交已推送到 `main`，触发 GitHub Actions 的 Windows x64 构建、实际界面验收、四个 A→B 更新场景和制品校验，并在成功后自动公开 `acceptance-v<版本>` 预发布版，再把固定的 `easywork-download` Release 更新为该版本安装包 `EasyWork-x64-Setup.exe`（没有正式稳定版时显示为 Latest，更新器不会从它安装）；默认会等待工作流结束并打印 Release 地址。它不读取或要求 `WIN_CSC_*` 证书配置。客户端必须是同一未签名验收渠道的安装版，才会收到该版本更新。签名发布仍使用下面的 `release:windows` 流程。

### Windows 签名发布流程

发布入口为 [scripts/release-windows.mjs](scripts/release-windows.mjs)，在仓库根目录执行。需要安装 GitHub CLI（`gh`），用有权触发本仓库工作流的账号执行 `gh auth login`。先在 GitHub Settings → Secrets and variables → Actions 配置仓库级 secrets `WIN_CSC_LINK`（签名证书）、`WIN_CSC_KEY_PASSWORD`（证书密码），以及变量 `EASYWORK_WIN_PUBLISHER`（与证书发布者名称完全一致）。工作流不使用 GitHub environments，不会在仓库首页产生 Deployments 记录；缺少签名配置时，正式发布会停止。

1. 在 `apps/desktop/package.json` 设置未发布的新版本：`x.y.z-alpha.n` 对应 alpha 渠道，`x.y.z` 对应稳定渠道。将版本和待发布修改提交、推送到 `main`，确保工作区干净，并执行 `git fetch origin` 更新远端引用。
2. 先预览参数，再触发候选构建：

   ```powershell
   corepack yarn release:windows --dry-run
   corepack yarn release:windows
   ```

   脚本从当前提交读取版本并推导渠道，要求 `HEAD` 等于 `origin/main`。命令提交任务后即返回；到 Actions → **Windows release** 查看运行结果。工作流通过 Desktop/Web 检查、Windows 签名打包和隔离 Home 的 UI 验收后，才创建 Release 草稿。草稿不会触发客户端更新。

3. 记录成功的 draft 运行号 `RUN_ID`（运行页面 URL 中 `/actions/runs/` 后的数字），完成该候选所需的实际安装与更新验收，并准备与 `release.json` 中源码、版本、渠道和安装包摘要一致的验收 JSON。具体检查项、证据格式及首次发布规则见 [Desktop 更新与发布](apps/desktop/README.zh.md#windows-更新与手动发布)。将证据保存在忽略的验收输出目录或仓库外，避免造成工作区未提交改动。
4. 保持本地 `main` 为生成该候选的同一提交，使用真实运行号和证据路径替换占位值后公开发布：

   ```powershell
   corepack yarn release:windows --operation=publish --candidate-run=RUN_ID --acceptance-file=PATH
   ```

   发布工作流会复核验收证据和远端制品摘要，再公开原草稿；不会重新构建或覆盖已公开制品。须确认工作流成功且 Release 已公开，才算发版完成。查看入口帮助可执行 `corepack yarn release:windows --help`。

启用更新器的安装版只会接收同一渠道、同一签名模式中版本号更高的公开版本，自动检查和下载后仍需点击“重启升级”。未签名验收版不会自动切换到签名发行版；免安装目录、portable 和普通未签名本地包不启用自动更新。

Logo 原稿和配色位于 `assets/brand/`。运行 `node scripts/generate-brand-assets.mjs` 同步矢量资源，桌面构建会自动生成各平台图标。

许可证见 [LICENSE](LICENSE)，第三方组件声明见 [THIRD_PARTY_NOTICES.md](apps/desktop/THIRD_PARTY_NOTICES.md)。
