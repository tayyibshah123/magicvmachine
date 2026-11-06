// Test-only server: serves the actual web bundle. Revision changes simulate
// a new deployment entirely in memory, without editing production sources.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.env.MVM_TEST_WEB_ROOT || fileURLToPath(new URL('../www/', import.meta.url)));
const port = Number(process.env.MVM_TEST_PORT || 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid test port');
await stat(join(root, 'index.html'));
const revisions = { stable: '', guided: '' };
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (pathname === '/.__qa__/revision' && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) { body += chunk; if (body.length > 128) throw new Error('Oversized test revision'); }
      const payload = JSON.parse(body);
      const value = payload.revision;
      const edition = payload.edition || 'stable';
      if (!Object.hasOwn(revisions, edition)) throw new Error('Invalid test edition');
      if (typeof value !== 'string' || !/^[a-z0-9-]{0,40}$/.test(value)) throw new Error('Invalid revision');
      revisions[edition] = value;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ revision: value, edition }));
      return;
    }
    const file = resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    const inside = relative(root, file);
    if (inside.startsWith('..' + sep) || inside === '..' || inside.split(sep).some(part => part.startsWith('.'))) {
      response.writeHead(403).end(); return;
    }
    let body = await readFile(file);
    const revision = revisions[pathname.startsWith('/guided/') ? 'guided' : 'stable'];
    if (revision && /\/(?:service-worker|src\/version)\.js$/.test(pathname)) {
      body = Buffer.from(body.toString().replace(/(const CACHE_NAME = '[^']+|export const APP_VERSION = '[^']+)'/, '$1-' + revision + "'"));
    }
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404).end();
  }
});
server.listen(port, '127.0.0.1', () => console.log(`QA bundle server: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit()));
