import * as React from 'react';
import { useEffect,useState } from 'react';
import { createPortal } from 'react-dom';
export interface MaterialPreview {token:string;context:string;files:{id:string;name:string;bytes:number;kind?:string}[];filePromptDiffers:boolean}
type Review={person:string;preview:MaterialPreview;settle:(files:string[]|undefined)=>void};
const listeners=new Set<(value:Review|undefined)=>void>();
let pending:Review|undefined;
export function reviewMaterials(person:string,preview:MaterialPreview):Promise<string[]> {
 if(pending)throw new Error('已有待确认分享，请先处理');
 return new Promise((resolve,reject)=>{
  pending={person,preview,settle:files=>{pending=undefined;listeners.forEach(listener=>listener(undefined));if(files)resolve(files);else reject(new Error('已取消分享，未发送'));}};
  listeners.forEach(listener=>listener(pending));
 });
}
export function cancelMaterialReview(){pending?.settle(undefined);}
export function MaterialReview(){
 const [review,setReview]=useState<Review|undefined>(pending);
 const [selected,setSelected]=useState<string[]>([]);
 useEffect(()=>{const listen=(value:Review|undefined)=>{setReview(value);setSelected(value?.preview.files.map(file=>file.id)||[]);};listeners.add(listen);return()=>{listeners.delete(listen);};},[]);
 if(!review)return null;
 return createPortal(<div onClick={event=>event.stopPropagation()} onPointerDown={event=>event.stopPropagation()} style={{position:'fixed',inset:0,zIndex:2000,background:'var(--dsw-alias-bg-mask-2)',display:'grid',placeItems:'center'}}>
 <section role="dialog" aria-modal="true" aria-label="确认共享材料" style={{width:'min(680px,94vw)',maxHeight:'85vh',overflow:'auto',padding:24,borderRadius:12,border:'1px solid var(--dsw-alias-border-l2)',background:'var(--dsw-alias-bg-layer-2)',color:'var(--dsw-alias-label-primary)',font:'14px system-ui'}}>
 <h2 style={{fontSize:20,marginTop:0}}>分享给 {review.person}</h2>
 <p>共享本次提问、分析结果和勾选的资料和成果。其他会话内容不会共享。</p>
 <details><summary>查看将共享的提问与分析</summary><pre style={{whiteSpace:'pre-wrap',maxHeight:260,overflow:'auto'}}>{review.preview.context}</pre></details>
 <h3 style={{fontSize:15}}>文件</h3>
 {review.preview.filePromptDiffers&&<p>以下文件来自本会话较早的上传，请核对是否属于本次分析。</p>}
 {review.preview.files.length?review.preview.files.map(file=><label key={file.id} style={{display:'block',margin:'12px 0'}}><input type="checkbox" checked={selected.includes(file.id)} onChange={event=>setSelected(old=>event.target.checked?[...old,file.id]:old.filter(id=>id!==file.id))}/> {file.kind||'原始资料'} · {file.name} · {(file.bytes/1024).toFixed(1)} KB</label>):<p>本会话没有可识别的上传原文件，只共享提问和分析结果。</p>}
 <div style={{display:'flex',justifyContent:'flex-end',gap:12,marginTop:24}}><button onClick={()=>review.settle(undefined)}>取消</button><button onClick={()=>review.settle(selected)}>分享</button></div>
 </section></div>,document.body);
}
