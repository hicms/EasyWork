import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const [snapshotArg,profileArg,outputArg]=process.argv.slice(2);
assert.ok(snapshotArg&&profileArg&&outputArg);
const snapshot=resolve(snapshotArg),profile=resolve(profileArg),output=resolve(outputArg);
const hash=x=>createHash('sha256').update(x).digest('hex');
const manifest=JSON.parse(await readFile(join(snapshot,'manifest.json'),'utf8'));
const records=manifest.records.filter(r=>r.group==='home'&&r.relative.startsWith('sessions/'));
for(const r of records)assert.equal(hash(await readFile(join(snapshot,'snapshot/home',r.relative))),r.sha256);
const req=createRequire(join(profile,'package.json'));
const {Context}=await import(req.resolve('@deepseek-ai/cordis'));
const {default:Persistence}=await import(req.resolve('@deepseek-ai/dsh-session-persistence-jsonl'));
const ctx=new Context();const fiber=ctx.plugin(Persistence,{root:join(snapshot,'snapshot/home/sessions')});await fiber.await();
const failures=[];let readable=0;
try{for(const row of await ctx.sessionPersistence.list()){
 let h;try{h=await ctx.sessionPersistence.open(row.header.id,'read');await h.read();readable++;}
 catch(e){let c=e;const chain=[];for(let i=0;c&&i<5;i++,c=c.cause){chain.push({name:c.name,messageKeys:Object.keys(c),legacyCostMeterMention:/cost[-/]?meter|cost_meter/i.test(String(c.message)),refusalReason:String(c.message).split('(raw log:')[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,'[session-id]').slice(0,320),formatMention:/format|version|event/i.test(String(c.message))});}
 failures.push({fingerprint:hash(row.header.id),chain});}finally{await h?.close();}
}}finally{await fiber.dispose();}
for(const r of records)assert.equal(hash(await readFile(join(snapshot,'snapshot/home',r.relative))),r.sha256);
await mkdir(output,{recursive:true});const proof={readable,failures,snapshotSessionBytesUnchanged:true,originalHomeAccessed:false,modelCalls:0};await writeFile(join(output,'legacy-errors.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
