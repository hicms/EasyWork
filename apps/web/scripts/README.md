# 工程检查脚本

- `build-workspace.mjs`：复用固定版本 pnpm 的依赖排序与去重，执行选中包及其工作区依赖的 `build:local`。公共 `build` 入口仍支持单独构建插件；单包参数只传给目标包。全量构建的功能范围由 Web `package.json` 的 `build` 命令声明。
- `corepack pnpm check:build`：使用隔离工作区和真实 pnpm 验证依赖顺序、共享包只构建一次、单包参数及失败传播。
- `check-plan.mjs`：模块目录、任务引用、团队必测项、相对文档链接与占位入口检查。
- `verify-packages.mjs`：P0 实现，检查真实发布入口、依赖及打包资源。
- `verify-compatibility.mjs`：P0 实现，验证固定版本公开契约。

后两者尚未实现，不创建固定返回成功的脚本。
