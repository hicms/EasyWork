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
  entry: { 'command-cli': 'src/command-cli.ts' }, outDir: 'lib', format: 'esm', platform: 'node', target: 'es2024', fixedExtension: false, dts: false, clean: false,
}, {
  entry: { 'startup-preload': 'src/startup-preload.ts' }, outDir: 'lib', format: 'cjs', platform: 'node', target: 'es2024', fixedExtension: false, dts: false, clean: false,
}, {
  entry: { 'startup-prefetch': 'src/startup-prefetch.mjs', 'startup-trace': 'src/startup-trace.mjs' }, outDir: 'lib', format: 'esm', platform: 'node', target: 'es2024', fixedExtension: true, dts: false, clean: false,
}])
