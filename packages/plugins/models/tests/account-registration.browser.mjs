import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';

const requireWeb = createRequire(new URL('../../../../apps/web/package.json', import.meta.url));
const { build } = requireWeb('esbuild');
const { chromium, expect } = requireWeb('@playwright/test');
const bundle = await build({ entryPoints: [fileURLToPath(new URL('registration.fixture.tsx', import.meta.url))], bundle: true, write: false, platform: 'browser', format: 'iife' });
const css = `body{margin:0;padding:24px;font:14px system-ui;background:#fff;--dsw-alias-label-primary:#24252a;--dsw-alias-label-secondary:#717681;--dsw-alias-label-primary-inverted:#fff;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#f5f6f8;--dsw-alias-interactive-bg-hover:#eef0f4;--dsw-alias-state-error-primary:#b42318}body.dark{background:#191a1d;--dsw-alias-label-primary:#f1f2f4;--dsw-alias-label-secondary:#a5a8b2;--dsw-alias-label-primary-inverted:#17181b;--dsw-alias-bg-layer-1:#24252a;--dsw-alias-bg-layer-2:#2b2d33;--dsw-alias-interactive-bg-hover:#353740;--dsw-alias-state-error-primary:#fda29b}#root{max-width:780px;margin:auto}`;
const server = createServer((request, response) => {
  response.setHeader('content-type', request.url === '/fixture.js' ? 'text/javascript' : 'text/html');
  response.end(request.url === '/fixture.js' ? bundle.outputFiles[0].text : `<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/fixture.js"></script></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const calls = []; let signedIn = false; let releaseRegistration;
  const snapshot = () => ({ origin: 'https://ask.vigoai.cn', user: signedIn ? { id: 'test-user', email: 'new@example.test' } : null,
    expiresAt: signedIn ? Date.now() + 60_000 : null, error: null, models: signedIn ? [{ id: 'test-model', name: 'Registration model', protocol: 'openai-completions', vendor: 'test', tier: 'balanced', priceMultiplier: 1, supportsTools: true, supportsReasoning: false, supportsImages: false, isDefault: true, contextWindow: 32_768, reasoningControls: null }] : [] });
  await page.route('**/api/easywork-models', async route => {
    const call = route.request().postDataJSON(); calls.push(call);
    if (call.endpoint === 'register') {
      if (call.payload.inviteCode !== 'ASK-valid-invitation') {
        await route.fulfill({ status: 400, json: { ok: false, error: { message: '邀请码无效或已使用，请检查后重试。' } } }); return;
      }
      if (call.payload.email === 'existing@example.test') {
        await route.fulfill({ status: 409, json: { ok: false, error: { message: '该邮箱已注册，请直接登录。' } } }); return;
      }
      await new Promise(resolve => { releaseRegistration = resolve; }); signedIn = true;
    }
    if (call.endpoint === 'login') signedIn = true;
    if (call.endpoint === 'logout') signedIn = false;
    await route.fulfill({ json: { ok: true, value: snapshot() } });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const password = page.locator('input[name=password]');
  const confirmPassword = page.getByLabel('确认密码', { exact: true });
  const invitation = page.getByLabel('邀请码', { exact: true });
  const registrations = () => calls.filter(call => call.endpoint === 'register');
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeEnabled();
  assert.equal(await password.getAttribute('autocomplete'), 'current-password');
  await expect(invitation).toHaveCount(0);
  await page.getByRole('button', { name: '使用邀请码注册' }).click();
  assert.equal(await password.getAttribute('autocomplete'), 'new-password');
  await expect(confirmPassword).toBeVisible(); await expect(invitation).toHaveAttribute('required', '');
  const output = fileURLToPath(new URL('../../../../apps/web/.artifacts/account-registration/', import.meta.url));
  await mkdir(output, { recursive: true });
  for (const [width, height, dark] of [[1280, 900, false], [390, 844, true]]) {
    await page.setViewportSize({ width, height }); await page.evaluate(dark => document.body.classList.toggle('dark', dark), dark);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    const button = await page.getByRole('button', { name: '注册并登录' }).boundingBox();
    assert.ok(button.x >= 0 && button.x + button.width <= width);
    await page.screenshot({ path: output + (dark ? 'registration-narrow-dark.png' : 'registration-desktop-light.png'), fullPage: true });
  }
  await page.getByLabel('邮箱', { exact: true }).fill('new@example.test');
  await password.fill('registration password'); await confirmPassword.fill('different password');
  await invitation.fill('ASK-valid-invitation');
  await page.getByRole('button', { name: '注册并登录' }).click();
  await expect(page.getByRole('alert')).toHaveText('两次输入的密码不一致。'); assert.equal(registrations().length, 0);
  await confirmPassword.fill('registration password'); await invitation.fill('');
  await page.getByRole('button', { name: '注册并登录' }).click();
  assert.equal(await invitation.evaluate(input => input.validity.valueMissing), true); assert.equal(registrations().length, 0);
  await invitation.fill('   '); await page.getByRole('button', { name: '注册并登录' }).click();
  await expect(page.getByRole('alert')).toHaveText('请填写邀请码。'); assert.equal(registrations().length, 0);
  await invitation.fill('ASK-used-invitation'); await page.getByRole('button', { name: '注册并登录' }).click();
  await expect(page.getByRole('alert')).toContainText('邀请码无效或已使用');
  for (const field of [password, confirmPassword, invitation]) await expect(field).toHaveValue('');
  assert.equal(registrations().length, 1);
  assert.deepEqual(registrations()[0].payload, { email: 'new@example.test', password: 'registration password', inviteCode: 'ASK-used-invitation' });
  await page.getByLabel('邮箱', { exact: true }).fill('existing@example.test');
  await password.fill('registration password'); await confirmPassword.fill('registration password'); await invitation.fill('ASK-valid-invitation');
  await page.getByRole('button', { name: '注册并登录' }).click();
  await expect(page.getByRole('alert')).toContainText('该邮箱已注册');
  await page.getByRole('button', { name: '已有账号？返回登录' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0); await expect(invitation).toHaveCount(0);
  assert.equal(await password.getAttribute('autocomplete'), 'current-password');
  await page.getByRole('button', { name: '使用邀请码注册' }).click();
  await page.getByLabel('邮箱', { exact: true }).fill('new@example.test');
  await password.fill('registration password'); await confirmPassword.fill('registration password'); await invitation.fill('ASK-valid-invitation');
  await page.getByRole('button', { name: '注册并登录' }).click();
  await expect(page.getByRole('button', { name: '正在注册…' })).toBeDisabled();
  for (const field of [password, confirmPassword, invitation, page.getByLabel('邮箱', { exact: true })]) await expect(field).toBeDisabled();
  await expect(page.getByRole('button', { name: '已有账号？返回登录' })).toBeDisabled();
  await expect.poll(() => typeof releaseRegistration).toBe('function'); releaseRegistration();
  await expect(page.getByText('new@example.test', { exact: true })).toBeVisible();
  await expect(page.getByText('Registration model', { exact: true })).toBeVisible();
  assert.equal(registrations().length, 3); assert.equal(calls.filter(call => call.endpoint === 'login').length, 0);
  await expect(password).toHaveCount(0);
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeEnabled();
  await expect(invitation).toHaveCount(0);
  await page.getByLabel('邮箱', { exact: true }).fill('new@example.test'); await password.fill('registration password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('button', { name: '退出登录' })).toBeVisible();
  assert.deepEqual(calls.find(call => call.endpoint === 'login').payload, { email: 'new@example.test', password: 'registration password' });
  assert.deepEqual(errors, []);
  console.log('Account registration browser checks passed: validation, errors, retry, busy state, auto-login, logout and login; desktop/light and narrow/dark layouts.');
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
