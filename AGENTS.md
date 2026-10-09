# EasyWork repository rules

This repository owns EasyWork Web and Desktop. Desktop and Web consume the same exact official DSH published package version. Desktop binary dependencies and command-management helpers are extracted from checksum-locked official release installers.

## Git branch and release policy

- Keep exactly one long-lived product branch: the GitHub default branch, currently `main`. Do not maintain `main` and `master` as parallel product or release lines.
- Development and migration branches are temporary. Bring every accepted change back to the default branch through a reviewed pull request; verify required checks and that the intended commits are present there before treating the work as delivered.
- Create Desktop release tags and publish product artifacts only from commits reachable from the default branch. A successful build on a temporary branch is validation, not a release.
- After a temporary branch has been merged and its changes verified on the default branch, delete that temporary branch. Retain an unmerged branch only while its work is still under review; do not delete unique history.
- If the default branch is renamed, update GitHub settings, CI, website deployment, release triggers, and documentation together before removing the old branch.

## Prerequisites and setup

- Use Node.js `^22.19.0` or `>=24.0.0` and the root Yarn `4.18.0` release through Corepack.
- Install root dependencies with `corepack yarn install --immutable`.

## Build, run, and verify

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
- Keep graphical application launch explicit. Builds, typechecks, and Loader smokes must remain headless-safe.

## Personal product boundary

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
- Candidate handover requires actual packaged Desktop operation results and actual UI acceptance. Report missing acceptance explicitly; never call a candidate complete while required plugins or entries are missing.
