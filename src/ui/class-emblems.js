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
        <g class="ce-rotate-slow">
            <polygon points="100,28 130,160 18,72 182,72 70,160" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 3"/>
        </g>
        <circle cx="100" cy="100" r="44" fill="currentColor" fill-opacity="0.16"/>
        <g class="ce-rotate-rev">
            <circle cx="100" cy="100" r="32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 6"/>
        </g>
        <ellipse cx="100" cy="100" rx="34" ry="16" fill="currentColor" fill-opacity="0.32" class="ce-blink"/>
        <circle cx="100" cy="100" r="8" fill="currentColor"/>
        <circle cx="100" cy="100" r="14" fill="none" stroke="currentColor" stroke-width="1" class="ce-pulse-ring"/>
    `,
    bloodstalker: `
        <g class="ce-pulse">
            <path d="M60 62 Q60 36 100 36 Q140 36 140 62 Q140 102 132 112 L132 132 L120 132 L120 144 L110 144 L110 132 L90 132 L90 144 L80 144 L80 132 L68 132 L68 112 Q60 102 60 62 Z" fill="currentColor" fill-opacity="0.35" stroke="currentColor" stroke-width="2"/>
        </g>
        <circle cx="82" cy="84" r="9" fill="#0a0007"/>
        <circle cx="118" cy="84" r="9" fill="#0a0007"/>
        <circle cx="82" cy="84" r="3" fill="currentColor" class="ce-pulse"/>
        <circle cx="118" cy="84" r="3" fill="currentColor" class="ce-pulse"/>
        <path d="M88 110 L94 120 L100 110 L106 120 L112 110" stroke="#0a0007" stroke-width="2" fill="none"/>
        <g class="ce-blood-drip">
            <ellipse cx="80" cy="150" rx="3" ry="7" fill="currentColor"/>
        </g>
        <g class="ce-blood-drip ce-blood-drip-2">
            <ellipse cx="120" cy="155" rx="3" ry="8" fill="currentColor"/>
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
