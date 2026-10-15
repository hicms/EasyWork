import { readFile } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { productName } from './brand.mjs';

function moduleEntry(html) {
  const tags = [...html.matchAll(/<script\b[^>]*>/gu)].map(match => match[0])
    .filter(tag => /\btype\s*=\s*["']module["']/u.test(tag));
  const tag = tags[0];
  const src = tag && /\bsrc\s*=\s*["']([^"']+)["']/u.exec(tag)?.[1];
  if (tags.length !== 1 || !src || !/^\.\/assets\/[\w-]+\.js$/u.test(src)) {
    throw new Error('EasyWork startup branding: official module entry changed');
  }
  return { tag, src };
}

/** Adapt the published response before execution; never mutate installed files or DOM. */
export function brandStartupScript(source) {
  for (const [before, after] of [['HARNESS', productName], ['Loading plugins…', '正在加载插件…']]) {
    const literal = JSON.stringify(before);
    if (source.split(literal).length !== 2) {
      throw new Error(`EasyWork startup branding: expected one ${literal} literal`);
    }
    source = source.replace(literal, JSON.stringify(after));
  }
  return source;
}

export async function readStartupEntry(indexPath) {
  const html = await readFile(indexPath, 'utf8');
  const { src } = moduleEntry(html);
  const pathname = `/assets/easywork-startup-${basename(src)}`;
  return {
    originalSrc: src, src: `.${pathname}`, pathname,
    source: brandStartupScript(await readFile(join(dirname(indexPath), src), 'utf8')),
  };
}

/** A separate response URL avoids reusing a cached unbranded official entry. */
export function brandStartupIndex(html, entry) {
  const { tag, src } = moduleEntry(html);
  if (src !== entry.originalSrc) throw new Error('EasyWork startup branding: official index entry changed');
  return html.replace(tag, tag.replace(src, entry.src));
}
