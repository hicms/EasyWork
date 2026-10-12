/** Real Electron caption checks, invoked only by the explicit graphical startup probe. */
import assert from 'node:assert/strict'

export async function verifyWindowChrome(app, page, editor, output) {
  if (process.platform !== 'win32') return { windowsChromeVerified: false }
  const native = await app.evaluate(({ BrowserWindow, Menu }) => ({
    visibleMenuItems: Menu.getApplicationMenu().items.filter(item => item.visible).length,
    menuBarVisible: BrowserWindow.getAllWindows()[0].isMenuBarVisible(),
  }))
  assert.equal(native.visibleMenuItems, 0, 'Windows must not expose the traditional native menu')
  assert.equal(native.menuBarVisible, false)
  const markers = await page.evaluate(() => ({
    platform: document.documentElement.dataset.platform,
    windows: document.documentElement.hasAttribute('data-windows-titlebar'),
    height: getComputedStyle(document.documentElement).getPropertyValue('--dsh-windows-titlebar-height'),
    padding: getComputedStyle(document.querySelector('[data-shell-overlay]').parentElement).paddingTop,
    overlay: navigator.windowControlsOverlay.getTitlebarAreaRect().toJSON(),
  }))
  assert.equal(markers.platform, 'win32'); assert.equal(markers.windows, true)
  assert.equal(markers.height, '40px'); assert.equal(markers.padding, '40px')
  assert.equal(markers.overlay.height, 40, 'The actual native caption must use the official height')
  await page.getByRole('menuitem', { name: '应用程序', exact: true }).waitFor()

  // Observe real native calls while preserving their behavior, then restore the methods.
  await app.evaluate(({ BrowserWindow, Menu }) => {
    const window = BrowserWindow.getAllWindows()[0]
    const probe = { window, popup: Menu.prototype.popup, overlay: window.setTitleBarOverlay, colors: [], active: undefined }
    globalThis.__easyworkChromeProbe = probe
    window.setTitleBarOverlay = function (value) { probe.colors.push(value); return probe.overlay.call(this, value) }
    Menu.prototype.popup = function (options) { probe.active = this; return probe.popup.call(this, options) }
  })
  try {
    const popup = async (name, choose) => {
      await page.getByRole('menuitem', { name, exact: true }).click()
      const until = Date.now() + 5000
      let labels
      do {
        labels = await app.evaluate(() => globalThis.__easyworkChromeProbe.active?.items.map(item => item.label))
        if (labels) break
        if (Date.now() > until) throw new Error('Caption did not open a native popup')
        await new Promise(resolve => setTimeout(resolve, 25))
      } while (true)
      await app.evaluate((_electron, label) => {
        const probe = globalThis.__easyworkChromeProbe, menu = probe.active
        menu.closePopup(probe.window); probe.active = undefined
        if (label) { const item = menu.items.find(item => item.label === label); item.click(item, probe.window, {}) }
      }, choose)
      await page.getByRole('menuitem', { name, exact: true }).waitFor({ state: 'visible' })
      await page.waitForFunction(() => !document.querySelector('[data-windows-menu]').shadowRoot.querySelector('[aria-expanded=true]'))
      return labels
    }
    const application = await popup('应用程序')
    assert.ok(application.includes('终端命令 dsh（可选）…')); assert.ok(application.includes('退出 EasyWork'))
    await editor.fill('caption selection'); await editor.focus()
    await editor.evaluate(input => input.setSelectionRange(2, 7))
    await popup('编辑')
    assert.deepEqual(await editor.evaluate(input => ({ focused: document.activeElement === input, start: input.selectionStart, end: input.selectionEnd })),
      { focused: true, start: 2, end: 7 })
    await popup('编辑', '全选')
    assert.deepEqual(await editor.evaluate(input => [input.selectionStart, input.selectionEnd]), [0, 'caption selection'.length])
    await editor.fill('')
    const original = await page.evaluate(() => ({ lang: document.documentElement.lang, style: document.body.getAttribute('style') }))
    try {
      await page.evaluate(() => {
        document.documentElement.lang = 'en-US'
        document.body.style.setProperty('--dsw-specific-sidebar-fill', '#123456')
        document.body.style.setProperty('--dsw-alias-label-primary', '#abcdef')
      })
      await page.getByRole('menuitem', { name: 'Application', exact: true }).waitFor()
      const until = Date.now() + 5000
      let colors
      do {
        colors = await app.evaluate(() => globalThis.__easyworkChromeProbe.colors.at(-1))
        if (colors?.color === 'rgba(18, 52, 86, 1)') break
        if (Date.now() > until) throw new Error('Native caption did not follow the page palette')
        await new Promise(resolve => setTimeout(resolve, 25))
      } while (true)
      assert.equal(colors.symbolColor, 'rgba(171, 205, 239, 1)')
      assert.ok((await popup('Application')).includes('Terminal command dsh (optional)…'))
    } finally {
      await page.evaluate(value => {
        document.documentElement.lang = value.lang
        if (value.style === null) document.body.removeAttribute('style'); else document.body.setAttribute('style', value.style)
      }, original)
    }
  } finally {
    await app.evaluate(({ Menu }) => {
      const probe = globalThis.__easyworkChromeProbe
      probe.active?.closePopup(probe.window)
      Menu.prototype.popup = probe.popup; probe.window.setTitleBarOverlay = probe.overlay
      delete globalThis.__easyworkChromeProbe
    })
  }
  const settingsKey = async () => app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window.focus(); window.webContents.focus()
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: ',', modifiers: ['control'] })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: ',', modifiers: ['control'] })
  })
  await settingsKey()
  await page.getByRole('dialog').filter({ hasText: '设置' }).waitFor({ state: 'visible', timeout: 5000 })
  await settingsKey()
  await page.getByRole('dialog').filter({ hasText: '设置' }).waitFor({ state: 'hidden', timeout: 5000 })
  const preference = await page.evaluate(async () => {
    const api = window.dshDesktop.shortcuts
    const definitions = [{ id: 'easywork.probe', defaults: { 'desktop:windows': { code: 'KeyK', modifiers: ['control'] } } }]
    const initial = await api.get(definitions)
    const saved = await api.edit({ type: 'set', id: 'easywork.probe', binding: { code: 'KeyK', modifiers: ['control', 'shift'] } }, initial.revision)
    const stale = await api.edit({ type: 'reset', id: 'easywork.probe' }, initial.revision)
    const read = await api.get(definitions)
    return { ready: initial.status, saved: saved.status, stale: stale.status,
      binding: read.document.profiles['desktop:windows']['easywork.probe'] }
  })
  assert.deepEqual(preference, { ready: 'ready', saved: 'saved', stale: 'stale', binding: { code: 'KeyK', modifiers: ['control', 'shift'] } })
  await page.evaluate(async () => {
    const inputs = []
    window.__easyworkKeyboardProbe = { inputs, dispose: window.dshDesktop.keyboard.subscribe(input => inputs.push(input)) }
    await window.dshDesktop.shortcuts.get([{ id: 'easywork.chordProbe', defaults: {
      'desktop:windows': { code: 'KeyA', secondCode: 'KeyB', modifiers: [] },
    } }])
  })
  const chord = async (blur) => app.evaluate(({ BrowserWindow }, blur) => {
    const window = BrowserWindow.getAllWindows()[0], contents = window.webContents
    window.focus(); contents.focus()
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'A' })
    if (blur) contents.emit('blur')
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'B' })
    contents.sendInputEvent({ type: 'keyUp', keyCode: 'B' })
    contents.sendInputEvent({ type: 'keyUp', keyCode: 'A' })
  }, blur)
  try {
    await chord(false)
    await page.waitForFunction(() => window.__easyworkKeyboardProbe.inputs.length === 1)
    assert.deepEqual(await page.evaluate(() => window.__easyworkKeyboardProbe.inputs.map(input => [input.code, input.secondCode])), [['KeyA', 'KeyB']])
    await page.evaluate(() => { window.__easyworkKeyboardProbe.inputs.length = 0 })
    await chord(true)
    assert.equal(await page.evaluate(() => window.__easyworkKeyboardProbe.inputs.length), 0, 'A content-focus change must cancel the pending chord')
  } finally { await page.evaluate(() => { window.__easyworkKeyboardProbe.dispose(); delete window.__easyworkKeyboardProbe }) }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => Boolean(window.__DSH_BOOT__))
  assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-fullscreen')), false)
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()), false)
  await page.getByRole('menuitem', { name: '应用程序', exact: true }).waitFor()
  await page.screenshot({ path: output.replace(/\.json$/u, '.caption.png') })
  return { windowsChromeVerified: true, captionMenuVerified: true, editorSelectionPreserved: true,
    captionThemeAndLocaleVerified: true, normalWindowReloadVerified: true, nativeShortcutRoutingVerified: true,
    shortcutPersistenceVerified: true, shortcutChordFocusResetVerified: true }
}
