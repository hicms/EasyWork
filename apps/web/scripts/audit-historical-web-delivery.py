"""Read-only audit of retained alpha.13 assets; never installs or rewrites them."""
import hashlib
import json
import pathlib
import re
import tarfile

root = pathlib.Path(__file__).resolve().parents[1]
release = root / '.artifacts/project-v0.1.0-alpha.13'
manifest_path = release / 'release-manifest.json'
manifest = json.loads(manifest_path.read_text())
installer = (release / 'install-workdsh.mjs').read_text()
block = re.search(r'const installOrder = \[([\s\S]*?)\];', installer)
assert block, 'Historical installer order missing'
defaults = re.findall(r"'([^']+)'", block[1])
assert len(defaults) == len(set(defaults))
external = {'workdsh-provider-identity-enterprise', 'workdsh-plugin-enterprise-collaboration', 'workdsh-plugin-enterprise-orders'}
rows = []
for item in manifest['../../packages']:
    filename = item['filename']
    assert pathlib.Path(filename).name == filename
    path = release / filename
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    assert digest == item['sha256'], filename
    assert path.stat().st_size == item['bytes'], filename
    with tarfile.open(path, 'r:gz') as archive:
        members = archive.getmembers()
        assert all(m.name.startswith('package/') and '..' not in pathlib.PurePosixPath(m.name).parts for m in members)
        package = json.loads(archive.extractfile('package/package.json').read())
        assert package['name'] == item['name'] and package['version'] == item['version']
        dependencies = {name for field in ('dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies') for name in package.get(field, {}) if name.startswith('workdsh-')}
        assert not dependencies & external, (filename, dependencies & external)
        scanned = 0
        for member in members:
            if member.isfile() and member.name.endswith(('.js', '.mjs', '.cjs', '.yaml', '.yml')):
                content = archive.extractfile(member).read()
                assert not any(name.encode() in content for name in external), member.name
                scanned += 1
        rows.append({'name': item['name'], 'sha256': digest, 'ownedDependencies': sorted(dependencies), 'runtimeFilesScanned': scanned})
assert set(defaults) <= {row['name'] for row in rows}
optional = ['workdsh-plugin-office', 'workdsh-plugin-projects', 'workdsh-plugin-activity']
proof = {'scope': 'Retained local alpha.13 assets only; no remote release, Desktop or runtime compatibility claim',
         'manifestSha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
         'installerSha256': hashlib.sha256((release / 'install-workdsh.mjs').read_bytes()).hexdigest(),
         '../../packages': rows, 'historicalDefaultPackages': defaults,
         'enterprisePackageIdentifiersAbsent': True,
         'currentOptionalFeaturesInstalledByHistoricalDefault': [name for name in optional if name in defaults],
         'alignedWithCurrentDefaultPolicy': not any(name in defaults for name in optional),
         'historicalAssetsModified': False, 'historicalRuntimeExecuted': False}
output = root / '.artifacts/plugin-delivery/historical-alpha13-audit.json'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps({'archivesVerified': len(rows), 'enterprisePackageIdentifiersAbsent': True,
                  'alignedWithCurrentDefaultPolicy': proof['alignedWithCurrentDefaultPolicy']}))
