// Compress the OGG music library to AAC (.m4a) for the Android APK.
//
// Why: the 5 .ogg files in ./music total ~103 MB at full quality,
// pushing the APK above the 100 MB Play Store warning. AAC at ~96 kbps
// preserves perceived quality on a phone speaker / earbud setup while
// roughly halving the size.
//
// The runtime audio loader (src/audio.js _resolveTrackSrc) already
// prefers .m4a when the WebView reports better support — the new
// files just drop in alongside the originals and the engine picks
// the smaller one automatically. The .ogg copies stay around so the
// PWA web build keeps full Vorbis playback.
//
// Requirements:
//   - ffmpeg on PATH (https://ffmpeg.org/download.html)
//
// Run once:
//   node scripts/compress-music.mjs
//
// Re-run is idempotent — existing .m4a files are overwritten.

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MUSIC_DIR = join(ROOT, 'music');

const BITRATE = '96k';

function checkFfmpeg() {
    const r = spawnSync('ffmpeg', ['-version'], { stdio: 'pipe' });
    if (r.error || r.status !== 0) {
        console.error('compress-music: ffmpeg not found on PATH.');
        console.error('Install from https://ffmpeg.org/download.html and rerun.');
        process.exit(1);
    }
}

function fmtMb(bytes) {
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function compressOne(srcPath) {
    const name = basename(srcPath, extname(srcPath));
    const outPath = join(dirname(srcPath), name + '.m4a');
    console.log(`compress-music: ${basename(srcPath)} → ${basename(outPath)}`);
    const r = spawnSync('ffmpeg', [
        '-y',
        '-i', srcPath,
        '-c:a', 'aac',
        '-b:a', BITRATE,
        '-movflags', '+faststart',
        outPath,
    ], { stdio: 'inherit' });
    if (r.status !== 0) {
        console.error(`compress-music: ffmpeg failed for ${srcPath}`);
        process.exit(r.status || 1);
    }
    const inSz  = statSync(srcPath).size;
    const outSz = statSync(outPath).size;
    console.log(`  ${fmtMb(inSz)} → ${fmtMb(outSz)}  (saved ${fmtMb(inSz - outSz)})`);
}

function main() {
    if (!existsSync(MUSIC_DIR)) {
        console.error(`compress-music: ${MUSIC_DIR} not found`);
        process.exit(1);
    }
    checkFfmpeg();
    const oggs = readdirSync(MUSIC_DIR)
        .filter(f => f.toLowerCase().endsWith('.ogg'))
        .map(f => join(MUSIC_DIR, f));
    if (oggs.length === 0) {
        console.warn('compress-music: no .ogg files in ./music');
        return;
    }
    let totalIn = 0, totalOut = 0;
    for (const src of oggs) {
        totalIn += statSync(src).size;
        compressOne(src);
        const out = src.replace(/\.ogg$/i, '.m4a');
        if (existsSync(out)) totalOut += statSync(out).size;
    }
    console.log('---');
    console.log(`compress-music: total ${fmtMb(totalIn)} → ${fmtMb(totalOut)}  (saved ${fmtMb(totalIn - totalOut)})`);
}

main();
