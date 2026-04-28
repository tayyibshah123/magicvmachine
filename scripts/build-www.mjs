// Build the shippable web bundle for Capacitor.
//
// Capacitor's `webDir` points at a single folder that gets copied into
// the native APK. We don't want to ship node_modules, tests, dev docs,
// or .git, so this script writes a clean ./www/ each time:
//   1. Wipe ./www
//   2. Copy whitelisted top-level files
//   3. Copy whitelisted directories recursively
//   4. Prune __tests__ folders, *.test.js, and *.md from the copy
//
// Run before `npx cap sync android`. The npm script `android:sync`
// chains the two together.

import {
    rmSync, mkdirSync, cpSync, existsSync,
    readdirSync, statSync, copyFileSync
} from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT  = join(ROOT, 'www');

const COPY_FILES = [
    'index.html',
    'main.js',
    'style.css',
    'manifest.json',
    'service-worker.js',
    'icon.svg',
    'icon-maskable.svg',
    'intro.png',
];

const COPY_DIRS = [
    'src',
    'music',
    'sfx',
];

// Pruned from copied dirs: dev-only files that have no business in the APK.
const PRUNE = [
    /[\\/]__tests__[\\/]/,
    /\.test\.js$/,
    /\.md$/,
    /\.map$/,
];

function pruneRecursive(dir) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            pruneRecursive(full);
            // Drop now-empty directories that only contained pruned files.
            try {
                if (readdirSync(full).length === 0) rmSync(full, { recursive: true });
            } catch (_) {}
            continue;
        }
        if (PRUNE.some(rx => rx.test(full))) {
            rmSync(full);
        }
    }
}

console.log('build-www: cleaning', OUT);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let copiedFiles = 0;
for (const f of COPY_FILES) {
    const src = join(ROOT, f);
    if (!existsSync(src)) {
        console.warn(`build-www: missing ${f}, skipping`);
        continue;
    }
    copyFileSync(src, join(OUT, f));
    copiedFiles++;
}

let copiedDirs = 0;
for (const d of COPY_DIRS) {
    const src = join(ROOT, d);
    if (!existsSync(src)) {
        console.warn(`build-www: missing ${d}/, skipping`);
        continue;
    }
    cpSync(src, join(OUT, d), { recursive: true });
    copiedDirs++;
}

pruneRecursive(OUT);

console.log(`build-www: ${copiedFiles} files + ${copiedDirs} dirs → ${OUT}`);
