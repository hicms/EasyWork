import {createHash} from 'node:crypto';
/** Build one external delivery archive; never add it to the base Desktop manifest. */
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {execFileSync} from 'node:child_process';
const source=resolve(import.meta.dirname,'../../../packages/enterprise-connection');
const output=resolve(process.argv[2]??'/private/tmp/workdsh-enterprise-delivery');mkdirSync(output,{recursive:true});
const stage=mkdtempSync(join(tmpdir(),'enterprise-delivery-'));cpSync(source,stage,{recursive:true,filter:p=>!p.includes('/node_modules')});
const packages={'workdsh-provider-identity-enterprise':'../../../packages/providers/identity-enterprise','workdsh-plugin-enterprise-collaboration':'../../../packages/plugins/enterprise-collaboration'};
for(const [name,path] of Object.entries(packages)){
 execFileSync('corepack',['pnpm','--filter',name,'build'],{cwd:resolve(import.meta.dirname,'..'),stdio:'pipe'});
 const directory=resolve(import.meta.dirname,path);const pkg=JSON.parse(readFileSync(join(directory,'package.json'),'utf8'));
 execFileSync('corepack',['pnpm','--filter',name,'exec','pnpm','pack','--pack-destination',stage],{cwd:resolve(import.meta.dirname,'..'),stdio:'pipe'});
 const target=join(stage,'node_modules',name);mkdirSync(target,{recursive:true});
 execFileSync('tar',['-xzf',join(stage,name+'-'+pkg.version+'.tgz'),'--strip-components=1','-C',target]);
}
const browser=readFileSync(resolve(import.meta.dirname,packages['workdsh-provider-identity-enterprise'],'dist/client.browser.js'),'utf8');
writeFileSync(join(stage,'client.browser.js'),browser.replace('id: "workdsh-provider-identity-enterprise"','id: "workdsh-enterprise-connection"'));
writeFileSync(join(stage,'pnpm-workspace.yaml'),'nodeLinker: hoisted\n');
execFileSync('corepack',['pnpm','pack','--pack-destination',output],{cwd:stage,stdio:'inherit'});

const pkg=JSON.parse(readFileSync(join(source,'package.json'),'utf8'));
const filename=pkg.name+'-'+pkg.version+'.tgz';const archive=readFileSync(join(output,filename));
const metadata={kind:'workdsh-enterprise-plugin',name:pkg.name,version:pkg.version,dshVersion:pkg.peerDependencies['@deepseek-ai/dsh'],sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim(),filename,bytes:archive.length,sha256:createHash('sha256').update(archive).digest('hex'),components:pkg.dependencies};
writeFileSync(join(output,'enterprise-plugin-manifest.json'),JSON.stringify(metadata,null,2)+'\n');
