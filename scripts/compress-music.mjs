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
import { readdirSync, statSync, existsSync, rmSync } from 'node:fs';
import { resolve, join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MUSIC_DIR = join(ROOT, 'music');

const BITRATE = '64k';
// Override the ffmpeg binary path with the FFMPEG_BIN env var, e.g.
//   FFMPEG_BIN="/c/path/to/ffmpeg.exe" npm run compress:music
// Useful when ffmpeg is bundled with another app (Stacher, OBS,
// VLC, etc.) and you don't want to install a global copy.
const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';
// Ratio we'll accept before keeping the AAC output: 0.85 = output
// must be at least 15% smaller than the OGG, otherwise we delete
// the .m4a so the build-www OGG-strip path leaves the original
// alone. Some sources are already low-bitrate Vorbis and AAC at
// the same target ends up bigger — no point shipping a worse copy.
const KEEP_THRESHOLD = 0.85;

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
    console.log(`compress-music: ${basename(srcPath)} → ${basename(outPath)}`);
    const r = spawnSync(FFMPEG, [
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
    if (outSz > inSz * KEEP_THRESHOLD) {
        // The source was already well-compressed; AAC at this bitrate
        // either matches or beats it only marginally. Drop the m4a so
        // the OGG ships alone in the APK.
        rmSync(outPath);
        console.log(`  ${fmtMb(inSz)} → ${fmtMb(outSz)}  (skipped: not enough savings)`);
        return { kept: false, inSz, outSz: inSz };
    }
    console.log(`  ${fmtMb(inSz)} → ${fmtMb(outSz)}  (saved ${fmtMb(inSz - outSz)})`);
    return { kept: true, inSz, outSz };
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
        const r = compressOne(src);
        totalIn  += r.inSz;
        totalOut += r.outSz;
    }
    console.log('---');
    console.log(`compress-music: total ${fmtMb(totalIn)} → ${fmtMb(totalOut)}  (saved ${fmtMb(totalIn - totalOut)})`);
}

main();
