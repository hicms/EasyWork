import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'

const requireReact = createRequire(new URL('../../../packages/plugins/models/package.json', import.meta.url))
const component = fileURLToPath(new URL('../../../packages/bundle/src/client/components/DesktopUpdateNotice.tsx', import.meta.url))
const bundle = await build({ stdin: { contents: `
import React from 'react'; import {createRoot} from 'react-dom/client'; import {DesktopUpdateNotice} from ${JSON.stringify(component)};
window.actions=[]; window.listeners=new Set(); window.initial=new Promise(resolve=>window.initialReady=resolve);
window.easyworkUpdates={get:()=>window.initial,subscribe:f=>{window.listeners.add(f);return()=>window.listeners.delete(f)},
restart:async()=>{window.actions.push('restart');window.emit({state:'verifying',version:'2.1.0-alpha.2'})},releaseNotes:async()=>{window.actions.push('notes')},check:async()=>{}};
window.emit=s=>{for(const listener of window.listeners)listener(s)};
window.root=createRoot(document.getElementById('root')); window.root.render(<DesktopUpdateNotice/>);
`, loader: 'tsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
  alias: { react: dirname(requireReact.resolve('react')), 'react-dom/client': requireReact.resolve('react-dom/client') }, bundle: true, write: false, format: 'iife', platform: 'browser' })
const server = createServer((req, res) => {
  res.setHeader('content-type', req.url === '/fixture.js' ? 'text/javascript' : 'text/html')
  res.end(req.url === '/fixture.js' ? bundle.outputFiles[0].text : '<!doctype html><html lang="zh-CN"><head><title>EasyWork update notice</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#f3f4f5"><main>EasyWork</main><div id="root"></div><script src="/fixture.js"></script></body></html>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.waitForFunction(() => window.listeners.size === 1)
  const notice = page.getByRole('status', { name: '应用更新' })
  await expect(notice).toHaveCount(0)
  await page.evaluate(() => { window.emit({state:'downloaded',version:'2.1.0-alpha.2'}); window.initialReady({state:'idle'}) })
  await expect(notice).toContainText('新版本就绪')
  for (const [width, height, dark] of [[1280,800,false],[390,650,true]]) {
    await page.setViewportSize({width,height})
    await page.evaluate(dark => { document.body.style.cssText=dark?'background:#17191b;--dsw-alias-bg-layer-1:#24282b;--dsw-alias-label-primary:#fff':'background:#f3f4f5' },dark)
    const rect=await notice.boundingBox(); assert(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=width&&rect.y+rect.height<=height)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width)
  }
  await notice.getByRole('button',{name:'更新日志',exact:true}).click()
  await notice.getByRole('button',{name:'稍后更新'}).click(); await expect(notice).toHaveCount(0)
  await page.evaluate(()=>window.emit({state:'downloaded',version:'2.1.0-alpha.3'}))
  await expect(notice).toBeVisible()
  await page.evaluate(()=>document.documentElement.lang='en-US')
  await page.getByRole('button',{name:'Restart and update',exact:true}).click()
  await expect(page.getByRole('button',{name:'Restart and update',exact:true})).toBeDisabled()
  assert.deepEqual(await page.evaluate(()=>window.actions),['notes','restart'])
  await page.evaluate(()=>window.root.unmount())
  assert.equal(await page.evaluate(()=>window.listeners.size),0)
  assert.deepEqual(errors,[])
  console.log('Desktop update notice: state race, dismiss, new version, locale, restart, responsive themes and disposal passed')
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)) }
