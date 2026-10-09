import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const require=createRequire(join(root,'../../packages/plugins/skills/package.json'));
export const yaml=require('yaml');
const customTags=[{tag:'tag:yaml.org,2002:js',resolve:value=>value}];
export function parseOfficialPatch(source){
 const document=yaml.parseDocument(source,{customTags});
 if(document.errors.length)throw new AggregateError(document.errors,'Invalid official/profile patch');
 if(!yaml.isSeq(document.contents))throw Error('A Cordis patch must be a sequence');
 return document;
}
// toJSON() alone loses !!js; a quoted expression without the tag must never
// pass parity as if Loader could evaluate the official condition/config.
export function patchSemantics(document){
 function semantic(node){
  if(yaml.isSeq(node))return {tag:node.tag,items:node.items.map(semantic)};
  if(yaml.isMap(node))return {tag:node.tag,items:node.items.map(pair=>[semantic(pair.key),semantic(pair.value)])};
  if(yaml.isScalar(node))return {tag:node.tag,value:node.value};
  return node;
 }
 return semantic(document.contents);
}

/** Resolve declared dependency edges, including pnpm's shortened Windows store paths. */
export async function resolveLockedOfficialPackage(name,version,anchors){
 for(const anchor of anchors){
  let path;
  try{path=createRequire(anchor).resolve(name+'/package.json')}
  catch(error){if(error.code==='MODULE_NOT_FOUND')continue;throw error}
  const manifest=JSON.parse(await readFile(path,'utf8'));
  if(manifest.name!==name||manifest.version!==version)throw Error('Official package identity/version mismatch: '+name);
  return {path,manifest};
 }
 throw Error('Install the locked official package first: '+name+'@'+version);
}

/** Read the locked published base/Web composition; never a second UI list. */
export async function officialWebClients(){
 const project=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
 const version=project.pnpm.overrides['@deepseek-ai/dsh'];
 if(typeof version!=='string'||!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[\w.]+)?$/.test(version))throw Error('Pin the official DSH release exactly');
 for(const name of ['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app'])if(project.pnpm.overrides[name]!==version)throw Error('Official base/Web version must match the locked DSH release: '+name);
 const anchors=[join(root,'package.json')];
 const dsh=await resolveLockedOfficialPackage('@deepseek-ai/dsh',version,anchors);
 anchors.push(dsh.path);
 const cache=new Map();
 async function packageManifest(name){
  if(cache.has(name))return cache.get(name);
  const located=await resolveLockedOfficialPackage(name,version,anchors);
  cache.set(name,located);anchors.push(located.path);return located;
 }
 const sources=[],rows=new Map();
 for(const name of ['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']){
  const {path}=await packageManifest(name);
  const source=await readFile(join(dirname(path),'cordis.patch.yml'),'utf8');
  sources.push({package:name,file:'cordis.patch.yml',sha256:createHash('sha256').update(source).digest('hex')});
  const document=parseOfficialPatch(source);
  for(const operation of document.contents.items){
   const insert=operation.get('insert',true);
   if(yaml.isSeq(insert))for(const node of insert.items){
    const row=node.toJSON();
    if(typeof row.id!=='string'||typeof row.name!=='string')throw Error('Official insert lacks id/name');
    rows.set(row.id,{node,row,source:name+'/cordis.patch.yml'});
   }
   else if(typeof operation.get('id')==='string'){
    const current=rows.get(operation.get('id'));
    if(current){
     const overlay=operation.toJSON();
     for(const [key,value] of Object.entries(overlay))if(key!=='id'){
      current.row[key]=value;current.node.set(key,operation.get(key,true).clone());
     }
    }
   }
  }
 }
 const clients=[];
 for(const {node,row,source} of rows.values()){
  // Loader mounts subpaths as Host-only providers; only exact package rows
  // advertise dsh.client to the official ClientModules registry.
  if(!/^@deepseek-ai\/dsh(?:-[^/]+)?$/.test(row.name))continue;
  const {manifest,path}=await packageManifest(row.name);
  const declaration=manifest.dsh?.client;
  if(!declaration||declaration.platform!=='web')continue;
  if(!manifest.exports?.['./client'])throw Error('Official client has no public client export: '+row.name);
  clients.push({id:row.id,package:row.name,version,source,row,node,path,declaration,
   conditional:row.disabled!==undefined,
  });
 }
 const names=new Set(clients.map(client=>client.package));
 if(names.size!==clients.length)throw Error('Official composition contains duplicate client packages');
 return {version,sources,clients};
}
