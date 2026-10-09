import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const entry = new URL('../../../packages/plugins/library/', import.meta.url);
const result = await build({ entryPoints: [fileURLToPath(new URL('src/client.tsx', entry))], bundle: true, write: false, format: 'cjs', platform: 'browser', target: 'es2022', external: ['@deepseek-ai/dsh-client-ui-primitives', 'react', 'react/jsx-runtime'] });
await writeFile(new URL('dist/client.browser.js', entry), `window.__ModuleLoader__.load({id: "workdsh-plugin-library", factory: function(require) { const module = {exports:{}};\n${result.outputFiles[0].text}\nreturn module.exports; }});\n`);

// Reuse Office's public extraction module at build time. Library must not require
// an unpublished Office plugin at runtime or activate Office in a personal Profile.
const requireOffice = createRequire(new URL('package.json', entry));
await build({
  entryPoints: [fileURLToPath(new URL('src/index.ts', entry))],
  bundle: true, format: 'esm', platform: 'node', target: 'node22', packages: 'external',
  plugins: [{ name: 'office-tabular-only', setup(builder) {
    builder.onResolve({ filter: /^workdsh-plugin-office\/tabular$/ }, () => ({ path: requireOffice.resolve('workdsh-plugin-office/tabular') }));
  } }],
  outfile: fileURLToPath(new URL('dist/index.js', entry)),
});
