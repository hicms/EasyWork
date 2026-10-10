import { createHash, createPublicKey, verify } from 'node:crypto';
import { spawn } from 'node:child_process';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess';
import { evaluatePluginCompatibility, getDshRuntimeVersion, type ProfileContext } from '@deepseek-ai/dsh-app-boot';
import semver from 'semver';
import type { CenterConfig, Release } from './contracts.js';
import { readState } from './state.js';

export class UpdateError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
export function safeUrl(value: string): URL {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new UpdateError('source', '更新源必须使用 HTTPS（本机联调可用 HTTP），且不能在地址中包含凭据。');
  }
  return url;
}
export function validateCenter(config: CenterConfig): CenterConfig {
  const url = safeUrl(config.url).href.replace(/\/$/, '');
  if (!config.publicKey.trim().startsWith('-----BEGIN PUBLIC KEY-----')) throw new UpdateError('source', '请输入服务中心的 Ed25519 公钥，不接受私钥。');
  const key = createPublicKey(config.publicKey);
  if (key.asymmetricKeyType !== 'ed25519') throw new UpdateError('source', '请输入服务中心的 Ed25519 公钥。');
  return { url, publicKey: key.export({ type: 'spki', format: 'pem' }).toString().trim() };
}
async function bytes(url: string, signal: AbortSignal, limit: number): Promise<Buffer> {
  safeUrl(url);
  const response = await fetch(url, { signal, redirect: 'error' });
  if (!response.ok || !response.body) throw new UpdateError('network', '更新源暂时不可用，或此包需要尚不支持的下载认证。');
  const chunks: Uint8Array[] = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) { await response.body.cancel().catch(() => {}); throw new UpdateError('size', '更新源响应超过大小限制。'); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export async function centerRelease(config: CenterConfig, name: string, signal: AbortSignal): Promise<Release> {
  const envelope = JSON.parse((await bytes(`${config.url}/v1/plugins/${encodeURIComponent(name)}`, signal, 2_000_000)).toString());
  if (typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string'
    || !verify(null, Buffer.from(envelope.payload), config.publicKey, Buffer.from(envelope.signature, 'base64'))) {
    throw new UpdateError('signature', '版本清单签名不匹配，已拒绝更新源。');
  }
  const catalog = JSON.parse(envelope.payload);
  if (catalog.name !== name || !Array.isArray(catalog.releases)) throw new UpdateError('metadata', '版本清单名称不匹配。');
  const releases = catalog.releases.filter((r: Release) => semver.valid(r.version)).sort((a: Release, b: Release) => semver.rcompare(a.version, b.version));
  const release = releases[0] as Release | undefined;
  if (!release) throw new UpdateError('not-published', '服务中心尚未发布此插件。');
  if (!/^\/archives\/[a-f0-9]{128}\.tgz$/.test(release.archive)) throw new UpdateError('metadata', '服务中心包地址无效。');
  if (!Number.isSafeInteger(release.size) || release.size! <= 0 || release.size! > 128 * 1024 * 1024) throw new UpdateError('metadata', '版本清单缺少有效包大小。');
  return validateRelease({ ...release, archive: config.url + release.archive }, name);
}
/** pnpm owns scoped registries and .npmrc credentials; no secret or raw diagnostic crosses this boundary. */
export async function registryRelease(profile: ProfileContext, name: string, signal: AbortSignal): Promise<Release> {
  const invocation = profile.packageManager ?? { command: 'pnpm', args: [], env: {} };
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(invocation.command, [...invocation.args, 'view', `${name}@latest`, '--json', '--config.fetch-retries=0'], {
      cwd: profile.dir, env: { ...scrubbedParentEnv(), ...invocation.env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, signal,
    });
    let stdout = ''; let exceeded = false;
    child.stdout.on('data', data => { stdout += data; if (stdout.length > 4_000_000) { exceeded = true; child.kill(); } });
    child.stderr.resume();
    child.on('error', () => reject(new UpdateError('network', '无法查询插件来源，请检查网络和 Profile 的包管理配置。')));
    child.on('close', code => code === 0 && !exceeded ? resolve(stdout) : reject(new UpdateError('network', '版本查询失败，请检查网络、来源和权限。')));
  });
  const manifest = JSON.parse(output);
  return validateRelease({ name: manifest.name, version: manifest.version, archive: manifest.dist?.tarball,
    integrity: manifest.dist?.integrity, notes: manifest.releaseNotes ?? manifest.changelog, manifest }, name);
}
function validateRelease(release: Release, name: string): Release {
  if (release.name !== name || release.manifest?.name !== name || release.manifest.version !== release.version
    || !semver.valid(release.version) || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(release.integrity ?? '') || !release.manifest.dsh?.bundle) {
    throw new UpdateError('metadata', '版本、包名、bundle 或 SHA-512 校验信息缺失。');
  }
  safeUrl(release.archive);
  return { ...release, notes: typeof release.notes === 'string' ? release.notes.slice(0, 16000) : undefined };
}
export function compatibility(manifest: Record<string, any>): string | undefined {
  const mismatch = evaluatePluginCompatibility(manifest);
  if (mismatch) return `不兼容当前 DSH ${getDshRuntimeVersion()}：${Object.entries(mismatch.peers).map(([n,v]) => `${n} ${v}`).join('，')}`;
  for (const [name, version] of Object.entries({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
    if (name === '@deepseek-ai/dsh' || (name.startsWith('@deepseek-ai/dsh-') && version !== getDshRuntimeVersion())) return '此包会引入另一版本的 DSH 核心依赖，已拒绝。';
  }
  return undefined;
}
export async function sourceFingerprint(profile: ProfileContext, name: string): Promise<string> {
  const state = await readState(profile.dir);
  const manifest = JSON.parse(await readFile(join(profile.dir, 'package.json'), 'utf8'));
  const hash = createHash('sha256').update(JSON.stringify({ center: state.center, dependency: manifest.dependencies?.[name], record: state.installed[name], invocation: profile.packageManager }));
  const paths = new Set([join(homedir(), '.npmrc'), join(profile.dir, 'pnpm-workspace.yaml')]);
  for (let path = profile.dir;; path = dirname(path)) { paths.add(join(path, '.npmrc')); if (dirname(path) === path) break; }
  if (process.env.npm_config_userconfig) paths.add(process.env.npm_config_userconfig);
  for (const path of paths) {
    try { hash.update(path).update(await readFile(path)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return hash.digest('hex');
}
export async function downloadRelease(release: Release, dir: string, signal: AbortSignal): Promise<string> {
  const data = await bytes(release.archive, signal, 128 * 1024 * 1024);
  const digest = createHash('sha512').update(data).digest();
  if (release.size !== undefined && data.length !== release.size) throw new UpdateError('integrity', '下载包大小与已签名清单不匹配。');
  if (`sha512-${digest.toString('base64')}` !== release.integrity) throw new UpdateError('integrity', '下载包 SHA-512 不匹配，旧版本未改变。');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `${digest.toString('hex')}.tgz`);
  await writeFile(path, data, { mode: 0o600 });
  return path;
}
