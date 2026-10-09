import type {Context} from '@deepseek-ai/cordis';
import {CollaborationClient,installEnterpriseCollaboration} from './index.js';

/** Explicit Host-only composition; the personal/default Profile never loads it. */
export function enterpriseMemberCollaboration(adminUrl:string,memberAuthorization:()=>Promise<string>) {
  return {
    name:'workdsh-enterprise-collaboration-member',
    inject:['tools','workdshIdentity','connection'],
    apply(ctx:Context) {
      installEnterpriseCollaboration(ctx,new CollaborationClient({adminUrl,memberAuthorization}));
    },
  };
}
