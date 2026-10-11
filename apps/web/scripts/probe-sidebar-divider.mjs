import { readFile, mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// Run only against an explicitly started synthetic preview; never launch the product here.
let login = process.env.EASYWORK_PREVIEW_URL;
for (let i = 0; !login && i < 100; i++) {
  const log = await readFile(process.env.EASYWORK_PREVIEW_LOG ?? '.test-runtime/upgrade-017/preview-server.log', 'utf8');
  login = log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0];
  if (!login) await new Promise(resolve => setTimeout(resolve, 1000));
}
if (!login) throw Error('Preview not ready');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(login);
  for (const name of [/^(Continue|继续)$/, /^(Configure later|稍后配置)$/]) {
    const optionalSetup = page.getByRole('button', { name });
    const visible = await optionalSetup.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, error => {
      if (error.name === 'TimeoutError') return false;
      throw error;
    });
    if (visible) await optionalSetup.click();
  }
  const projectEntry = page.getByRole('navigation', { name: /^(全局面板|Global panels)$/ }).getByRole('button', { name: '项目', exact: true });
  await projectEntry.click();
  await expect(projectEntry).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: '让想法，有处安放。', exact: true })).toBeVisible();
  await mkdir('.artifacts/project-home', { recursive: true });
  await page.getByRole('button', { name: /^(Settings|设置)$/ }).click();
  await page.getByRole('button', { name: /^(System|跟随系统|系统)$/ }).click();
  await page.getByRole('button', { name: /^(Close|关闭)$/ }).click();

  const colors = [];
  for (const scheme of ['light', 'dark', 'light']) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect.poll(() => page.locator('body').getAttribute('data-ds-dark-theme')).toBe(scheme === 'dark' ? '' : null);
    // Inspect the visible native sidebar through our declared brand Slot, without
    // depending on private shell classes or imposing a particular border treatment.
    const surface = await page.getByTestId('easywork-brand').evaluate(brand => {
      const expected = document.createElement('span').style;
      expected.color = getComputedStyle(brand).getPropertyValue('--dsw-specific-sidebar-fill').trim();
      for (let node = brand; node; node = node.parentElement) {
        const background = getComputedStyle(node).backgroundColor;
        if (background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent') return { background, expected: expected.color };
      }
      throw Error('Native sidebar has no painted surface');
    });
    expect(surface.background).toBe(surface.expected);
    const active = await projectEntry.evaluate(entry => ({
      background: getComputedStyle(entry).backgroundColor,
      color: getComputedStyle(entry).color,
    }));
    expect(active.background).not.toBe(surface.background);
    expect(active.color).not.toBe(active.background);
    colors.push(surface.background);
    await page.screenshot({ path: `.artifacts/project-home/divider-${scheme}-${colors.length}.png` });
  }
  expect(colors[0]).not.toBe(colors[1]);
  expect(colors[2]).toBe(colors[0]);

  // DSH exposes the resize handle's side as data; exercise its real pointer behavior.
  const handle = page.locator('[data-side="sidebar"]');
  await expect(handle).toBeVisible();
  const before = await handle.boundingBox();
  const x = before.x + before.width / 2;
  const y = before.y + Math.min(before.height / 2, 200);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await handle.boundingBox()).x).toBeGreaterThan(before.x + 20);
  const after = await handle.boundingBox();
  await page.mouse.move(after.x + after.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await handle.boundingBox()).x - before.x)).toBeLessThan(2);
  await expect(page.getByRole('heading', { name: '让想法，有处安放。', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  console.log('PASS native sidebar token palette light/dark/light, resize and restoration');
} finally {
  await browser.close();
}
