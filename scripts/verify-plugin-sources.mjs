import { resolve } from 'node:path';
import { verify } from './plugin-source-files.mjs';

const lock = await verify(resolve(import.meta.dirname, '..'));
console.log(`Verified ${lock.plugins.length} plugin source mirrors from easywork-plugins ${lock.revision.slice(0, 12)}`);
