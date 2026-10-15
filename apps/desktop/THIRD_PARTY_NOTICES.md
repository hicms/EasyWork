# Third-party notices

EasyWork Desktop contains Electron and a pinned DeepSeek Harness runtime Profile.
The official DeepSeek Harness version is recorded in the repository's
[`upstream.json`](../../upstream.json); the installed app's `easywork-runtime` directory
contains the actual Profile package manifests and applicable license files.

DeepSeek Harness is distributed under the MIT License. Its version-specific
third-party notices are maintained by the upstream project:
<https://github.com/deepseek-ai/deepseek-harness/blob/master/THIRD_PARTY_NOTICES.md>.
EasyWork bundles and their dependencies retain their own license terms, which
must be checked from the exact release artifacts used for an installer.

The Electron carrier also bundles `electron-updater` 6.8.10 and its JavaScript
runtime dependencies. Their exact versions and complete license texts are shipped
in `resources/licenses/desktop-updater-LICENSES.txt`, generated from the locked
packages during the carrier build. The signed Windows installer temporarily uses
the checksum-locked electron-builder 7-Zip toolset for checked in-place extraction.
Its complete license and LGPL text are shipped in `resources/licenses/7zip-LICENSE.txt`
and `resources/licenses/7zip-COPYING.txt`. This toolset contains unmodified 7-Zip 24.09. Its corresponding source is
available at <https://www.7-zip.org/a/7z2409-src.7z>; distribution terms are at
<https://www.7-zip.org/>.

The Desktop Profile bundles two separate third-party plugins:

- [`@cocofhu/skillhub`](https://www.npmjs.com/package/@cocofhu/skillhub)
  version 0.2.16 for SkillHub integration. Source and MIT license:
  <https://github.com/cocofhu/skillhub>.
- [`dshmarket`](https://www.npmjs.com/package/dshmarket) version 1.66.8 for
  DSH community plugin discovery. Source and MIT license:
  <https://github.com/dsh-market/dsh-market>.

The SkillHub catalog and API are maintained separately by
[`Tencent/skillhub`](https://github.com/Tencent/skillhub). The plugin catalog
used by dshmarket is maintained by
[`awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

This file intentionally does not freeze a dependency inventory from an older
DSH release. Check the bundled Profile and its license files when publishing.
