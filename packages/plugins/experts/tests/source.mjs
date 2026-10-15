import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const webRequire = createRequire(new URL('../../../../apps/web/package.json', import.meta.url));
const { build } = webRequire('esbuild');
const require = createRequire(import.meta.url);

/** Transpile only the tested source in memory; no package/runtime build or emitted files. */
export async function source(contents) {
  const result = await build({
    stdin: { contents, resolveDir: fileURLToPath(new URL('../src/', import.meta.url)), loader: 'ts' },
    bundle: true, write: false, format: 'cjs', platform: 'node', target: 'node22', packages: 'external',
    // Preserve resource lookup in transitive helpers without emitting a bundle.
    plugins: [{ name: 'source-module-url', setup(builder) {
      builder.onLoad({ filter: /\.tsx?$/ }, async ({ path }) => {
        const { readFile } = await import('node:fs/promises');
        const { pathToFileURL } = await import('node:url');
        return { contents: (await readFile(path, 'utf8')).replaceAll('import.meta.url', JSON.stringify(pathToFileURL(path).href)), loader: path.endsWith('.tsx') ? 'tsx' : 'ts' };
      });
    } }],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
