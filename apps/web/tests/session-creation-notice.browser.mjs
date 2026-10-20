import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const requireReact = createRequire(new URL('../../../packages/plugins/models/package.json', import.meta.url));
const component = fileURLToPath(new URL('../../../packages/bundle/src/client/components/SessionCreationNotice.tsx', import.meta.url));
const bundle = await build({
  stdin: { contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {SessionCreationNotice} from ${JSON.stringify(component)};
    let message = null;
    window.listeners = new Set();
    window.notify = next => { message = next; for (const listener of window.listeners) listener(); };
    const source = {
      getSnapshot: () => message,
      subscribe: listener => { window.listeners.add(listener); return () => window.listeners.delete(listener); },
    };
    window.root = createRoot(document.getElementById('root'));
    window.root.render(<SessionCreationNotice source={source} dismiss={() => window.notify(null)} />);
  `, loader: 'tsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
  alias: { react: dirname(requireReact.resolve('react')), 'react-dom/client': requireReact.resolve('react-dom/client') },
  bundle: true, write: false, format: 'iife', platform: 'browser',
});

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root" style="pointer-events:none"></div></body></html>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.waitForFunction(() => window.listeners.size === 1);
  const notice = page.getByRole('alert');
  await expect(notice).toHaveCount(0);
  await page.evaluate(() => window.notify('工作区目录暂时不可用。请通过侧栏添加可写子文件夹。\nE:\\<img src=x onerror=alert(1)>'));
  await expect(notice).toContainText('无法新建会话');
  await expect(notice).toContainText('<img src=x onerror=alert(1)>');
  await expect(notice.locator('img')).toHaveCount(0);
  for (const [width, height, dark] of [[1280, 800, false], [390, 650, true]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(dark => { document.body.style.cssText = dark
      ? 'background:#17191b;--dsw-alias-bg-layer-1:#24282b;--dsw-alias-label-primary:#fff' : 'background:#f3f4f5'; }, dark);
    const rect = await notice.boundingBox();
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
  }
  await notice.getByRole('button', { name: '知道了' }).click();
  await expect(notice).toHaveCount(0);
  await page.evaluate(() => { document.documentElement.lang = 'en-US'; window.notify('Choose a writable subfolder.'); });
  await expect(notice).toContainText('Unable to create conversation');
  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await expect(notice).toHaveCount(0);
  await page.evaluate(() => window.root.unmount());
  assert.equal(await page.evaluate(() => window.listeners.size), 0);
  assert.deepEqual(errors, []);
  console.log('Session creation notice: bilingual errors, escaping, dismissal, responsive themes and disposal passed');
} finally {
  await browser.close();
}
