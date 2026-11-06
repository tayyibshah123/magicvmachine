// Animated class emblems — distinct SVG glyphs (one per class) used at
// the centre of the rest-screen "absorb" stage and the main-menu orb.
// Replaces the per-class canvas portrait so the centerpiece is always
// visually anchored where the four particle streams converge.
//
// Each entry has a class-keyed accent colour and an SVG body. The SVG
// uses 200x200 viewBox so it can scale into either host (rest-center is
// clamped to 140-200px; the orb-emblem mounts inside the orb's inner
// region). Animations are driven by CSS classes (.ce-rotate-slow,
// .ce-pulse, .ce-shockwave, etc.) defined in the class-emblems block of
// style.css. Animations honour `body.reduced-motion` via a single
// override block in the same stylesheet.

const PATHS = {
    tactician: `
        <g class="ce-rotate-slow">
            <circle cx="100" cy="100" r="70" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="6 4"/>
            <path d="M100 22 L100 40 M100 160 L100 178 M22 100 L40 100 M160 100 L178 100" stroke="currentColor" stroke-width="3"/>
        </g>
        <g class="ce-rotate-rev">
            <polygon points="100,55 138,77 138,123 100,145 62,123 62,77" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="2"/>
        </g>
        <g class="ce-orbit"><circle cx="100" cy="38" r="4" fill="currentColor"/></g>
        <g class="ce-orbit ce-orbit-rev-2"><circle cx="100" cy="38" r="3" fill="currentColor" fill-opacity="0.7"/></g>
        <circle cx="100" cy="100" r="6" fill="currentColor" class="ce-pulse"/>
        <path d="M85 100 L100 85 L115 100 L100 115 Z" fill="none" stroke="currentColor" stroke-width="1.5" class="ce-pulse"/>
    `,
    arcanist: `
        <!-- v1.9.48 — open spellbook with floating runes orbiting around it.
             Replaces the prior pentagram silhouette to match the v1.9.46
             24x24 dice icon (book + 4 corner runes + eye sigil above). -->
        <g class="ce-rotate-slow">
            <circle cx="100" cy="100" r="88" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 6" stroke-opacity="0.55"/>
        </g>
        <g class="ce-rotate-rev">
            <!-- top rune: triangle -->
            <path d="M100 22 L114 42 L86 42 Z" fill="currentColor" fill-opacity="0.7"/>
            <!-- right rune: hexagon -->
            <path d="M178 100 L172 92 L160 92 L154 100 L160 108 L172 108 Z" fill="currentColor" fill-opacity="0.7"/>
            <!-- bottom rune: cross -->
            <path d="M88 168 L112 168 M100 156 L100 180" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
            <!-- left rune: diamond -->
            <path d="M22 100 L36 86 L50 100 L36 114 Z" fill="currentColor" fill-opacity="0.7"/>
        </g>
        <g class="ce-pulse">
            <!-- open book pages (V-curve with spine) -->
            <path d="M40 70 Q100 50 160 70 L160 130 Q100 110 40 130 Z" fill="currentColor" fill-opacity="0.45" stroke="currentColor" stroke-width="2"/>
            <!-- spine -->
            <path d="M100 60 L100 120" stroke="currentColor" stroke-width="3"/>
            <!-- page lines, left leaf -->
            <path d="M55 84 L92 79 M55 95 L92 90 M55 106 L92 101" stroke="currentColor" stroke-width="1.4" stroke-opacity="0.6" fill="none"/>
            <!-- page lines, right leaf -->
            <path d="M108 79 L145 84 M108 90 L145 95 M108 101 L145 106" stroke="currentColor" stroke-width="1.4" stroke-opacity="0.6" fill="none"/>
        </g>
        <!-- floating eye-sigil rune above the book -->
        <g class="ce-pulse">
            <ellipse cx="100" cy="48" rx="14" ry="6" fill="currentColor" fill-opacity="0.85"/>
            <circle cx="100" cy="48" r="3" fill="#ffffff"/>
        </g>
    `,
    bloodstalker: `
        <!-- v1.9.48 — shark-bite teeth + dripping blood (matches the
             v1.9.46 24x24 dice icon design, scaled to 200x200).
             Replaces the prior cute-skull-with-W-mouth that read as
             a cartoon character at menu / rest-screen size. -->
        <g class="ce-pulse">
            <!-- upper jaw: 5 sharp downward fangs -->
            <path d="M14 24 Q100 8 186 24 L186 60 L168 100 L150 60 L132 100 L114 60 L100 108 L86 60 L68 100 L50 60 L32 100 L14 60 Z" fill="currentColor" stroke="currentColor" stroke-width="2"/>
            <!-- lower jaw: 5 upward fangs offset to interlock with upper -->
            <path d="M14 158 Q100 174 186 158 L186 122 L168 84 L150 122 L132 76 L114 122 L100 76 L86 122 L68 76 L50 122 L32 84 L14 122 Z" fill="currentColor" stroke="currentColor" stroke-width="2"/>
        </g>
        <!-- 3 blood drips. Each is a triangle apex + ellipse bulb so
             it reads as a teardrop. Animation classes stagger via
             delay (default + 1.4s + 0.7s). -->
        <g class="ce-blood-drip">
            <path d="M58 168 L62 178 L54 178 Z" fill="currentColor"/>
            <ellipse cx="58" cy="183" rx="5" ry="7" fill="currentColor"/>
        </g>
        <g class="ce-blood-drip ce-blood-drip-2">
            <path d="M100 172 L104 182 L96 182 Z" fill="currentColor"/>
            <ellipse cx="100" cy="188" rx="6" ry="8" fill="currentColor"/>
        </g>
        <g class="ce-blood-drip ce-blood-drip-3">
            <path d="M142 168 L146 178 L138 178 Z" fill="currentColor"/>
            <ellipse cx="142" cy="183" rx="5" ry="7" fill="currentColor"/>
        </g>
    `,
    annihilator: `
        <g class="ce-shockwave">
            <circle cx="100" cy="100" r="50" fill="none" stroke="currentColor" stroke-width="2"/>
            <circle cx="100" cy="100" r="50" fill="none" stroke="currentColor" stroke-width="2"/>
            <circle cx="100" cy="100" r="50" fill="none" stroke="currentColor" stroke-width="2"/>
        </g>
        <g class="ce-rotate-slow">
            <polygon points="100,30 110,72 154,68 122,98 138,148 100,118 62,148 78,98 46,68 90,72" fill="currentColor" fill-opacity="0.32" stroke="currentColor" stroke-width="1.5"/>
        </g>
        <circle cx="100" cy="100" r="14" fill="currentColor" class="ce-pulse"/>
        <circle cx="100" cy="100" r="6" fill="#fff" class="ce-pulse"/>
    `,
    sentinel: `
        <path d="M100 28 L162 50 L162 112 Q162 162 100 182 Q38 162 38 112 L38 50 Z" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="2.5"/>
        <path d="M100 28 L162 50 L162 112 Q162 162 100 182 Q38 162 38 112 L38 50 Z" fill="none" stroke="currentColor" stroke-width="1.5" class="ce-pulse-ring" style="transform-origin: 100px 105px;"/>
        <path d="M100 56 L100 150 M58 100 L142 100" stroke="currentColor" stroke-width="3"/>
        <circle cx="100" cy="100" r="14" fill="currentColor" fill-opacity="0.4"/>
        <circle cx="100" cy="100" r="6" fill="currentColor" class="ce-pulse"/>
        <g class="ce-rotate-slow">
            <circle cx="100" cy="100" r="36" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 5"/>
        </g>
    `,
    summoner: `
        <g class="ce-pulse">
            <circle cx="100" cy="100" r="38" fill="currentColor" fill-opacity="0.22"/>
        </g>
        <g class="ce-rotate-slow">
            <circle cx="100" cy="40" r="6" fill="currentColor"/>
            <circle cx="160" cy="100" r="4" fill="currentColor" fill-opacity="0.7"/>
            <circle cx="100" cy="160" r="5" fill="currentColor" fill-opacity="0.85"/>
            <circle cx="40" cy="100" r="4" fill="currentColor" fill-opacity="0.7"/>
        </g>
        <g class="ce-rotate-rev">
            <circle cx="60" cy="60" r="3" fill="currentColor" fill-opacity="0.6"/>
            <circle cx="140" cy="60" r="3" fill="currentColor" fill-opacity="0.6"/>
            <circle cx="140" cy="140" r="3" fill="currentColor" fill-opacity="0.6"/>
            <circle cx="60" cy="140" r="3" fill="currentColor" fill-opacity="0.6"/>
        </g>
        <path d="M72 80 Q88 60 100 80 Q112 60 128 80" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M72 120 Q88 140 100 120 Q112 140 128 120" fill="none" stroke="currentColor" stroke-width="2"/>
        <circle cx="100" cy="100" r="10" fill="currentColor" class="ce-pulse"/>
    `,
};

const COLORS = {
    tactician:    '#00f3ff',
    arcanist:     '#bc13fe',
    bloodstalker: '#ff2233',
    annihilator:  '#ff8800',
    sentinel:     '#e6fbff',
    summoner:     '#00ff99',
};

export function getClassEmblemSvg(classId) {
    const id = classId && PATHS[classId] ? classId : 'tactician';
    const color = COLORS[id] || '#00f3ff';
    return `<div class="class-emblem-host" data-class-id="${id}" style="--class-color: ${color};">
        <svg viewBox="0 0 200 200" class="class-emblem class-emblem-${id}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            ${PATHS[id]}
        </svg>
    </div>`;
}
