/** Read-only official Web assets and an authenticated transport owned by the Electron carrier. */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { APP_ORIGIN, APP_SCHEME, type DesktopBootInfo } from './startup-contract.ts'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon',
}
const STATIC_PATH = /^(?:\/(?:index\.html|favicon(?:-dark)?\.svg|manifest\.webmanifest)?|\/assets\/.*)$/u
const PRIVATE_RESPONSE_HEADERS = ['set-cookie', 'content-encoding', 'content-length', 'transfer-encoding',
  'connection', 'keep-alive', 'te', 'trailer', 'upgrade', 'proxy-authenticate', 'proxy-authorization']

export function officialFrontendDirectory(profile: string): string {
  const installation = createRequire(join(profile, 'package.json'))
  const web = createRequire(installation.resolve('@deepseek-ai/dsh-web-app/package.json'))
  return join(dirname(web.resolve('@deepseek-ai/dsh-web-frontend/package.json')), 'dist')
}

export class CarrierWeb {
  readonly #boot = Promise.withResolvers<DesktopBootInfo>()
  #host: { origin: string, cookie: string } | undefined
  #failure: Error | undefined

  constructor(readonly frontend: string) {
    // A failed child can exit before the renderer registers its boot request.
    void this.#boot.promise.catch(() => {})
  }

  ready(): Promise<DesktopBootInfo> {
    return this.#failure ? Promise.reject(this.#failure) : this.#boot.promise
  }

  fail(error: Error): void {
    this.#failure = error
    this.#host = undefined
    this.#boot.reject(error)
  }

  async connect(url: string, injections: readonly unknown[]): Promise<void> {
    const address = new URL(url)
    if (address.protocol !== 'http:' || address.hostname !== '127.0.0.1' || !address.port
      || address.username || address.password || address.pathname !== '/' || !address.searchParams.has('token')) {
      throw new Error('本机 DSH 返回了无效的启动地址')
    }
    const response = await fetch(address, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
    const cookie = response.headers.get('set-cookie')?.split(';', 1)[0]
    await response.body?.cancel()
    if (response.status !== 303 || !cookie) throw new Error('本机 DSH 启动认证失败')
    if (this.#failure) throw this.#failure
    this.#host = { origin: address.origin, cookie }
    this.#boot.resolve({ injections, streamBaseUrl: address.origin })
  }

  async request(request: Request): Promise<Response> {
    const source = new URL(request.url)
    if (source.protocol !== `${APP_SCHEME}:` || source.hostname !== 'app' || source.port
      || source.username || source.password) return new Response(null, { status: 403 })
    const origin = request.headers.get('origin')
    if (origin !== null && origin !== APP_ORIGIN) return new Response(null, { status: 403 })
    if (STATIC_PATH.test(source.pathname)) return this.#asset(request, source.pathname)
    const host = this.#host
    if (!host) return new Response(null, { status: 503 })
    // A pathname cannot choose the destination authority. Cookies stay in this carrier.
    const target = new URL(host.origin)
    target.pathname = source.pathname
    target.search = source.search
    const headers = new Headers(request.headers)
    for (const name of ['host', 'origin', 'cookie', 'sec-fetch-site']) headers.delete(name)
    headers.set('cookie', host.cookie)
    const options = { method: request.method, headers, body: request.body, signal: request.signal,
      duplex: 'half', redirect: 'manual' as const }
    const response = await fetch(target, options)
    const outgoing = new Headers(response.headers)
    for (const name of PRIVATE_RESPONSE_HEADERS) outgoing.delete(name)
    if (source.pathname.startsWith('/plugins/')) outgoing.set('cache-control', 'no-store')
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: outgoing })
  }

  streamHeaders(url: string, headers: Record<string, string>): Record<string, string> | undefined {
    const host = this.#host
    const origin = Object.entries(headers).find(([name]) => name.toLowerCase() === 'origin')?.[1]
    if (!host || origin !== APP_ORIGIN) return undefined
    const target = new URL(url)
    if (target.protocol !== 'ws:' || target.host !== new URL(host.origin).host
      || target.username || target.password) return undefined
    const forwarded = Object.fromEntries(Object.entries(headers)
      .filter(([name]) => !['origin', 'cookie', 'sec-fetch-site'].includes(name.toLowerCase())))
    return { ...forwarded, origin: host.origin, cookie: host.cookie, 'sec-fetch-site': 'same-origin' }
  }

  ownsStream(url: string): boolean {
    const target = new URL(url)
    return !!this.#host && target.protocol === 'ws:' && target.host === new URL(this.#host.origin).host
  }

  async #asset(request: Request, pathname: string): Promise<Response> {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 })
    let decoded: string
    try { decoded = decodeURIComponent(pathname) } catch { return new Response(null, { status: 400 }) }
    const directory = resolve(this.frontend)
    const target = resolve(directory, '.' + (decoded === '/' ? '/index.html' : decoded))
    if (!target.startsWith(directory + sep)) return new Response(null, { status: 403 })
    try {
      const bytes = await readFile(target)
      // This is the official Web entry's asynchronous boot contract; installed bytes are untouched.
      const content = target === join(directory, 'index.html')
        ? bytes.toString('utf8').replace(/<head(?:\s[^>]*)?>/iu, '$&<script>globalThis.__DSH_BOOT_READY__ = Promise.withResolvers()</script>')
        : new Uint8Array(bytes)
      return new Response(request.method === 'HEAD' ? null : content, {
        headers: { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' },
      })
    } catch (error) {
      if (['ENOENT', 'ENOTDIR', 'EISDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return new Response(null, { status: 404 })
      throw error
    }
  }
}
