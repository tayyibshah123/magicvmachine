import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const bundle = join(root, 'www');
const version = (await readFile(join(root, 'src/version.js'), 'utf8')).match(/APP_VERSION = '([^']+)'/)?.[1];
const cachePrefix = (await readFile(join(root, 'src/version.js'), 'utf8')).match(/APP_CACHE_PREFIX = '([^']+)'/)?.[1] || 'mvm-shell-v';
assert(version, 'Source version must be readable');
const worker = await readFile(join(bundle, 'service-worker.js'), 'utf8');
assert.equal(worker.match(/CACHE_NAME = '([^']+)'/)?.[1], cachePrefix + version.replaceAll('.', '-'));
assert.equal(await readFile(join(bundle, 'src/version.js'), 'utf8'), await readFile(join(root, 'src/version.js'), 'utf8'));
assert.match(await readFile(join(bundle, 'index.html'), 'utf8'), /ALPHA V1/);
const assets = worker.match(/const SHELL_ASSETS = \[([\s\S]*?)\];/)?.[1];
assert(assets, 'Service worker asset list must be present');
const cachedPaths = new Set();
for (const [, asset] of assets.matchAll(/'([^']+)'/g)) {
  assert(asset.startsWith('./') && !asset.includes('..'), 'Cache assets must remain inside the bundle');
  await access(join(bundle, asset === './' ? 'index.html' : asset));
  cachedPaths.add(new URL(asset, 'https://bundle.invalid/').pathname);
}

// Walk the actual HTML, static/literal-dynamic module imports, CSS imports
// and CSS url() dependencies. External fonts and inline data/SVG references
// remain optional; local startup dependencies must be present and precached.
async function offlineClosure(directory) {
  const origin = 'https://bundle.invalid';
  const required = new Set();
  const pending = ['/index.html', '/src/version.js'];
  function enqueue(reference, owner) {
    const value = reference.trim();
    if (!value || value.startsWith('#') || /^(?:data|blob):/i.test(value)) return;
    const url = new URL(value, origin + owner);
    if (url.origin !== origin) return;
    assert(!/%2f|%5c/i.test(url.pathname), 'Offline dependency must use ordinary local paths: ' + value);
    if (!required.has(url.pathname)) pending.push(url.pathname);
  }
  while (pending.length) {
    const path = pending.pop();
    if (required.has(path)) continue;
    required.add(path);
    const file = join(directory, decodeURIComponent(path));
    await access(file);
    if (!/\.(?:html|js|css)$/.test(path)) continue;
    const text = await readFile(file, 'utf8');
    if (path.endsWith('.html')) {
      for (const [tag] of text.matchAll(/<(?:script|link|img)\b[^>]*>/gi)) {
        const reference = tag.match(/\b(?:src|href)\s*=\s*(['"])(.*?)\1/i)?.[2];
        if (reference) enqueue(reference, path);
      }
    } else if (path.endsWith('.js')) {
      for (const match of text.matchAll(/^\s*(?:import|export)\s+(?:[^'";]*?\bfrom\s*)?(['"])([^'"]+)\1/gm)) {
        assert(/^(?:\.?\.?\/)/.test(match[2]), 'Browser imports must use local relative/root paths: ' + match[2]);
        enqueue(match[2], path);
      }
      for (const match of text.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) {
        if (/^(?:\.?\.?\/)/.test(match[2])) enqueue(match[2], path);
      }
    } else {
      const css = text.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const match of css.matchAll(/@import\s+(?:url\(\s*)?(['"])([^'"]+)\1/gi)) enqueue(match[2], path);
      for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/gi)) {
        enqueue(match[1] ?? match[2] ?? match[3], path);
      }
    }
  }
  return required;
}
const sourceClosure = await offlineClosure(root);
const bundleClosure = await offlineClosure(bundle);
assert.deepEqual([...bundleClosure].sort(), [...sourceClosure].sort(), 'Source and bundle startup dependency paths must match');
for (const path of bundleClosure) assert(cachedPaths.has(path), 'Startup dependency missing from offline cache: ' + path);
for (const excluded of ['node_modules', 'src/__tests__', 'tests', 'package.json']) {
  let exists = true;
  try { await access(join(bundle, excluded)); } catch { exists = false; }
  assert.equal(exists, false, 'Development-only path must not ship: ' + excluded);
}
console.log('Bundle version, offline module/CSS closure (' + bundleClosure.size + ' paths), menu stamp and development-file exclusions passed.');
