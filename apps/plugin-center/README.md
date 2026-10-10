# EasyWork 插件服务中心

服务端已独立为 Rust 项目 [EasyWork Server](https://github.com/hicms/easywork-server)，本机源码位置为 `E:/dev/rust/easywork-server`。构建、发布插件、部署及后续模块开发见该项目的 `README.md` 和 `docs/plugin-center-protocol.md`。本目录仅保留接入说明；原 Node 服务端和发布器已移除。

Desktop 和 Web 继续通过共享 EasyWork Profile 中的更新功能访问服务中心。在「插件 → 插件版本与更新 → EasyWork 插件服务中心」配置地址和 Ed25519 发布公钥。查询与更新均由用户手动触发，自有插件分发不依赖 GitHub。

Rust 服务沿用原有签名目录、安装包和密钥协议，可直接读取原数据目录。迁移前停止旧 Node 发布器，避免两种锁协议同时写入；保留 `catalogs/`、`archives/` 和原签名密钥。服务进程只读数据，私钥保留在受控发布机。

默认独立更新范围为技能、专家、资料库、连接器和项目。它们的每个版本须通过应用锁定 DSH 的兼容和运行验证后再发布；DSH 核心不通过此渠道更新，共享基础包仍随应用交付。尚未部署公网生产服务，服务器确定后再配置 HTTPS 地址。
