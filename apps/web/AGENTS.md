# EasyWork Web repository rules

This independent pnpm workspace owns EasyWork feature packages and Web composition inside the combined Desktop repository. Use Node.js `^22.19.0 || >=24.0.0` and Corepack `pnpm@10.34.5`. The Desktop carrier uses the root Yarn workspace; never merge the package-manager graphs.

## Runtime and ownership

- Pin official DSH dependencies and required peers to the product target `0.2.0-rc.2`, with Cordis `4.0.4`. Web consumes published official packages. Never edit upstream DSH or require its checkout for a Web build.
- Personal Web, enterprise Web and Desktop share official runtime targets, owned feature packages, business services and pages. Identity, storage, execution and synchronization vary only at explicit adapter boundaries.
- Use official Loader/Profile/Cordis, Session/Agent loop, preset registry, Skill parser/provider, MCP transport, model routing, Remote, Storage and Conversation UI. EasyWork owns account and model presentation through the shared `packages/plugins/models` plugin and its `ModelAdapter`; its Profile patch replaces the official account/model rows. Do not introduce another Host, Client, loader or executor, or modify DSH sources.
- Feature packages own business objects, revisions, authorization and presentation. Page actions and Agent tools use the same business services. Optional cross-plugin collaboration uses public contracts and lifecycle injection, never another plugin's internal implementation.
- Official Agent Teams owns expert-team execution, messaging and task runtime. Do not restore retired EasyWork expert-team executors, shared multi-member Host implementations, runtimeToken or onboarding prototypes.

## Feature and delivery contracts

Read [requirements](docs/REQUIREMENTS.md), [architecture](docs/ARCHITECTURE.md) and the affected package README. Ownership and adapter changes follow [the feature development contract](docs/FEATURE-DEVELOPMENT-CONTRACT.md). Public interfaces follow [contracts](docs/CONTRACTS.md) and [the official extension standard](docs/HARNESS-OFFICIAL-DEVELOPMENT.md).

- Experts, library, skills and MCP/connectors are the built-in Desktop feature plugins. This does not install every expert, Skill or server definition.
- Enterprise account delivery is an explicit exception: the immutable Desktop runtime ships the account package, activates it only after enterprise login, and rejects member-local copies that shadow it. Personal defaults do not activate it; employees do not install a tgz.
- Collaboration, notifications and business applications remain external plugins with independent installation and updates. Other feature delivery follows [plugin delivery](docs/PLUGIN-DELIVERY.md) and [external plugins](docs/EXTERNAL-PLUGINS.md).
- A Profile selects configuration/plugins; it is not an account or security boundary. Enterprise member admission, data ownership, credentials, files and actual operations require server-side authorization.
- Keep one implementation and one state owner. Enterprise account composition removes personal identity, uses the actual member's credentials, and keeps account storage separate. Never package passwords, internal model keys or server service keys.
- SkillHub and dsh-market are third-party discovery sources. Browsing does not imply automatic installation, compatibility validation or approval of every directory entry.

## Implementation and lifecycle

- Plugins live at `packages/plugins/<domain>` and providers at `packages/providers/<name>`. Parent directories only categorize packages. Register new modules in `docs/modules.json`; keep planned scaffolds free of loadable DSH/package entry points or fake responses.
- The skills, experts, library, connectors and projects sources are owned by the root `packages/plugins/` directories. Build and validate these shared sources for both Desktop and Web; default plugins are packaged locally.
- Use official declared Slots and their owner props. Keep native Session/Workspace/Settings owners. Register lifecycle effects through `ctx.effect`, `ctx.on`, `ctx.slots.inject` or official managed APIs, and verify disposal.
- Published object revisions are immutable. File imports create explicit copies; uncertain external writes require result reconciliation and idempotent retry. A model's completion message cannot replace an actual receipt.
- Credentials stay outside prompts, browser state, logs, exports and source. UI filtering or plugin scope cannot replace identity and operation authorization.
- Maintain built-in Skill text in packaged `SKILL.md` and Markdown resources. TypeScript registers or generates from that source; do not keep a second prompt copy or rely on developer paths.
- Use isolated synthetic Homes for explicit runtime probes. Graphical launches and paid model/external-service probes remain explicit.

## Checks and public documentation

Run `corepack pnpm install --frozen-lockfile`, `build`, `typecheck`, `check:versions` and `check:plan`. Enterprise changes additionally build/typecheck the identity and collaboration packages.

`docs/` publishes only the finite requirements, contracts, architecture, module registry and acceptance specifications allowed by `.gitignore`. Development diaries, STATUS/PLAN ledgers, historical evidence and generated outputs remain local. [Acceptance](docs/ACCEPTANCE.md) distinguishes required scenarios from actual verified results; ignored `.artifacts` can hold local test evidence. Do not claim installed runtime, GUI or deployment acceptance from source checks alone.

Preserve existing worktree changes. User authorization controls commits, pushes, publication and external actions; do not send messages to other people without explicit authorization.
