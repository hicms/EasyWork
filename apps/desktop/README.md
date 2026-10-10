# EasyWork Desktop carrier

[中文](README.zh.md)

This package builds the Electron application and contains one bundled personal runtime Profile. Official DeepSeek Harness owns the Host, full Web Client and core execution; EasyWork feature packages supply shared experts, Skills, Library and MCP/connectors. These are the default owned feature boundary, not a promise that every definition or MCP service is preinstalled. The current Desktop supports a personal workspace only.

## Personal workspace

Opening the app prepares and starts the existing personal Home/Profile automatically, without a mode picker or enterprise login. Keep the full official settings, model configuration, plugin manager, sidebar, and right panel. Personal data and explicitly installed plugins remain in the writable Profile.

The main window loads the packaged official page before the local Host is ready and continues in that same document. Closing the window hides it while preserving background tasks, sessions, drafts and page state. Reopen through the Windows/Linux tray, the macOS Dock or another app launch. Application → Quit EasyWork, or Quit EasyWork in the tray, stops the Host and exits.

Desktop provides no enterprise login, account authority bridge, member spaces, or company packaging configuration. Existing historical enterprise data is neither migrated nor deleted at startup. The terminal command always uses the personal space; its optional installation, repair, and removal remain in the Tools menu.

## Development and validation

Startup diagnostics are written locally to `logs/startup.log` under the Desktop user-data directory (`%APPDATA%\EasyWork` on Windows). They record Host and plugin-loading stages, elapsed time, resource status and loading progress; while startup is pending, a waiting record is added every five seconds. Files rotate at 2 MiB with three backups. Runtime output is stored as metadata summaries; request bodies, authentication headers and conversation text are not recorded. Fatal exceptions retain a small `startup-fatal.log` metadata record in the user-data directory.

Use Node.js `^22.19.0` or `>=24` and Corepack Yarn 4.18.0. At the repository root:

```sh
corepack yarn install --immutable
cd apps/web
corepack pnpm install --frozen-lockfile
corepack pnpm build
cd ../..
node apps/desktop/scripts/pack-easywork-profile.mjs apps/web
corepack yarn dev
```

`dev` builds the carrier, prepares its pinned Profile and primary runtime, then launches Electron. The Web build runs each selected package and its dependencies once; a package's own `build` command also prepares its dependencies. Primary-runtime and Office preparation reuses identical files. Private build receipts let later runs reuse verified file pairs when their identities, sizes, modes and modification/change times match; missing or changed files are compared and repaired as needed. Receipts are not shipped or used as release integrity evidence. Python, Office, skills and the existing checksum and packaged-runtime gates remain intact. Keep graphical launch explicit. Headless verification uses:

```sh
corepack yarn typecheck
corepack yarn check:bilingual-docs
corepack yarn check:desktop-dsh-alignment
```

`corepack yarn check` is the full headless gate. `corepack yarn workspace dsh-plugin-desktop package:dir` creates an unpacked application and checks for duplicate DSH trees. Build and type checks do not establish real window, packaged-runtime or server acceptance.

Windows installer performance can be compared with `node apps/desktop/scripts/build-windows-nsis-ab.ts --label=candidate`. It builds direct-extraction and staged-copy installers from the same unpacked application without changing the repository's builder patch. Run it separately in baseline and candidate worktrees, then use `apps/desktop/scripts/run-windows-nsis-ab.ps1` with their manifests. For cold measurements, prepare one canonical VM snapshot and restore it before each variant and scenario; alternating runs on a warm system does not establish cold-install or upgrade performance. Keep generated manifests, measurements and screenshots in local artifact directories.

`corepack yarn release:pack` builds and packages the same commit's Web sources and the reviewed Desktop composition, preserving the clean-source release gate. The Web release directory also receives `desktop-release-manifest.json` and its hash-named archives for published Desktop packaging.

Build the five owned features and their required support packages in EasyWork first. `pack-easywork-profile.mjs` creates immutable archives and a version/hash manifest in `build/easywork-profile-release`; select another candidate with `EASYWORK_RELEASE_DIRECTORY`. Runtime preparation installs the official version with a portable lockfile and carries pnpm's JavaScript CLI for explicit plugin operations. It rejects additional default feature packages and verifies the real plugin manager exposes exactly five EasyWork bundles. The same Profile preserves the pinned SkillHub 0.2.16 and dshmarket 1.66.8 catalog integrations. Their catalog entries are not all installed or reviewed by EasyWork. It does not package a live user's configuration or credentials.

The release Profile uses pnpm `nodeLinker: hoisted`: Windows installer archives expand dependency links into repeated files, so both preparation and `afterPack` reject virtual package stores or linked package directories. Nested official dependencies still undergo the exact DSH version gate. Packaging excludes dependency source maps, type declarations and PDB debug files, while retaining runtime binaries, Office assets, skills and licenses. This changes only the bundled release layout; the root Yarn workspace and Web pnpm workspace keep their own settings. To prepare an isolated Profile candidate, set `EASYWORK_RUNTIME_DIRECTORY` to a dedicated directory inside `apps/desktop/build`; the packaging pipeline continues to use `build/easywork-runtime`.

Product-owned packages, development variables, data directories and storage keys use `easywork-*`, `EASYWORK_*` and EasyWork. The carrier uses the `easywork` Profile without aliases, fallback paths or migration of retired product data. `corepack yarn check:naming` rejects retired names in source and file paths without exceptions.

Web and Desktop Profile packaging also checks names inside the compressed plugin archives and release metadata. Desktop `afterPack` starts an isolated, headless runtime to inspect the actual native Skill commands and MCP tool schemas. Run `node apps/desktop/scripts/verify-runtime-product-names.mjs <runtime-directory>` from the repository root to repeat that check for a prepared or packaged runtime; it does not open a window or send model requests.

The Desktop pin and shared product target are **DSH 0.2.0-rc.2**, selected explicitly by the user. The unmodified official `dsh-v0.2.0-rc.2` tag pins commit `639ed015397290b3745d163aafe02ffee4aa3f84`. Existing installed applications and Profiles have their own actual versions. Desktop alignment, Desktop checks and packaged-runtime acceptance must pass before declaring the unified upgrade complete; Web Docker evidence cannot replace those gates. Prefer validated official stable releases by default.

Builds consume only published official packages and checksum-locked binary artifacts. The carrier source and packaging scripts live here; feature package source belongs to EasyWork, and apps/web owns Web launch and deployment. See [Desktop ownership](../../docs/desktop-boundaries.md).
