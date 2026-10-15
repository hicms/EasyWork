/** Loopback-only release fixture for explicitly requested, isolated Windows acceptance. */
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'

export async function startUpdateAcceptanceServer({ candidate, candidateDirectory, baseline, baselineDirectory, scenario }) {
  if (!['delta', 'missing-blockmap', 'corrupt-blockmap', 'offline'].includes(scenario)) throw new Error('Unknown acceptance scenario')
  const allowed = new Map()
  for (const [manifest, directory] of [[candidate, candidateDirectory], [baseline, baselineDirectory]]) {
    for (const asset of manifest.assets) allowed.set(`/hicms/EasyWork/releases/download/v${manifest.version}/${asset.name}`, join(directory, asset.name))
  }
  const requests = []
  const server = createServer((request, response) => {
    void (async () => {
      const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)
      if (scenario === 'offline') { request.socket.destroy(); return }
      if (path === '/repos/hicms/EasyWork/releases') {
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify([candidate, baseline].map(manifest => ({
          tag_name: `v${manifest.version}`, draft: false, prerelease: manifest.channel === 'alpha',
        }))))
        return
      }
      const file = allowed.get(path)
      if (!file || (scenario === 'missing-blockmap' && path.endsWith('.blockmap'))) { response.writeHead(404).end(); return }
      const size = (await stat(file)).size
      const range = request.headers.range
      const match = range?.match(/^bytes=(\d+)-(\d*)$/u)
      const start = range ? Number(match?.[1]) : 0
      const end = range && match?.[2] ? Number(match[2]) : size - 1
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || end >= size) {
        response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return
      }
      const observation = { path, range: range ?? null, status: range ? 206 : 200, bytes: end - start + 1, complete: false }
      requests.push(observation)
      response.on('finish', () => { observation.complete = true })
      response.writeHead(observation.status, { 'Content-Length': observation.bytes, 'Accept-Ranges': 'bytes',
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
        'Content-Type': path.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream',
      })
      if (scenario === 'corrupt-blockmap' && path.endsWith('.blockmap')) {
        const bytes = await readFile(file); bytes[0] ^= 0xff; response.end(bytes.subarray(start, end + 1))
      } else createReadStream(file, { start, end }).on('error', () => response.destroy()).pipe(response)
    })().catch(() => { if (!response.headersSent) response.writeHead(500); response.end() })
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    online() { scenario = 'delta' },
    close: () => new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections() }),
  }
}
