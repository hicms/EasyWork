import type {} from '@deepseek-ai/dsh-tool-present/types';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { FileAttachmentRef } from '@deepseek-ai/dsh-attachment';
export function materialSnapshot(events: readonly SessionEvent[], options:{allowEmpty?:boolean}={}) {
  const final=[...events].reverse().find(event=>event.type==='assistant/message'&&!event.data.interrupted
    &&!event.data.message.content.some(part=>part.type==='tool-call')
    &&event.data.message.content.some(part=>part.type==='text'&&part.text.trim()));
  if(!final||final.type!=='assistant/message'){
    if(options.allowEmpty)return {context:'',files:[] as FileAttachmentRef[],generated:[] as {path:string}[],seq:0,filePromptDiffers:false};
    throw new Error('当前会话没有可交接的完整分析结果');
  }
  const before=events.filter(event=>event.seq<final.seq);
  const prompts=before.filter(event=>event.type==='user/message'&&event.data.source.kind==='user');
  const prompt=prompts.at(-1);
  if(!prompt||prompt.type!=='user/message'){
    if(options.allowEmpty)return {context:'',files:[] as FileAttachmentRef[],generated:[] as {path:string}[],seq:0,filePromptDiffers:false};
    throw new Error('没有找到本次分析的用户提问');
  }
  const filePrompt=[...prompts].reverse().find(event=>event.type==='user/message'&&event.data.content.some(part=>part.type==='file'));
  const files:FileAttachmentRef[]=filePrompt?.type==='user/message'
    ?filePrompt.data.content.flatMap(part=>part.type==='file'?[part.attachment]:[]):[];
  const text=(parts: typeof prompt.data.content)=>parts.flatMap(part=>part.type==='text'?[part.text]:[]).join('\n');
  const context=`用户提问：\n${text(prompt.data.content)}\n\n分析结果：\n${text(final.data.message.content)}`;
  if(context.length>200000)throw new Error('分析结果过长，不能静默截断共享');
  const generated=[...new Map(events.filter(event=>event.seq>=prompt.seq&&event.seq<=final.seq&&event.type==='deliverables/presented').flatMap(event=>event.type==='deliverables/presented'?event.data.files:[]).map(file=>[file.path,file])).values()];
  return {context,files,generated,seq:Number(final.seq),filePromptDiffers:filePrompt!==undefined&&filePrompt!==prompt};
}
