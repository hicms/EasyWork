# EasyWork 账号与模型

Desktop 和 Web 共用此 Profile 插件，连接 `https://ask.vigoai.cn`。在设置的“账号与模型”中登录邮箱和密码后，使用服务下发的聊天模型；支持按名称/厂商搜索、档位分组、价格倍率与能力展示。输入框和 `/model` 通过官方 Session Controller 切换同一份模型选择，思考参数按服务公布的字段和值显示并随会话保存。

模型菜单采用独立浮层，按窗口边缘定位并在内部滚动，避免输入框或聊天区横向移位。厂商标识使用本地 SVG，能力通过带说明的图标呈现；完整名称、上下文等信息保留在提示中。思考参数使用分段切换按钮，选中项高亮，待服务确认时禁用；按钮沿用服务声明的原始值。图标来源及许可见 `THIRD_PARTY_NOTICES.md`。`corepack pnpm --filter easywork-plugin-models test:ui` 用真实浏览器检查桌面、窄分栏、明暗主题和小窗口下的布局与交互。

Host 调用 `/api/auth/login`、`/api/auth/me`、`/api/auth/logout` 和 `/api/models`，JWT 只进入官方 credential grant record，浏览器仅接收脱敏状态。密码仅用于本次登录，不保存。退出、过期和服务 401 撤销本插件的 JWT、目录及在途调用；为保证跨进程条件更新，已退出记录保留不含秘密的标记。暂时断网保留凭据，目录失败可以重试。当前服务不提供刷新令牌接口。登录授权远程模型服务，不迁移或删除本地 Home、会话、文件和其他插件数据。

`ModelAdapter` 使用发布的 `@deepseek-ai/dsh-llm-pi-ai` 与公开 pi-ai provider/payload API，支持 OpenAI Chat Completions、Anthropic Messages、Gemini GenerateContent。工具、图片、流式事件和回放转换由官方适配器拥有；每次调用固定账号、模型及完整思考参数。目录只声明输入能力与上下文，缺失容量使用明确的 32K 保守估计，不推断厂商名称。服务未声明输出上限时不设置会话请求默认上限。多维思考参数编码为官方 opaque reasoningEffort；调用适配器前验证并解码，库侧不接收这个自有值。

`cordis.patch.yml` 是账号/模型替换的权威清单：停用对应官方提供方、账号控制器和三个 UI 插件，保留官方 Host、凭据、Session、设置外壳和其他客户端。完整上游清单保持只读参考。Desktop/Web 默认交付同一个源码包，不修改 DSH 源码。

支持工具调用的模型共用原生 `web_search` 和 `web_fetch`。搜索由本插件注册的 `easywork` provider 使用当前 EasyWork JWT 调用 `POST /api/search`；Exa/Tavily 等搜索 Key 保留在服务端，不由 `/api/models` 下发，也不读取同步插件的凭据。未登录时返回 `WEB_AUTH_REQUIRED`；服务 401 使当前账号失效，临时服务失败保留登录状态。退出或账号变更中止在途搜索，搜索结果只保留可引用的公开字段。

网页访问同样使用 `easywork` provider，以当前 JWT 调用 `POST /api/fetch`，由 ask-service 使用服务端 Exa Key 请求 `/contents`。不从本机直接访问目标网页，不依赖同步插件或官方云服务。服务端优先选择标为当前的 Exa 配置，否则使用首个 Exa 配置；没有 Exa 时明确报错，不回退本机抓取。接口返回 `{url,content,truncated}`，正文最多 100,000 个字符；原生工具结果明确标注 Exa 提取内容可能来自缓存，`statusCode: 200` 表示提取成功，源站 HTTP 状态未知。需要登录的页面不携带浏览器登录态。

共享 Profile 停用官方搜索与本地 HTTP provider，将搜索、抓取均固定为 `easywork`。个人 Profile 不应残留 `multi` 或 `http` 的路由覆盖。部署时需先更新 ask-service 的 `/api/fetch` 接口，再使用对应客户端；旧服务明确返回“尚未启用网页提取接口”，不会注销账号。

开发检查：`corepack pnpm --filter easywork-plugin-models typecheck` 与 `corepack pnpm --filter easywork-plugin-models test`。测试使用模拟认证、模型目录和三种原生协议流，不调用付费模型。源码检查、模拟界面、真实服务登录、真实模型调用及打包 GUI 验收分别判定；普通修改不执行应用构建或运行时准备。
