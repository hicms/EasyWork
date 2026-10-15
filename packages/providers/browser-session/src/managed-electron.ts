/** Browser worker backed by the Chromium already shipped inside Desktop's Electron. */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { Browser, BrowserContext } from 'playwright-core';
import type { ManagedChromium } from './managed-chromium.js';

async function vacantPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('browser worker did not reserve a TCP port');
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

async function stopWorker(child: ChildProcess): Promise<void> {
  if (child.pid === undefined) return;
  try {
    if (child.exitCode !== null || child.signalCode !== null) {
      if (child.exitCode !== 0 || child.signalCode !== null) throw new Error('Electron browser worker exited abnormally');
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error): void => {
        clearTimeout(timer); child.removeListener('close', onClose); child.removeListener('error', finish);
        error ? reject(error) : resolve();
      };
      const onClose = (code: number | null, signal: NodeJS.Signals | null): void => {
        finish(code === 0 && signal === null ? undefined : new Error('Electron browser worker did not close naturally'));
      };
      const timer = setTimeout(() => finish(new Error('Electron browser worker shutdown timed out')), 3_000);
      child.once('close', onClose); child.once('error', finish);
      if (!child.connected) { finish(new Error('Electron browser worker shutdown channel is unavailable')); return; }
      try { child.send({ type: 'easywork-browser-close' }, error => { if (error) finish(error); }); }
      catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
    });
  } catch (error) {
    // SessionResources may swallow failed acquisition. Keep the failed-close verdict
    // until the Host's update drain checks it, even if the process later disappears.
    Reflect.set(globalThis, Symbol.for('easywork.ownedProcessShutdownFailed'), true);
    throw error;
  }
}

async function readyEndpoint(port: number, child: ChildProcess, signal?: AbortSignal): Promise<string> {
  const endpoint = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15_000;
  let startupError: Error | undefined;
  child.once('error', error => { startupError = error; });
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    if (startupError) throw startupError;
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Electron browser worker exited before startup');
    try {
      const response = await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(500) });
      if (response.ok) {
        const pages = await response.json() as Array<{ type?: string }>;
        if (pages.some(page => page.type === 'page')) return endpoint;
      }
    } catch { /* Worker may still be starting. */ }
    await delay(50, undefined, { signal });
  }
  throw new Error('Electron browser worker did not publish a page');
}

/** Start one hidden Electron instance whose CDP exposes no EasyWork app page. */
export async function launchManagedElectron(executable: string, signal?: AbortSignal, appPath?: string): Promise<ManagedChromium> {
  if (!executable.trim()) throw new Error('Desktop Electron executable is required');
  signal?.throwIfAborted();
  const { chromium } = await import('playwright-core');
  signal?.throwIfAborted();
  const profileDir = await mkdtemp(join(tmpdir(), 'easywork-electron-browser-'));
  let child: ChildProcess | undefined;
  let browser: Browser | undefined;
  let workerClosing: Promise<void> | undefined;
  const closeWorker = (): Promise<void> => workerClosing ??= child ? stopWorker(child) : Promise.resolve();
  const abortStartup = (): void => { void closeWorker().catch(() => {}); };
  try {
    const port = await vacantPort();
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(executable, [
      ...(appPath ? [appPath] : []),
      `--easywork-browser-worker-port=${port}`,
      `--easywork-browser-worker-profile=${profileDir}`,
    ], { env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
    child.stderr?.resume();
    signal?.addEventListener('abort', abortStartup, { once: true });
    if (signal?.aborted) abortStartup();
    const endpoint = await readyEndpoint(port, child, signal);
    browser = await chromium.connectOverCDP(endpoint);
    signal?.throwIfAborted();
    const context: BrowserContext | undefined = browser.contexts()[0];
    if (!context || context.pages().length === 0) throw new Error('Electron browser worker has no page');
    const ownedBrowser = browser;
    let closing: Promise<void> | undefined;
    return {
      endpoint, profileDir, context,
      close: () => closing ??= (async () => {
        try { await ownedBrowser.close(); }
        finally {
          await closeWorker();
          await rm(profileDir, { recursive: true, force: true });
        }
      })(),
    };
  } catch (error) {
    try { await browser?.close(); }
    finally {
      await closeWorker();
      await rm(profileDir, { recursive: true, force: true });
    }
    throw error;
  } finally {
    signal?.removeEventListener('abort', abortStartup);
  }
}
