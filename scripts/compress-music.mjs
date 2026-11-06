// Compress the OGG music library to AAC (.m4a) for the Android APK.
//
// Why: the 5 .ogg files in ./music total ~103 MB at full quality,
// pushing the APK above the 100 MB Play Store warning. AAC at 64 kbps
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
// Existing AAC files are preserved. --force explicitly regenerates them.
// --sfx also creates the small AAC alternatives needed by sample playback.

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync, existsSync, renameSync, rmSync } from 'node:fs';
import { resolve, join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MUSIC_DIR = join(ROOT, 'music');
const AUDIO_DIRS = [MUSIC_DIR, ...(process.argv.includes('--sfx') ? [join(ROOT, 'sfx')] : [])];
const FORCE = process.argv.includes('--force');
for (const argument of process.argv.slice(2)) {
    if (!['--sfx', '--force'].includes(argument)) throw new Error('Unknown audio option: ' + argument);
}

const BITRATE = '64k';
// Override the ffmpeg binary path with the FFMPEG_BIN env var, e.g.
//   FFMPEG_BIN="/c/path/to/ffmpeg.exe" npm run compress:music
// Useful when ffmpeg is bundled with another app (Stacher, OBS,
// VLC, etc.) and you don't want to install a global copy.
const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';
// Existing sources and AAC alternatives are kept even when their sizes
// are similar: browser codec support is independent of compression ratio.

function checkFfmpeg() {
    const r = spawnSync(FFMPEG, ['-version'], { stdio: 'pipe' });
    if (r.error || r.status !== 0) {
        console.error(`compress-music: ffmpeg not found (tried "${FFMPEG}").`);
        console.error('Install from https://ffmpeg.org/download.html, OR set');
        console.error('FFMPEG_BIN to point at an existing ffmpeg.exe and rerun.');
        process.exit(1);
    }
}

function fmtMb(bytes) {
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function compressOne(srcPath) {
    const name = basename(srcPath, extname(srcPath));
    const outPath = join(dirname(srcPath), name + '.m4a');
    const stagedPath = join(dirname(srcPath), name + '.tmp.m4a');
    const inSz = statSync(srcPath).size;
    if (!FORCE && existsSync(outPath)) {
        console.log(`compress-music: preserving existing ${basename(outPath)}`);
        return { kept: true, inSz, outSz: statSync(outPath).size };
    }
    console.log(`compress-music: ${basename(srcPath)} → ${basename(outPath)}`);
    const r = spawnSync(FFMPEG, [
        '-y',
        '-nostdin',
        '-i', srcPath,
        '-c:a', 'aac',
        '-b:a', BITRATE,
        '-threads', '1',
        '-movflags', '+faststart',
        stagedPath,
    ], { stdio: 'inherit' });
    if (r.status !== 0) {
        rmSync(stagedPath, { force: true });
        console.error(`compress-music: ffmpeg failed for ${srcPath}`);
        process.exit(r.status || 1);
    }
    // An interrupted encode must never replace a usable compatibility file
    // or leave a partial sibling that a later build mistakes for success.
    renameSync(stagedPath, outPath);
    const outSz = statSync(outPath).size;
    // AAC is required for codec compatibility even when it saves little
    // space. Never remove a usable alternative because of a size ratio.
    console.log(`  ${fmtMb(inSz)} → ${fmtMb(outSz)}  (saved ${fmtMb(inSz - outSz)})`);
    return { kept: true, inSz, outSz };
}

function main() {
    if (!existsSync(MUSIC_DIR)) {
        console.error(`compress-music: ${MUSIC_DIR} not found`);
        process.exit(1);
    }
    checkFfmpeg();
    const oggs = AUDIO_DIRS.flatMap(directory => readdirSync(directory)
        .filter(f => f.toLowerCase().endsWith('.ogg'))
        .map(f => join(directory, f)));
    if (oggs.length === 0) {
        console.warn('compress-music: no .ogg files in ./music');
        return;
    }
    let totalIn = 0, totalOut = 0;
    for (const src of oggs) {
        const r = compressOne(src);
        totalIn  += r.inSz;
        totalOut += r.outSz;
    }
    console.log('---');
    console.log(`compress-music: total ${fmtMb(totalIn)} → ${fmtMb(totalOut)}  (saved ${fmtMb(totalIn - totalOut)})`);
}

main();
