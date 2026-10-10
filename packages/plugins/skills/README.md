# 技能管理插件

> 当前源码精确锁定 Harness **0.2.0-rc.2 / Cordis 4.0.4**；实际构建、安装与运行范围见[验收要求](../../../apps/web/docs/ACCEPTANCE.md)。[历史发布说明](https://github.com/techflag/easywork/releases)及旧探针不能证明本轮源码或 Desktop 安装包已验收。

状态：**Skill 0.1 开发候选，已提供本地技能管理和独立插件入口**。当前构建、安装和运行验收以[验收要求](../../../apps/web/docs/ACCEPTANCE.md)为准。当前候选制品 `easywork-plugin-skills@0.1.0-alpha.34`，尚未发布 npm。一个插件管理多个 Skill 业务对象；用户制作技能不需要发布 npm 包。

本包提供标准 Host `apply/inject`、独立 Client `apply/inject`、`dsh.bundle` 配置 patch 和 `dsh.client` 浏览器产物。官方 Loader/Profile/Cordis 拥有加载及生命周期；不依赖 EasyWork 总包或另一个插件框架。旧候选的独立安装、默认组合、移除与重装过程见[历史记录](../../../apps/web/docs/CONTRACTS.md)，不代替当前版本验收。

- 模块版本线：**0.1**，Host、Client、资源和内置管理 Skill 共用版本。
- 主任务：P1-03；任务编号用于开发追溯，不代表当前版本已经完成验收。
- 边界：复用官方 Skill provider、工具和 Conversation；不重造执行器，导入不运行脚本。

## 安装和组合

当前源码基线：Node 22.19+、Harness `0.2.0-rc.2`、Cordis `4.0.4`。从已配置这些依赖的官方 Web Profile 安装同次构建的本地 tgz；将以下路径替换为实际制品绝对路径：

```sh
dsh plugin --profile <你的 Web Profile> add /absolute/path/easywork-plugin-skills-0.1.0-alpha.34.tgz
```

按官方流程停服修改组合，再重启该 Profile。卸载管理插件用官方 `dsh plugin --profile <Profile> remove easywork-plugin-skills`；用户技能文件和管理数据保留，重装继续使用。插件移除与页面中“卸载某个技能对象”不同：后者进入可恢复回收站。当前未宣称完整运行中 CLI 热卸载。

仓库开发使用固定 pnpm；先 `corepack pnpm build`，再 `corepack pnpm preview:install`。安装脚本通过官方 CLI 将 Skill 和 EasyWork 展示包作为两个独立 Profile 层安装；最后 `corepack pnpm preview`。现有预览应先停止，自动化测试使用隔离 Agents home，人工预览仍默认使用用户原有 `~/.agents`。

可独立打包并验收：

```sh
corepack pnpm --filter easywork-plugin-skills build
corepack pnpm --filter easywork-plugin-skills pack --pack-destination .artifacts
corepack pnpm probe:skills
corepack pnpm probe:browser
```

产物内含所需 UI 代码和本地 DTO 声明，不要求运行时存在 `easywork-ui` 或开发 workspace。React 由官方 renderer 共享；依赖的 Harness 服务明确声明，不把框架复制进包。

技能页提供本地已安装技能管理和独立 SkillHub 浏览入口。目录浏览不自动安装技能；安装经过导入预检与用户确认。用户可显式选择已有的通用本地目录：个人运行设置 `EASYWORK_SKILL_CATALOG`，或由可信 Host 指定 `catalogRoot`。本地目录使用 `catalog.json`、`icons/` 与 `payloads/`；第三方内容的许可、依赖与兼容性由具体来源和安装校验决定。

## 公开服务与依赖

Host 提供 `ctx.easyworkSkills`，类型源为 `easywork-contracts/skills` 的 `SkillManagementService`，`contractVersion` 为 `1`。这是受信本地 Host 管理契约，**不属于企业鉴权 API**。使用服务的插件显式注入 `easyworkSkills`，只依赖公共类型，不导入本包内部 `SkillManager`：

```ts
import type { Context } from '@deepseek-ai/cordis';
import type { SkillManagementService } from 'easywork-contracts/skills';

declare module '@deepseek-ai/cordis' {
  interface Context { easyworkSkills: SkillManagementService; }
}

export const inject = ['easyworkSkills'];
export function apply(ctx: Context) {
  if (ctx.easyworkSkills.contractVersion !== 1) throw new Error('Unsupported Skill contract');
  // Use list/detail/readResource/update and other public methods as needed.
}
```

领域若贡献卸载影响，通过 `registerDependencyInspector()` 返回依赖；消费者用自己的 `ctx.effect()` 托管返回的清理函数。必需服务消失时，由 Cordis 停止消费者，恢复后重新激活。两个消费者共享同一技能所有者的测试已通过，不能据此声称专家模块已实现。

当前契约保留现有本地管理语义：完整正文、资源、冲突修订、导入、草稿发布、启停、依赖影响、回收和恢复。**不可变 SkillRevision、专家执行快照租约和多用户授权尚未实现**，后续专家接入必须补齐，不能把当前文件摘要当作永久历史修订。

## 功能与所有权

全局技能库、搜索、完整详情、直接编辑、资源编辑、打开文件夹、启停、可恢复卸载、批量管理以及新增技能入口均保持原有业务服务。添加菜单提供查找、上传和创建：查找聚焦已安装目录，上传使用专用预检/确认弹框，创建预填原生 Conversation 的 `/easywork-skill-creator`，不自动发送。

技能页默认展示已安装集合。只有显式选择通用本地目录时，才按实际元数据展示分类、图标及可安装条目；安装使用官方受管导入路径（全局名称锁、内容指纹复核、原子发布）。超限条目显示安装限制，目录缺失或损坏显示真实诊断，图标通过认证 GET 路由返回。「我安装的」入口提供安装总数、批量管理与页内搜索，复用同一卡片和菜单。

管理请求与流式上传复用官方 Connection 认证 exact Fetch 扩展面；公开版本的外部 workspace Typert 生成问题仍记录为兼容项。插件撤销时取消 Client 请求、停止路由并排空在途请求；打开目录沿用原生 Session Remote。页面不持有第二套技能执行目录。

内置 `easywork-skill-creator` 使用官方 `defineTool` 调用同一个 Host 服务，经过私有草稿、校验、精确 revision 和确认发布。默认共享目标为 `$DSH_AGENTS_HOME/skills`，未配置时为 `~/.agents/skills`；只有明确选择 Harness Profile 范围时使用 `$DSH_HOME/skills`。不得覆盖无关技能。

本包独立贡献能力中心侧栏入口和 Skill 页面，移除后这些贡献随插件消失；官方工作区、会话、原生 `/`、`@`、附件、模型和权限仍由 Harness 拥有。显式选择的本地目录只提供数据，不成为默认市场或技能执行器。SkillHub 和第三方市场独立提供目录内容，不代表内置或审核全部技能；[ADR-0015](../../../apps/web/docs/CONTRACTS.md) 的后期组织资产设想不构成当前交付承诺。

开发前阅读[规则](../../../apps/web/AGENTS.md)、[验收要求](../../../apps/web/docs/ACCEPTANCE.md)、[契约](../../../apps/web/docs/CONTRACTS.md)、[团队设计](../../../apps/web/docs/CONTRACTS.md)和[ADR-0018](../../../apps/web/docs/CONTRACTS.md)。

## 专业内容制作指南

内置 `easywork-ppt-design`、`easywork-word-design`、`easywork-excel-design`、`easywork-web-design`，参考腾讯 / WorkBuddy 的产品化方法，由 EasyWork 按当前工具重新编写。包含叙事、排版、公式审查、响应式与交付参考；不是腾讯 SDK、转换引擎或云服务。感谢相关产品提供的设计启发。指南不能扩充当前编辑器或工具能力，具体来源与边界见[适配说明](../../../apps/web/docs/CONTRACTS.md)。

创建指南使用 EasyWork 独立命令，保留用户同名原版技能。多阶段创建要求更新原生任务进度；中断恢复先核对已有草稿与成果。

2026-09-14源码候选0.1.0-alpha.28：配合活动插件提供已有技能标题；通过公开展示契约协作，不复制执行或技能状态。

## 内置技能工程维护

五个内置技能位于 `resources/skills/<name>/SKILL.md`，正文不在 TypeScript 独立维护。执行 build/typecheck 前由 `scripts/generate-builtin-skills.mjs` 使用官方 Harness provider 解析并生成注册内容；references 随本包交付。用户创建技能仍由管理服务保存到官方用户根。内置在管理页保持只读，工程修改后随插件更新。唯一内置 PPT 制作技能采用已合并的设计方法，不包含腾讯专属引擎或原版脚本。目录及来源规则见[架构](../../../apps/web/docs/ARCHITECTURE.md)。

### 完整技能制作

内置 easywork-skill-creator 接入用户提供的 WorkBuddy 完整创建方法及初始化、校验、ZIP 打包脚本（Apache-2.0，来源及修改见 resources/skills/easywork-skill-creator/NOTICE.md）。带 references/scripts/assets 的技能在工作区草稿目录制作，导出 ZIP 后经现有导入预检和确认安装；单文件技能仍使用原草稿工具。需要 Python3 与实际执行工具；基础脚本校验不替代 Harness 解析或真实任务试用。

页面与弹窗使用 Harness 原生主题语义颜色，跟随官方外观设置及系统明暗切换。

## 显式 Host 数据目录

可信 Host 装配可以使用 `new SkillManager(ctx, { dshHome, agentsHome, catalogRoot })`，并给官方 `dsh-skill-filesystem` 配置相同的 `dshHome` 和 `agentsHome`。未指定 catalogRoot 时默认不读取任何推荐目录；只有未指定 agentsHome 的个人运行可显式使用 EASYWORK_SKILL_CATALOG。指定 agentsHome 的账号运行不继承进程级目录配置。目录不能来自未验证的浏览器或模型输入。

省略 options 保留个人版环境变量和 Home 解析。当前企业路线为独立账号进程，同一技能包使用该进程的独立 Home、Agents home 和官方 Skill provider；配置目录本身不提供执行沙箱。旧共享 Host 的成员 selector 与 scoped registry 装配已删除。管理 HTTP 端点与草稿工具使用本进程服务，按实际 Session/Agent 归属授权。账号进程、文件及工具边界的实际验证范围见[验收要求](../../../apps/web/docs/ACCEPTANCE.md)。
