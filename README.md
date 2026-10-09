<p align="center"><img src="assets/brand/EasyWork-logo.svg" width="300" alt="EasyWork"></p>

EasyWork 是基于官方 DeepSeek Harness 的个人 AI 工作台，包含 Web 和 Electron 桌面端，共享项目、资料库、专家、技能和连接器功能。

此仓库是 EasyWork 的源码起点，尚未发布 EasyWork 安装包。官方运行时版本由 [upstream.json](upstream.json) 锁定；桌面端只承载已发布的官方运行时。

需要 Node.js `^22.19.0` 或 `>=24.0.0`，并启用 Corepack。

```sh
corepack yarn install --immutable
corepack yarn check
corepack yarn dev
```

Web 使用独立的 pnpm 工作区：

```sh
cd apps/web
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm typecheck
corepack pnpm preview
```

Logo 原稿和配色位于 `assets/brand/`。运行 `node scripts/generate-brand-assets.mjs` 同步矢量资源，桌面构建会自动生成各平台图标。

许可证见 [LICENSE](LICENSE)，第三方组件声明见 [THIRD_PARTY_NOTICES.md](apps/desktop/THIRD_PARTY_NOTICES.md)。
