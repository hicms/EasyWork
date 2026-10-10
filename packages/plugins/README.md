# 功能插件目录

此目录仅用于归类，不是 npm 包，不声明 package.json、加载入口或统一版本。

技能、专家、资料库、连接器和项目的维护入口已迁至私有 [easywork-plugins](https://github.com/hicms/easywork-plugins) 仓库。本仓库保留由固定提交生成的构建副本，来源与逐文件哈希见 `profiles/shared/plugin-sources.lock.json`。修改在源仓库提交后，用根目录的 `scripts/sync-plugin-sources.mjs` 同步，并运行 `corepack yarn check:plugin-sources`；不要分别编辑两处源码。应用构建脚本映射由 `profiles/shared/plugin-build-scripts.json` 拥有。其余插件及共享 contracts/UI 仍在应用仓库维护。

子目录分别拥有独立包、版本、依赖、迁移和 CHANGELOG。skills 管理多个技能，experts 管理多个专家；跨插件通过公共服务契约协作。

当前状态见 [模块清单](../../apps/web/docs/modules.json)，开发顺序见 [逐插件计划](../../apps/web/docs/PLUGIN-DELIVERY.md)。bundle、contracts、ui 及 provider 包保持各自职责。
