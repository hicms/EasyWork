import { defineConfig } from 'tsdown'

// Installers ship this Electron carrier and the bundled EasyWork Profile only.
export default defineConfig([{
  entry: { 'easywork-main': 'src/easywork-main.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  sourcemap: true,
}, {
  entry: { 'desktop-updater': 'src/updater-runtime.ts' }, outDir: 'lib', format: 'cjs', platform: 'node', target: 'es2024', fixedExtension: true, dts: false, clean: false,
  // Include the complete updater dependency closure in this one file. Electron
  // and Node builtins are the only dependencies provided by the carrier runtime.
  deps: { alwaysBundle: [/./u], neverBundle: ['electron', /^node:/u], onlyBundle: false },
}, {
  entry: { 'command-cli': 'src/command-cli.ts' }, outDir: 'lib', format: 'esm', platform: 'node', target: 'es2024', fixedExtension: false, dts: false, clean: false,
}, {
  entry: { 'startup-preload': 'src/startup-preload.ts' }, outDir: 'lib', format: 'cjs', platform: 'node', target: 'es2024', fixedExtension: false, dts: false, clean: false,
}, {
  entry: { 'startup-trace': 'src/startup-trace.mjs' }, outDir: 'lib', format: 'esm', platform: 'node', target: 'es2024', fixedExtension: true, dts: false, clean: false,
}])
