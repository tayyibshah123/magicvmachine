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
    readdirSync, statSync, copyFileSync,
    readFileSync, writeFileSync
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
    // Standalone design mockups for menu redesign review. Static HTML,
    // no JS dependencies; reachable at /mockup-menu.html. Cheap to ship.
    'mockup-menu.html',
    'mockup-menu-a1.html',
    'mockup-menu-a2.html',
    'mockup-menu-a3.html',
];

const COPY_DIRS = [
    'src',
    'music',
    'sfx',
];

// Drop the heavier OGG variants from the APK build when M4A versions
// exist alongside (compress-music.mjs produces them). Saves ~50% of
// the music payload on Android. The web build still ships both since
// service-worker.js precaches by URL list and the audio loader picks
// per-codec at runtime.
const STRIP_OGG_IF_M4A_PRESENT = true;

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

// Drop OGG variants whose M4A sibling exists — Android prefers M4A,
// no need to ship both inside the APK. After stripping, we also
// rewrite the service-worker's SHELL_ASSETS so its precache list
// references the M4A URLs instead of stale OGG paths (otherwise the
// SW would Promise.all-and-catch each .ogg and end up with no music
// in the offline cache).
if (STRIP_OGG_IF_M4A_PRESENT) {
    const musicOut = join(OUT, 'music');
    const stripped = [];
    if (existsSync(musicOut)) {
        for (const entry of readdirSync(musicOut)) {
            if (!entry.toLowerCase().endsWith('.ogg')) continue;
            const m4a = entry.replace(/\.ogg$/i, '.m4a');
            if (existsSync(join(musicOut, m4a))) {
                rmSync(join(musicOut, entry));
                stripped.push(entry);
            }
        }
    }
    if (stripped.length > 0) {
        const swPath = join(OUT, 'service-worker.js');
        if (existsSync(swPath)) {
            let sw = readFileSync(swPath, 'utf8');
            for (const ogg of stripped) {
                const oggUrl = `./music/${ogg}`;
                const m4aUrl = `./music/${ogg.replace(/\.ogg$/i, '.m4a')}`;
                // Match exact ./music/<name>.ogg occurrences, escape the dot.
                const rx = new RegExp(oggUrl.replace(/[.]/g, '\\.'), 'g');
                sw = sw.replace(rx, m4aUrl);
            }
            writeFileSync(swPath, sw);
            console.log(`build-www: rewrote ${stripped.length} OGG → M4A URL(s) in service-worker.js`);
        }
    }
}

console.log(`build-www: ${copiedFiles} files + ${copiedDirs} dirs → ${OUT}`);
