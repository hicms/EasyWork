import type {Context} from '@deepseek-ai/cordis';
import {CollaborationClient,installEnterpriseCollaboration} from './index.js';
interface DesktopIdentity { collaborationBinding():Promise<{url:string;authorization:string}> }
/** Uses the owning Main process capability. Backend login tokens never enter Host or Client. */
export default {
  name:'workdsh-enterprise-collaboration-desktop',
  inject:['tools','workdshIdentity','connection'],
  async apply(ctx:Context) {
    const identity=ctx.workdshIdentity as unknown as DesktopIdentity;
    if(typeof identity.collaborationBinding!=='function') throw new Error('Enterprise Desktop identity required');
    const binding=await identity.collaborationBinding();
    installEnterpriseCollaboration(ctx,new CollaborationClient({adminUrl:binding.url,memberAuthorization:async()=>{
      const current=await identity.collaborationBinding();
      if(current.url!==binding.url) throw new Error('Enterprise Desktop authority changed');
      return current.authorization;
    }}));
  },
};
