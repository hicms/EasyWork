import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type { Colleague } from './index.js';

/** Directory is always fetched as the signed-in member, never trusted from a chip. */
export function colleagueMentionSource(read: (signal: AbortSignal) => Promise<Colleague[]>, handoff?: (sessionId:string,recipientId:string,name:string,note:string)=>Promise<string>): InputTriggerSource {
  const source = 'workdsh-colleagues';
  return {
    trigger: '@', name: source, order: -30,
    async candidates(_session, request) {
      const query = request.query.trim().toLocaleLowerCase();
      return (await read(request.signal))
        .filter(person => `${person.displayName} ${person.email}`.toLocaleLowerCase().includes(query))
        .map(person => ({ name: person.email, label: person.displayName,
          description: '同组织成员', section: '同事通讯录', value: person.id }));
    },
    onPick({ candidate,session }) {
      if (!candidate.value) return;
      if(handoff){
        const recipient=candidate.value;
        const label=candidate.label||candidate.name;
        return {claim:{name:'分享',token:`@${label}（${candidate.name}） `,hint:'分享本次分析、资料与生成成果；可补充说明',attachments:false,
          async submit(note){try{return {kind:'success',text:await handoff(session.sessionId,recipient,label,note)};}catch(error){return {kind:'error',text:error instanceof Error?error.message:'交接失败，请查发件箱后重试'};}}
        }};
      }
      return { insert: { source, ref: candidate.value,
        label: `${candidate.label || candidate.name} · ${candidate.name}`,
        clipboardText: `@${candidate.name}` } };
    },
    codec: {
      // Persistence must preserve the identity, not turn it into a different person with the same name.
      clipboardText(ref) { return `@同事[${ref}]`; },
      async serialize(ref, signal) {
        const person = (await read(signal)).find(item => item.id === ref);
        if (!person) throw new Error('所选同事已不可用，请删除引用后重新选择同事');
        return `\n同事引用：${JSON.stringify({ memberId: person.id, displayName: person.displayName, email: person.email })}\n此引用仅标明同事，不代表已发送或授权交接。仅在用户明确要求发送时使用协作工具，并由服务端核对成员权限。\n`;
      },
    },
  };
}
