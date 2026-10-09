import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
export const root=new URL('../',import.meta.url).pathname;
export async function readOwnedManifests(base=root){
const directories=['../../packages/bundle','../../packages/contracts','../../packages/ui'];
for(const group of ['plugins','providers'])for(const entry of await readdir(join(base,'../../packages',group),{withFileTypes:true}))if(entry.isDirectory())directories.push('../../packages/'+group+'/'+entry.name);
const manifests=new Map();
for(const directory of directories){try{const manifest=JSON.parse(await readFile(join(base,directory,'package.json'),'utf8'));manifests.set(manifest.name,{manifest,directory});}catch(error){if(error.code!=='ENOENT')throw error;}}
return manifests;
}
export const defaults=['workdsh-provider-identity-local','workdsh-provider-browser-session','workdsh-plugin-audit','workdsh-plugin-access','workdsh-plugin-skills','workdsh-plugin-experts','workdsh-plugin-connectors','workdsh-plugin-library','workdsh-bundle'];
const allowed=new Set([...defaults,'workdsh-contracts','workdsh-ui','workdsh-plugin-workbench']);
export async function auditDefaultPluginDelivery(){
const manifests=await readOwnedManifests();
const installer=await readFile(join(root,'scripts/install-project-release.mjs'),'utf8');
const block=installer.match(/const defaultInstallOrder = \[([\s\S]*?)\];/)[1];
assert.deepEqual([...block.matchAll(/'([^']+)'/g)].map(match=>match[1]),defaults);
const packer=await readFile(join(root,'scripts/pack-project-release.mjs'),'utf8');
const packedDefaults=packer.match(/defaultPackages:\s*\[([^\]]+)\]/);
assert.ok(packedDefaults,'Release packer must declare the default installation policy');
assert.deepEqual([...packedDefaults[1].matchAll(/'([^']+)'/g)].map(match=>match[1]),defaults);
const packedOptional=packer.match(/optionalPackages:\s*\[([^\]]+)\]/);
assert.ok(packedOptional,'Release packer must declare optional packages');
assert.deepEqual([...packedOptional[1].matchAll(/'([^']+)'/g)].map(match=>match[1]),['workdsh-plugin-office','workdsh-plugin-projects','workdsh-plugin-activity']);
const {visited,edges}=assertDefaultOwnedClosure(manifests);
const proof={scope:'Unreleased Web personal installer/source package closure; not Desktop or published artifacts',defaultPackages:defaults,
 ownedClosure:[...visited].sort(),edges,externalEnterprisePackagesAbsent:true,
 optionalPersonalFeatures:['office','projects','activity'],developmentPreview:'Explicit full development composition retained',
 publishedReleaseArtifactsAudited:false,cleanInstalledProfileVerified:false};
return proof;
}

export function assertDefaultOwnedClosure(manifests){
const visited=new Set(), edges=[];
const visit=name=>{
 if(visited.has(name))return;visited.add(name);
 const row=manifests.get(name);assert.ok(row,'Owned package must have a manifest: '+name);
 // Also inspect build dependencies: bundled Client code can carry workspace-only modules.
 for(const field of ['dependencies','optionalDependencies','peerDependencies','devDependencies'])for(const dependency of Object.keys(row.manifest[field]??{})){
  if(!dependency.startsWith('workdsh-'))continue;
  assert.ok(allowed.has(dependency),'Default package closure contains an external feature: '+name+' -> '+dependency);
  edges.push({from:name,to:dependency,field});visit(dependency);
 }
};
for(const name of defaults)visit(name);
return {visited,edges};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
const proof=await auditDefaultPluginDelivery();
await mkdir(join(root,'.artifacts/plugin-delivery'),{recursive:true});
await writeFile(join(root,'.artifacts/plugin-delivery/source-audit.json'),JSON.stringify(proof,null,2));
console.log(JSON.stringify({defaultPackages:defaults.length,ownedClosure:proof.ownedClosure.length,externalEnterprisePackagesAbsent:true}));
}
