# EasyWork 账号与模型

Desktop 和 Web 共用此 Profile 插件，连接 `https://ask.vigoai.cn`。在设置的“账号与模型”中登录邮箱和密码后，使用服务下发的聊天模型；支持按名称/厂商搜索、档位分组、价格倍率与能力展示。输入框和 `/model` 通过官方 Session Controller 切换同一份模型选择，思考参数按服务公布的字段和值显示并随会话保存。

新用户选择“使用邀请码注册”，填写邮箱、至少 8 个字符的密码、确认密码及有效的一次性邀请码；注册成功后自动登录并加载模型。邀请码区分大小写，忽略首尾空白，由 ask-service 校验与核销。无效或已使用的邀请码会提示检查；邮箱已注册时可返回登录。注册失败后可重新填写并提交，不会自动重复注册。管理员在 ask-service 中生成邀请码，本插件不提供发码入口。

模型菜单采用独立浮层，按窗口边缘定位并在内部滚动，避免输入框或聊天区横向移位。厂商标识使用本地 SVG，能力通过带说明的图标呈现；完整名称、上下文等信息保留在提示中。思考参数使用分段切换按钮，选中项高亮，待服务确认时禁用；按钮沿用服务声明的原始值。图标来源及许可见 `THIRD_PARTY_NOTICES.md`。`corepack pnpm --filter easywork-plugin-models test:ui` 用真实浏览器检查桌面、窄分栏、明暗主题和小窗口下的布局与交互。

EasyWork 默认在服务声明的可选值内开启思考并请求可显示的思考摘要：Gemini 选择 `includeThoughts=true`，Claude 选择 `thinking.display=summarized`，MiniMax 选择 `reasoning_split=true`。原默认关闭的推理开关优先使用可选的自适应或开启；`none`、`off`、`minimal` 强度默认改用最低可选的有效思考档位，已开启的强度保持原值。未声明这些能力时保留服务默认，不添加额外参数。服务目录中的 `default` 仍是上游默认，产品偏好由共享 `defaultControls` 统一选择，Desktop、Web、模型菜单与实际请求保持一致。

关闭和隐藏选项仍可手动选择并随会话保存。已有会话或全局配置中保存的完整思考参数保持原值，不自动覆盖；重新选择模型即可应用新的产品默认。未保存思考参数时自动使用新默认。实际思考文字由模型服务返回；开启显示表示请求摘要，不能保证每次请求都有摘要，也不会把签名或用量当成思考文字。

Host 调用 `/api/auth/register`、`/api/auth/login`、`/api/auth/me`、`/api/auth/logout` 和 `/api/models`；注册请求为 `{email,password,inviteCode}`，确认密码仅在界面校验。JWT 只进入官方 credential grant record，浏览器仅接收脱敏状态。密码和邀请码仅用于本次请求，不保存，提交后清空对应输入框。注册与登录共用会话保存和撤销流程。退出、过期和服务 401 撤销本插件的 JWT、目录及在途调用；为保证跨进程条件更新，已退出记录保留不含秘密的标记。暂时断网保留凭据，目录失败可以重试。当前服务不提供刷新令牌接口。登录授权远程模型服务，不迁移或删除本地 Home、会话、文件和其他插件数据。

`ModelAdapter` 使用发布的 `@deepseek-ai/dsh-llm-pi-ai` 与公开 pi-ai provider/payload API，支持 OpenAI Chat Completions、Anthropic Messages、Gemini GenerateContent。工具、图片、流式事件和回放转换由官方适配器拥有；每次调用固定账号、模型及完整思考参数。目录只声明输入能力与上下文，缺失容量使用明确的 32K 保守估计，不推断厂商名称。服务未声明输出上限时不设置会话请求默认上限。多维思考参数编码为官方 opaque reasoningEffort；调用适配器前验证并解码，库侧不接收这个自有值。

`cordis.patch.yml` 是账号/模型替换的权威清单：停用对应官方提供方、账号控制器和三个 UI 插件，保留官方 Host、凭据、Session、设置外壳和其他客户端。完整上游清单保持只读参考。Desktop/Web 默认交付同一个源码包，不修改 DSH 源码。

支持工具调用的模型共用原生 `web_search` 和 `web_fetch`。搜索由本插件注册的 `easywork` provider 使用当前 EasyWork JWT 调用 `POST /api/search`；Exa/Tavily 等搜索 Key 保留在服务端，不由 `/api/models` 下发，也不读取同步插件的凭据。未登录时返回 `WEB_AUTH_REQUIRED`；服务 401 使当前账号失效，临时服务失败保留登录状态。退出或账号变更中止在途搜索，搜索结果只保留可引用的公开字段。

网页访问同样使用 `easywork` provider，以当前 JWT 调用 `POST /api/fetch`，由 ask-service 使用服务端 Exa Key 请求 `/contents`。不从本机直接访问目标网页，不依赖同步插件或官方云服务。服务端优先选择标为当前的 Exa 配置，否则使用首个 Exa 配置；没有 Exa 时明确报错，不回退本机抓取。接口返回 `{url,content,truncated}`，正文最多 100,000 个字符；原生工具结果明确标注 Exa 提取内容可能来自缓存，`statusCode: 200` 表示提取成功，源站 HTTP 状态未知。需要登录的页面不携带浏览器登录态。

共享 Profile 停用官方搜索与本地 HTTP provider，将搜索、抓取均固定为 `easywork`。个人 Profile 不应残留 `multi` 或 `http` 的路由覆盖。部署时需先更新 ask-service 的 `/api/fetch` 接口，再使用对应客户端；旧服务明确返回“尚未启用网页提取接口”，不会注销账号。

开发检查：`corepack pnpm --filter easywork-plugin-models typecheck` 与 `corepack pnpm --filter easywork-plugin-models test`。`test:ui` 还验证注册表单、密码确认、邀请码必填、失败重试、自动登录与退出。测试使用模拟认证、模型目录和三种原生协议流，不调用付费模型。源码检查、模拟界面、真实服务登录、真实模型调用及打包 GUI 验收分别判定；普通修改不执行应用构建或运行时准备。
