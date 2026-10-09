# 插件交付与完成条件

[EXTERNAL-PLUGINS](EXTERNAL-PLUGINS.md) 定义默认、可选和企业外置边界；[FEATURE-DEVELOPMENT-CONTRACT](FEATURE-DEVELOPMENT-CONTRACT.md) 定义唯一业务来源。

功能插件独立拥有包版本、构建、入口、资源与生命周期，管理多个用户业务对象。contracts、ui 与 bundle 分别只承担契约、展示与组合职责。源码路径不等于发行分类；各入口按实际安装清单和运行激活核对。

个人默认自有功能为专家、技能、资料库、MCP/连接器及必要基础依赖。Office、项目和活动为显式可选安装。企业账号在 Desktop 不可变携带，仅企业激活；企业 Web 显式组合同一插件。企业协作、通知和业务应用仍外置独立安装，不能经默认 peer/build dependency 递归带入。

单模块完成必须满足有限契约：

- 支持行为、入口、数据所有者、授权边界、公开 API 和必要依赖明确。
- 页面与工具调用同一个业务服务，真实主体在服务端解析，撤权失败关闭。
- 必需服务可诊断 PENDING/FAILED；ACTIVE、菜单或构建不是功能完成回执。
- service、Remote、registry、监听、timer、watcher、连接和子进程由 Fiber 托管并可完整撤销。
- 独立制品包含所有资源与精确依赖，无本地开发路径；安装、卸载、重装与升级不污染共享运行包或删除用户数据。
- 根据受影响入口完成构建、类型、行为、授权和必要真实运行；未执行的模型、GUI、平台及打包验收单独保留未完成。

官方版本以工程精确锁定为目标，实际个人/企业安装、企业镜像与 Desktop pin 分别核对。完整官方 Web 清单从同一官方发布包导出，不能删 UI 代替授权。Desktop 交付需要其 alignment、checks 和 packaged-runtime/GUI 验收。

npm 包版本、领域修订、数据 schema 与组合指纹独立。公开契约变化更新依赖与调用方；必要基础依赖通过正式 Loader/Profile/Cordis 组合，不隐藏调用其他插件 apply。提交保留源代码、必要契约和有限验收矩阵，凭据、测试数据、缓存、生成包及开发日志不进入源码。
