# EasyWork repository rules

This repository owns EasyWork Web and Desktop. Desktop and Web consume the same exact official DSH published package version. Desktop binary dependencies and command-management helpers are extracted from checksum-locked official release installers.

## Git branch and release policy

- Keep exactly one long-lived product branch: the GitHub default branch, currently `main`. Do not maintain `main` and `master` as parallel product or release lines.
- Development and migration branches are temporary.
- Create Desktop release tags and publish product artifacts only from commits reachable from the default branch. A successful build on a temporary branch is validation, not a release.
- After a temporary branch has been merged and its changes verified on the default branch, delete that temporary branch. Retain an unmerged branch only while its work is still under review; do not delete unique history.
- If the default branch is renamed, update GitHub settings, CI, website deployment, release triggers, and documentation together before removing the old branch.

## Prerequisites and setup

- Use Node.js `^22.19.0` or `>=24.0.0` and the root Yarn `4.18.0` release through Corepack.
- Install root dependencies with `corepack yarn install --immutable`.

## Build, run, and verify

- The commands below document available workflows; they are not authorization to run every workflow for each task. Follow the local validation and artifact policy below before executing them.
- Start the desktop development workflow with `corepack yarn dev`.
- Build the desktop package with `corepack yarn build`.
- Run type checking with `corepack yarn typecheck`.
- Run the complete headless gate with `corepack yarn check`.
- `apps/desktop/` is the only Desktop source and release workspace. Do not reintroduce a copied Beta package; optional release channels must build from this same source and pinned DSH version.
- The official release version locked in `upstream.json` is the single DSH version for the packaged EasyWork Profile. Desktop source is an Electron carrier without direct DSH dependencies. A DSH upgrade is incomplete until `corepack yarn check:desktop-dsh-alignment`, the Desktop checks, and a packaged-runtime check pass. Default to the newest official stable DSH release after compatibility validation; use a pre-release only by explicit product decision. Do not tag a Desktop release while the version gate fails. The carrier must contain no second DSH installation.
- `apps/web/` owns Web launch, deployment and verification. Root `packages/` owns shared EasyWork feature packages, and root `profiles/` owns composition. Its package manifests must declare the same exact DSH version as `upstream.json`; run `corepack yarn check:web-dsh-alignment` when either side changes. The Web workspace remains self-contained and does not import or modify the official source tree.

- `apps/desktop/` owns the Electron carrier, packaging, and release verification. DSH Host and Client code comes from the published official runtime Profile; EasyWork features belong to the EasyWork Profile packages.
- The Desktop workspace uses the root Yarn release with `nodeLinker: node-modules`. The nested `apps/web/` workspace retains its own pinned pnpm lockfile and package manager; run its commands from that directory. Do not install it into the root Yarn workspace.
- Keep presentation and EasyWork feature changes in the Profile rather than adding a second Desktop Host or Client implementation.
- Skills, experts, library, connectors and projects are maintained directly in `packages/plugins/` in this repository. Desktop and Web build these same sources and package local default versions with the application.
- Keep graphical application launch explicit. Builds, typechecks, and Loader smokes must remain headless-safe.

## Local validation and generated artifacts

