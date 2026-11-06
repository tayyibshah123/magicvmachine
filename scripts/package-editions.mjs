// Package already tested Stable and Guided checkouts for one static host.
// Each bundle remains complete and owns its own profile, manifest and worker.
import assert from 'node:assert/strict';
import { access, mkdir, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { resolve, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf('--' + name);
  assert(index >= 0 && args[index + 1] && !args[index + 1].startsWith('--'), 'Provide --' + name + ' CHECKOUT');
  return resolve(args[index + 1]);
};
const output = join(root, 'release-site');
assert.equal(relative(root, output), 'release-site');
try {
  assert.equal(await realpath(output), output, 'Publication directory must not be a linked external path');
} catch (error) { if (error.code !== 'ENOENT') throw error; }

const editions = {};
for (const id of ['stable', 'guided']) {
  const checkout = option(id);
  const source = await readFile(join(checkout, 'src/version.js'), 'utf8');
  const edition = source.match(/APP_EDITION = '([^']+)'/)?.[1];
  const version = source.match(/APP_VERSION = '([^']+)'/)?.[1];
  const cachePrefix = source.match(/APP_CACHE_PREFIX = '([^']+)'/)?.[1];
  assert.equal(edition, id, 'Source checkout has the wrong edition');
  assert(version && cachePrefix, 'Edition metadata must be complete');
  execFileSync(process.execPath, [join(checkout, 'scripts/validate-build.mjs')], { cwd: checkout, stdio: 'inherit' });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim();
  editions[id] = { checkout, version, cachePrefix, commit, path: id === 'stable' ? './' : './guided/' };
}
assert.notEqual(editions.stable.cachePrefix, editions.guided.cachePrefix, 'Edition caches must be independent');
assert.notEqual(editions.stable.version, editions.guided.version, 'Release versions must identify both editions');
const stableManifest = JSON.parse(await readFile(join(editions.stable.checkout, 'www/manifest.json'), 'utf8'));
const guidedManifest = JSON.parse(await readFile(join(editions.guided.checkout, 'www/manifest.json'), 'utf8'));
assert.notEqual(new URL(stableManifest.id, 'https://release.invalid/').href,
  new URL(guidedManifest.id, 'https://release.invalid/guided/').href, 'PWA identities must be independent');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const manifest = { generatedAt: new Date().toISOString(), editions: {}, files: {} };
const textTypes = new Set(['.html', '.js', '.css', '.json', '.svg']);
async function copyBundle(directory, destination, prefix = '') {
  await mkdir(destination, { recursive: true });
  for (const item of await readdir(directory, { withFileTypes: true })) {
    assert(!item.isSymbolicLink(), 'Publication must not follow linked files');
    const source = join(directory, item.name), target = join(destination, item.name);
    const path = prefix + item.name;
    assert(!/(?:^|\/)(?:\.git|\.env|node_modules|__tests__|test-results|tests)(?:\/|$)/.test(path), 'Development path must not publish');
    if (item.isDirectory()) await copyBundle(source, target, path + '/');
    else {
      let bytes = await readFile(source);
      if (textTypes.has(extname(item.name))) bytes = Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'));
      await writeFile(target, bytes);
      manifest.files[path] = createHash('sha256').update(bytes).digest('hex');
    }
  }
}
for (const [id, info] of Object.entries(editions)) {
  await copyBundle(join(info.checkout, 'www'), id === 'stable' ? output : join(output, 'guided'), id === 'stable' ? '' : 'guided/');
  const { checkout, ...publicInfo } = info;
  manifest.editions[id] = publicInfo;
}
await writeFile(join(output, '.nojekyll'), '');
await writeFile(join(output, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await access(join(output, 'guided/index.html'));
console.log(JSON.stringify({ output, editions: manifest.editions, files: Object.keys(manifest.files).length }));
