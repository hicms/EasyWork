"""Inspect the exact local tgz candidates used by the clean personal runtime probe."""
import hashlib
import io
import json
import pathlib
import tarfile

root = pathlib.Path(__file__).resolve().parents[1]
evidence = root / '.artifacts/plugin-delivery'
runtime = json.loads((evidence / 'personal-default-runtime.json').read_text())
home = pathlib.Path(runtime['home']).resolve()
assert home.name.startswith('workdsh-personal-default-')
manifest = json.loads((home / 'artifacts/release-manifest.json').read_text())
assert manifest['installation']['defaultPackages'] == [item['name'] for item in runtime['../../packages']]
allowed = set(manifest['installation']['defaultPackages']) | {'workdsh-contracts', 'workdsh-ui', 'workdsh-plugin-workbench'}
external = ['workdsh-provider-identity-enterprise', 'workdsh-plugin-enterprise-collaboration', 'workdsh-plugin-enterprise-orders', 'workdsh-plugin-office', 'workdsh-plugin-projects', 'workdsh-plugin-activity']
rows = []
for item in runtime['../../packages']:
    path = home / 'artifacts' / item['filename']
    data = path.read_bytes()
    assert hashlib.sha256(data).hexdigest() == item['sha256'], 'Candidate changed after runtime proof'
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        members = archive.getmembers()
        assert all(member.name.startswith('package/') and '..' not in pathlib.PurePosixPath(member.name).parts for member in members)
        package = json.loads(archive.extractfile('package/package.json').read())
        assert package['name'] == item['name']
        for field in ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']:
            for name in package.get(field, {}):
                if name.startswith('workdsh-'):
                    assert name in allowed, (item['name'], field, name)
        scanned = []
        for member in members:
            if not member.isfile():
                continue
            assert '/node_modules/' not in member.name, 'Release package must not embed another dependency installation'
            if member.name.endswith(('.js', '.mjs', '.cjs', '.yml')):
                content = archive.extractfile(member).read()
                for name in external:
                    assert name.encode() not in content, (item['name'], member.name, name)
                scanned.append(member.name)
        rows.append({'name': package['name'], 'version': package['version'], 'sha256': item['sha256'], 'runtimeFilesScanned': len(scanned)})
proof = {'scope': 'Exact unreleased personal tgz candidates used by clean runtime test; not historical releases or Desktop', '../../packages': rows,
         'defaultManifestMatchesRuntimeArtifacts': True, 'externalFeaturePackageReferencesAbsent': True, 'embeddedNodeModulesAbsent': True,
         'publishedReleaseAudited': False, 'runtimeEvidence': 'personal-default-runtime.json'}
(evidence / 'artifact-audit.json').write_text(json.dumps(proof, indent=2))
print(json.dumps({'defaultCandidatePackagesAudited': len(rows), 'externalFeaturePackageReferencesAbsent': True}))