- For ordinary edits, documentation, diagnosis and reviews, default to source inspection, syntax checks, type checking without emitted files and focused tests relevant to the change. Do not automatically compile the whole project, prepare runtime installations, package applications or export build artifacts.
- Full builds, Desktop/Web runtime preparation, installer/portable packaging and artifact exports require an explicit user request for that operation. A request to add or modify a build script does not authorize running a full build. A request to fix code or verify a change does not by itself authorize generating application packages.
- Inspect package scripts and test setup before running checks. Commands named `check`, `typecheck`, `test` or `dev` may indirectly build, install or copy large runtime trees. In particular, `corepack yarn check` includes a Desktop build; do not run it as the default local check. Prefer the relevant non-emitting checks. Dependency installation is also not a default validation step.
- Keep release and candidate acceptance requirements intact, but apply them only to explicitly requested release/candidate work. When a required check would perform an unauthorized build or packaging operation, report it as not run and give the command needed. Do not generate large artifacts merely to satisfy a completion checklist, and do not claim unverified runtime or UI acceptance.
- When building is explicitly requested, build only the requested platform, architecture and targets. Reuse verified dependencies and caches, prepare the shared runtime once and avoid rebuilding the same source for each output format where the packaging tool supports multiple targets. Do not generate additional installers, portable packages or platform variants for comparison without a request.
- For Windows testing, use the unpacked application directory and run its `EasyWork.exe` directly with all adjacent resources intact. An explicitly requested local test build defaults to this directory target. Do not substitute a self-extracting single-file portable EXE or automatically generate an installer; those are separate output requests.
- Keep generated outputs in designated ignored build, dist, cache or temporary directories. Do not scatter EXE, ZIP, TGZ, unpacked applications, installed dependencies or runtime copies among source directories. Do not create timestamped/UUID full-copy candidates or backup runtime trees by default, or accumulate another 1–2 GB copy on each validation run. Reuse the designated local output directory when its workflow allows it; immutable candidates are reserved for explicitly requested candidate/release work.
- A source handover/export contains source and required configuration only. Exclude dependency installations, build/dist/lib outputs, official release caches, prepared runtimes, local preview Homes, test artifacts, logs and generated archives. Do not ZIP the entire working directory; ignored files can still be included in a directory export. Use an explicit source-file allowlist, and check the exported contents and size.
- Remove task-created disposable intermediates when no longer needed, after confirming their resolved paths and ownership. Never recursively delete broad project directories or automatically remove existing user outputs, caches, personal data or installed plugins. Cleaning existing artifacts requires an explicit cleanup request. Report retained large outputs with their paths and approximate sizes.

## Personal product boundary

- Product prose uses EasyWork; owned identifiers, packages, environment variables and data keys use `easywork` or `EASYWORK`. Rename definitions and callers together. Do not retain retired product names, compatibility aliases, fallback paths or migration code for earlier product names. `corepack yarn check:naming` must pass without allowlist exceptions.
- Profile packaging must also verify names inside owned archives and release metadata. Desktop `afterPack` must verify the actual native Skill command registry and MCP tool schemas in an isolated headless runtime; source-only name checks are insufficient.
- Desktop supports personal use only and starts the existing personal Home/Profile automatically, without a mode picker. Preserve the complete official interface; never copy its settings, sidebar or right panel.
- Do not restore enterprise login, account authority bridges, member spaces, remote member processes, model injection, collaboration connections or company deployment configuration in the carrier.
- There is one personal Desktop installer. Projects are included in Desktop and Web. Independent historical enterprise extension source does not imply supported Desktop integration and must not be attached to current Desktop releases. Other business applications and notifications remain optional external plugins.
- Personal model APIs, credentials and model catalogs are configured through the official settings. Preserve existing personal data and explicitly installed plugins; do not migrate or delete old enterprise data as part of startup.
- Preserve user-facing README content and organize new material in the corresponding sections. Development logs, raw acceptance evidence, credentials and generated packages are not submission content.

- Never clone, import or compile official DSH source as part of product builds. `upstream.json` locks published package versions and Desktop archive URLs, sizes and SHA-512 hashes. Extract only runtime dependencies, Office assets and prebuilt command helpers; do not carry a second official Electron application or DSH installation.

## Delivery regression gate

- Directory migrations must update scripts, CI working directories, test globs and deployment contexts together. Source-only moves are incomplete.
- Required plugin delivery must pass composition, archive dependency closure, installed runtime and actual UI checks. Builds alone are not acceptance.
- Shared feature changes must trigger Desktop and Web CI. Personal composition must not activate historical enterprise account or collaboration packages.
- Explicitly requested candidate handover requires actual packaged Desktop operation results and actual UI acceptance. This does not require packaging for ordinary local edits. Report missing acceptance explicitly; never call a candidate complete while required plugins or entries are missing.
