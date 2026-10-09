import type { IncomingMessage } from 'node:http';
import type { VerifiedMember } from './request-context.js';

const cookieName = 'workdsh-admin-session';
const denied = () => new Error('Enterprise authentication required');

/** Host-only extraction; never expose this return value to a Client or model. */
export function enterpriseBackendBearer(request: Pick<IncomingMessage, 'headers'>): string {
  const cookie = request.headers.cookie;
  if (!cookie || cookie.length > 8192 || /[\r\n]/.test(cookie)) throw denied();
  const values = cookie.split(';').map(part => part.trim()).filter(part => part.split('=', 1)[0] === cookieName);
  if (values.length !== 1) throw denied();
  const token = values[0].slice(cookieName.length + 1);
  if (!/^[A-Za-z0-9_-]{16,512}$/.test(token)) throw denied();
  return `Bearer ${token}`;
}

/** Authenticate only against the configured organization service, never client actor headers. */
export function enterpriseBackendAuthentication(origin: string) {
  const url = new URL(origin);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)))) {
    throw new Error('Invalid enterprise authentication origin');
  }
  const endpoint = new URL('/api/auth/me', url);
  return async (request: Pick<IncomingMessage, 'headers'>, signal?: AbortSignal): Promise<VerifiedMember> => {
    const token = enterpriseBackendBearer(request).slice(7);
    try {
      const response = await fetch(endpoint, {
        headers: { cookie: `${cookieName}=${token}`, accept: 'application/json' },
        redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(5000), ...(signal ? [signal] : [])]),
      });
      if (!response.ok) throw denied();
      const actor = await response.json() as Record<string, unknown>;
      if (typeof actor.id !== 'string' || !actor.id || typeof actor.organizationId !== 'string' || !actor.organizationId ||
          !['OWNER', 'ADMIN', 'MEMBER'].includes(String(actor.role)) || actor.mustChangePassword !== false) throw denied();
      // /auth/me checks session expiry and active membership on every request.
      const role = actor.role === 'OWNER' ? 'owner' : actor.role === 'ADMIN' ? 'admin' : 'member';
      return Object.freeze({ principalId: actor.id, organizationId: actor.organizationId, active: true, role });
    } catch { throw denied(); }
  };
}

/** Trusted admission captures authentication once; background checks never read mutable request headers. */
export function enterpriseBackendMemberVerifier(origin: string, request: Pick<IncomingMessage, 'headers'>) {
  const authenticate = enterpriseBackendAuthentication(origin);
  const captured = Object.freeze({ headers: Object.freeze({ cookie: request.headers.cookie }) });
  return (signal?: AbortSignal) => authenticate(captured, signal);
}
