// Offscreen canvas cache for static backdrop layers (§11.2).
// The boss backdrops draw a lot of per-frame strokes. Parts of each scene
// are effectively static once positioned (prison-tower silhouettes, hive
// cells, lava pool silhouette). We bake those to an OffscreenCanvas once
// and blit it each frame — eliminates per-frame path-construction cost.
//
// Usage:
//    const bg = CanvasCache.get('panopticon-towers', 1080, 1920, drawFn);
//    ctx.drawImage(bg, 0, 0);
//
// drawFn(ctx, w, h) populates the offscreen canvas. The function is only
// run when the cache entry is missing. Call CanvasCache.invalidate(key)
// to force a re-bake.

const _entries = new Map();

function _createCanvas(w, h) {
    if (typeof OffscreenCanvas === 'function') {
        try { return new OffscreenCanvas(w, h); } catch (e) { /* fall through */ }
    }
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
}

export const CanvasCache = {
    get(key, w, h, drawFn) {
        let entry = _entries.get(key);
        if (!entry || entry.w !== w || entry.h !== h) {
            const c = _createCanvas(w, h);
            const ctx = c.getContext('2d');
            drawFn(ctx, w, h);
            entry = { canvas: c, w, h };
            _entries.set(key, entry);
        }
        return entry.canvas;
    },

    invalidate(key) {
        if (key == null) { _entries.clear(); return; }
        _entries.delete(key);
    },

    // Best-effort size estimate for internal diagnostics.
    size() {
        let bytes = 0;
        for (const { w, h } of _entries.values()) bytes += w * h * 4;
        return bytes;
    }
};
