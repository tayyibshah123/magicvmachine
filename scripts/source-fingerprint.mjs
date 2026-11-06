import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

// Include uncommitted source/test inputs too. Documentation-only release
// commits can reuse a verified result; changing a runtime or check cannot.
export async function sourceFingerprint(root) {
  const files = ['index.html', 'main.js', 'style.css', 'manifest.json', 'service-worker.js',
    'icon.svg', 'icon-maskable.svg', 'intro.png', 'package.json', 'package-lock.json',
    'vitest.config.js', 'playwright.config.js', 'mockup-menu.html',
    'mockup-menu-a1.html', 'mockup-menu-a2.html', 'mockup-menu-a3.html', 'mockup-menu-a4.html'];
  for (const optional of ['playwright.editions.config.js', 'playwright.webkit.config.js']) {
    try { await readFile(join(root, optional)); files.push(optional); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  async function collect(directory) {
    for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('Test inputs must not include linked source files');
      const name = directory + '/' + entry.name;
      if (entry.isDirectory()) await collect(name);
      else if (!name.endsWith('.md')) files.push(name);
    }
  }
  for (const directory of ['src', 'tests', 'scripts', 'music', 'sfx']) await collect(directory);
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    let bytes = await readFile(join(root, file));
    if (/\.(?:js|mjs|json|css|html|svg|sh)$/.test(file)) bytes = Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'));
    hash.update(file).update('\0').update(bytes).update('\0');
  }
  return hash.digest('hex');
}

export async function bundleFingerprint(root) {
  const files = [];
  async function collect(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('A tested bundle cannot contain linked files');
      const name = prefix + entry.name;
      if (entry.isDirectory()) await collect(join(directory, entry.name), name + '/');
      else files.push(name);
    }
  }
  await collect(root);
  const hash = createHash('sha256');
  for (const name of files.sort()) {
    let bytes = await readFile(join(root, name));
    if (/\.(?:js|json|css|html|svg)$/.test(name)) bytes = Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'));
    hash.update(name).update('\0').update(bytes).update('\0');
  }
  return hash.digest('hex');
}
