import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { RELEASE_PACKAGES, PACKAGE_DIRECTORIES } from '../apps/desktop/scripts/workdsh-package-boundary.mjs';
const root=resolve(import.meta.dirname,'..');
const fail=message=>{throw new Error('delivery-paths: '+message)};
for(const name of RELEASE_PACKAGES){
 const directory=resolve(root,'apps/web',PACKAGE_DIRECTORIES[name]);
 if(!existsSync(resolve(directory,'package.json')))fail('missing package directory '+name);
 const pkg=JSON.parse(readFileSync(resolve(directory,'package.json'),'utf8'));
 for(const [peer] of Object.entries(pkg.peerDependencies??{})){
  if(peer.startsWith('workdsh-')&&!pkg.peerDependenciesMeta?.[peer]?.optional&&!RELEASE_PACKAGES.includes(peer))fail(name+' requires unshipped '+peer);
 }
}
const files=execFileSync('git',['ls-files','--','apps','scripts','.github'],{cwd:root,encoding:'utf8'}).trim().split('\n');
for(const file of files){
 if(!/\.(?:mjs|ts|json|ya?ml)$/.test(file)||!existsSync(resolve(root,file)))continue;
 const text=readFileSync(resolve(root,file),'utf8');
 if(/(?:\.\.?\/|\b)dsh-plugin-desktop\/(?:scripts|src|tests|build)/.test(text))fail(file+' uses retired Desktop directory');
}
const ci=readFileSync(resolve(root,'.github/workflows/ci.yml'),'utf8');
if(!ci.includes("^(apps/web/|packages/|profiles/)"))fail('shared package changes must trigger Web CI');
for(const name of ['workdsh-provider-identity-enterprise','workdsh-plugin-enterprise-collaboration']){
 if(!ci.includes(`pnpm --filter ${name} build`)||!ci.includes(`pnpm --filter ${name} typecheck`))fail('Web CI must build and typecheck '+name);
}
console.log('Verified delivery directories, owned dependency closure and shared CI coverage');
