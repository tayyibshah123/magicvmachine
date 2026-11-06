// Inline SVG illustrations for the event screen.
//
// Each event in EVENTS_DB carries an `art` key (e.g. 'medbay',
// 'relic-shrine'). This module maps that key to a chunk of SVG markup
// that the event screen drops into the hero slot. Same idea for
// per-option `icon` keys — small inline SVGs that sit next to the
// label.
//
// All art is hand-rolled SVG (no external assets) so the build stays
// self-contained and the illustrations scale crisp at any DPI. CSS
// classes attached to elements drive entrance + idle animations
// (defined in style.css under .event-art-*).

// ========== HERO ILLUSTRATIONS (200×200 viewBox) ==========

// Medbay — surgical arm + healing arc + pulsing red cross.
const ART_MEDBAY = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="event-art event-art-medbay" aria-hidden="true">
    <defs>
        <radialGradient id="med-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#5ad864" stop-opacity="0.6"/>
            <stop offset="100%" stop-color="#5ad864" stop-opacity="0"/>
        </radialGradient>
    </defs>
    <circle cx="100" cy="105" r="80" fill="url(#med-glow)" class="event-art-pulse-bg"/>
    <!-- Surgical arm -->
    <g class="event-art-medbay-arm">
        <line x1="100" y1="20" x2="100" y2="80" stroke="#88eaff" stroke-width="3" opacity="0.6"/>
        <circle cx="100" cy="20" r="6" fill="#88eaff" stroke="#fff" stroke-width="1.5"/>
        <line x1="100" y1="80" x2="70" y2="105" stroke="#88eaff" stroke-width="3" opacity="0.6"/>
        <circle cx="100" cy="80" r="4" fill="#88eaff"/>
        <circle cx="70" cy="105" r="5" fill="#5ad864" stroke="#fff" stroke-width="1.5" class="event-art-pulse"/>
    </g>
    <!-- Patient bed silhouette -->
    <rect x="40" y="135" width="120" height="10" rx="2" fill="#1a2030" stroke="#3a4050"/>
    <rect x="50" y="125" width="100" height="12" rx="6" fill="#2a3040" stroke="#5ad864" stroke-width="1" opacity="0.7"/>
    <!-- Pulsing cross -->
    <g class="event-art-medbay-cross" transform="translate(140, 50)">
        <circle r="18" fill="#220015" stroke="#ff4470" stroke-width="2"/>
        <rect x="-3" y="-10" width="6" height="20" fill="#ff4470"/>
        <rect x="-10" y="-3" width="20" height="6" fill="#ff4470"/>
    </g>
    <!-- EKG line -->
    <polyline points="20,170 50,170 55,160 60,180 65,150 70,170 100,170 105,165 110,175 115,170 180,170"
              stroke="#5ad864" stroke-width="1.5" fill="none" opacity="0.7" class="event-art-ekg"/>
</svg>`;

// Relic shrine — floating artifact with orbiting sparks.
const ART_RELIC_SHRINE = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="event-art event-art-shrine" aria-hidden="true">
    <defs>
        <radialGradient id="shrine-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#ffd76a" stop-opacity="0.55"/>
            <stop offset="100%" stop-color="#ffd76a" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="shrine-gem" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ffe599"/>
            <stop offset="50%" stop-color="#ffd76a"/>
            <stop offset="100%" stop-color="#b8860b"/>
        </linearGradient>
    </defs>
    <circle cx="100" cy="100" r="85" fill="url(#shrine-glow)" class="event-art-pulse-bg"/>
    <!-- Pedestal -->
    <polygon points="60,170 140,170 130,150 70,150" fill="#1a1430" stroke="#5a4880" stroke-width="1.5"/>
    <rect x="65" y="145" width="70" height="6" fill="#2a2040" stroke="#5a4880"/>
    <!-- Floating gem -->
    <g class="event-art-shrine-gem" transform="translate(100, 90)">
        <polygon points="0,-30 22,-10 18,18 -18,18 -22,-10" fill="url(#shrine-gem)" stroke="#ffd76a" stroke-width="2"/>
        <polygon points="0,-30 22,-10 0,-5" fill="rgba(255,255,255,0.3)"/>
        <line x1="0" y1="-30" x2="0" y2="18" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
    </g>
    <!-- Orbiting sparks -->
    <g class="event-art-shrine-orbit">
        <circle cx="160" cy="100" r="3" fill="#fff"/>
        <circle cx="40" cy="100" r="2" fill="#ffd76a"/>
        <circle cx="100" cy="40" r="2" fill="#ffd76a"/>
    </g>
</svg>`;

// Merchant drone — hovering bot with goods slot.
const ART_MERCHANT = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="event-art event-art-merchant" aria-hidden="true">
    <defs>
        <radialGradient id="mer-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#00f3ff" stop-opacity="0.4"/>
            <stop offset="100%" stop-color="#00f3ff" stop-opacity="0"/>
        </radialGradient>
    </defs>
    <circle cx="100" cy="90" r="80" fill="url(#mer-glow)" class="event-art-pulse-bg"/>
    <g class="event-art-merchant-drone">
        <!-- Body -->
        <ellipse cx="100" cy="90" rx="40" ry="28" fill="#1a2540" stroke="#00f3ff" stroke-width="2"/>
        <ellipse cx="100" cy="86" rx="35" ry="22" fill="none" stroke="rgba(0,243,255,0.5)" stroke-width="1"/>
        <!-- Eye -->
        <circle cx="100" cy="86" r="8" fill="#00f3ff" opacity="0.8" class="event-art-pulse"/>
        <circle cx="100" cy="86" r="3" fill="#fff"/>
        <!-- Antennae -->
        <line x1="80" y1="65" x2="75" y2="50" stroke="#00f3ff" stroke-width="1.5"/>
        <line x1="120" y1="65" x2="125" y2="50" stroke="#00f3ff" stroke-width="1.5"/>
        <circle cx="75" cy="50" r="2" fill="#ffd76a"/>
        <circle cx="125" cy="50" r="2" fill="#ffd76a"/>
        <!-- Cargo box hanging below -->
        <line x1="100" y1="118" x2="100" y2="135" stroke="#888" stroke-width="1"/>
        <rect x="85" y="135" width="30" height="22" fill="#2a3040" stroke="#ffd76a" stroke-width="1.5"/>
        <text x="100" y="150" text-anchor="middle" font-family="Orbitron" font-size="10" fill="#ffd76a">$</text>
    </g>
</svg>`;

// Mana conduit — broken pipe leaking energy.
const ART_CONDUIT = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="event-art event-art-conduit" aria-hidden="true">
    <defs>
        <radialGradient id="con-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#bc13fe" stop-opacity="0.5"/>
            <stop offset="100%" stop-color="#bc13fe" stop-opacity="0"/>
        </radialGradient>
    </defs>
    <circle cx="100" cy="100" r="85" fill="url(#con-glow)" class="event-art-pulse-bg"/>
    <!-- Broken pipe -->
    <rect x="20" y="100" width="60" height="20" fill="#1a2030" stroke="#5a6080" stroke-width="2"/>
    <rect x="120" y="100" width="60" height="20" fill="#1a2030" stroke="#5a6080" stroke-width="2"/>
    <!-- Jagged break edges -->
    <polygon points="80,100 85,95 90,105 95,98 100,108 95,115 85,118 80,120" fill="#1a2030" stroke="#bc13fe" stroke-width="1.5"/>
    <polygon points="120,100 115,95 110,105 105,98 100,108 105,115 115,118 120,120" fill="#1a2030" stroke="#bc13fe" stroke-width="1.5"/>
    <!-- Energy leak -->
    <g class="event-art-conduit-spark">
        <line x1="95" y1="110" x2="100" y2="60" stroke="#bc13fe" stroke-width="2" opacity="0.8"/>
        <line x1="105" y1="110" x2="103" y2="50" stroke="#d66bff" stroke-width="1.5" opacity="0.7"/>
        <line x1="100" y1="110" x2="98" y2="40" stroke="#fff" stroke-width="1" opacity="0.9"/>
        <circle cx="100" cy="50" r="3" fill="#fff"/>
        <circle cx="100" cy="65" r="2" fill="#bc13fe"/>
        <circle cx="100" cy="80" r="2" fill="#d66bff"/>
    </g>
    <!-- Ground sparks -->
    <circle cx="80" cy="135" r="2" fill="#bc13fe" class="event-art-pulse"/>
    <circle cx="120" cy="135" r="2" fill="#bc13fe" class="event-art-pulse"/>
</svg>`;

// Combat trial — holographic target dummy.
const ART_COMBAT_TRIAL = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="event-art event-art-trial" aria-hidden="true">
    <defs>
        <radialGradient id="trial-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#ff5b87" stop-opacity="0.45"/>
            <stop offset="100%" stop-color="#ff5b87" stop-opacity="0"/>
        </radialGradient>
    </defs>
    <circle cx="100" cy="100" r="85" fill="url(#trial-glow)" class="event-art-pulse-bg"/>
    <!-- Holo dummy silhouette -->
    <g class="event-art-trial-dummy" stroke="#ff5b87" stroke-width="2" fill="rgba(255, 91, 135, 0.15)">
        <!-- Head -->
        <circle cx="100" cy="55" r="14"/>
        <!-- Body -->
        <rect x="80" y="70" width="40" height="55" rx="4"/>
        <!-- Arms -->
        <rect x="62" y="75" width="14" height="40" rx="3"/>
        <rect x="124" y="75" width="14" height="40" rx="3"/>
        <!-- Legs -->
        <rect x="83" y="125" width="14" height="40" rx="3"/>
        <rect x="103" y="125" width="14" height="40" rx="3"/>
    </g>
    <!-- Targeting reticle -->
    <g class="event-art-trial-reticle" transform="translate(100, 95)">
        <circle r="35" fill="none" stroke="#ffd76a" stroke-width="1" opacity="0.7"/>
        <circle r="22" fill="none" stroke="#ffd76a" stroke-width="1" opacity="0.5"/>
        <line x1="-40" y1="0" x2="-25" y2="0" stroke="#ffd76a" stroke-width="2"/>
        <line x1="25" y1="0" x2="40" y2="0" stroke="#ffd76a" stroke-width="2"/>
        <line x1="0" y1="-40" x2="0" y2="-25" stroke="#ffd76a" stroke-width="2"/>
        <line x1="0" y1="25" x2="0" y2="40" stroke="#ffd76a" stroke-width="2"/>
    </g>
    <!-- Holo flicker scan lines -->
    <line x1="60" y1="80" x2="140" y2="80" stroke="rgba(255,91,135,0.3)" stroke-width="1"/>
    <line x1="60" y1="120" x2="140" y2="120" stroke="rgba(255,91,135,0.3)" stroke-width="1"/>
</svg>`;

// Corrupt gift — red-taped crate with dripping anomaly.
const ART_CORRUPT_GIFT = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="event-art event-art-corrupt" aria-hidden="true">
    <defs>
        <radialGradient id="cor-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#ff0055" stop-opacity="0.5"/>
            <stop offset="100%" stop-color="#ff0055" stop-opacity="0"/>
        </radialGradient>
    </defs>
    <circle cx="100" cy="105" r="80" fill="url(#cor-glow)" class="event-art-pulse-bg"/>
    <!-- Crate -->
    <g class="event-art-corrupt-crate">
        <rect x="55" y="80" width="90" height="80" fill="#1a0d20" stroke="#5a3050" stroke-width="2"/>
        <line x1="55" y1="120" x2="145" y2="120" stroke="#5a3050" stroke-width="1.5"/>
        <line x1="100" y1="80" x2="100" y2="160" stroke="#5a3050" stroke-width="1.5"/>
        <!-- Red tape -->
        <rect x="50" y="115" width="100" height="14" fill="#ff0055" opacity="0.85"/>
        <text x="100" y="125" text-anchor="middle" font-family="Orbitron" font-size="8" fill="#000" font-weight="900">QUARANTINED</text>
        <!-- Lock -->
        <rect x="92" y="138" width="16" height="14" fill="#3a2030" stroke="#ff0055" stroke-width="1"/>
        <circle cx="100" cy="135" r="6" fill="none" stroke="#ff0055" stroke-width="1.5"/>
    </g>
    <!-- Glitch sparks -->
    <g class="event-art-corrupt-glitch">
        <rect x="65" y="60" width="6" height="2" fill="#ff0055"/>
        <rect x="120" y="55" width="10" height="2" fill="#ff0055"/>
        <rect x="80" y="50" width="4" height="2" fill="#bc13fe"/>
        <rect x="140" y="70" width="8" height="2" fill="#bc13fe"/>
    </g>
</svg>`;

// Memory shard — floating glass crystal with text fragments.
const ART_MEMORY_SHARD = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="event-art event-art-shard" aria-hidden="true">
    <defs>
        <radialGradient id="mem-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#88eaff" stop-opacity="0.5"/>
            <stop offset="100%" stop-color="#88eaff" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="mem-shard" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#aaf0ff"/>
            <stop offset="50%" stop-color="#88eaff" stop-opacity="0.8"/>
            <stop offset="100%" stop-color="#0088aa" stop-opacity="0.4"/>
        </linearGradient>
    </defs>
    <circle cx="100" cy="100" r="80" fill="url(#mem-glow)" class="event-art-pulse-bg"/>
    <!-- Shard -->
    <g class="event-art-shard-float">
        <polygon points="100,40 130,90 115,150 85,150 70,90"
                 fill="url(#mem-shard)" stroke="#aaf0ff" stroke-width="2"/>
        <polygon points="100,40 130,90 100,80" fill="rgba(255,255,255,0.4)"/>
        <line x1="100" y1="40" x2="100" y2="150" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
    </g>
    <!-- Code fragments orbiting -->
    <g class="event-art-shard-orbit" font-family="Orbitron" font-size="6" fill="#88eaff">
        <text x="40" y="60">01_ATK</text>
        <text x="150" y="80">EXEC</text>
        <text x="35" y="160">RUN.42</text>
        <text x="155" y="150">IDX++</text>
    </g>
</svg>`;

// Beacon — antenna with pulsing radio waves.
const ART_BEACON = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="event-art event-art-beacon" aria-hidden="true">
    <defs>
        <radialGradient id="bea-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#ffd76a" stop-opacity="0.45"/>
            <stop offset="100%" stop-color="#ffd76a" stop-opacity="0"/>
        </radialGradient>
    </defs>
    <circle cx="100" cy="120" r="80" fill="url(#bea-glow)" class="event-art-pulse-bg"/>
    <!-- Tower -->
    <polygon points="100,60 90,160 110,160" fill="#1a2030" stroke="#88aaff" stroke-width="2"/>
    <line x1="92" y1="90" x2="108" y2="90" stroke="#5a6080"/>
    <line x1="91" y1="120" x2="109" y2="120" stroke="#5a6080"/>
    <line x1="90" y1="150" x2="110" y2="150" stroke="#5a6080"/>
    <!-- Top light -->
    <circle cx="100" cy="60" r="6" fill="#ffd76a" class="event-art-pulse" stroke="#fff" stroke-width="1"/>
    <!-- Radio waves -->
    <g class="event-art-beacon-waves" fill="none" stroke="#ffd76a" stroke-width="1.5">
        <path d="M 70,60 Q 100,40 130,60" opacity="0.6"/>
        <path d="M 55,60 Q 100,30 145,60" opacity="0.45"/>
        <path d="M 40,60 Q 100,15 160,60" opacity="0.3"/>
    </g>
</svg>`;

// Sentry — inactive turret to repurpose.
const ART_SENTRY = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="event-art event-art-sentry" aria-hidden="true">
    <defs>
        <radialGradient id="sen-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#5ad864" stop-opacity="0.4"/>
            <stop offset="100%" stop-color="#5ad864" stop-opacity="0"/>
        </radialGradient>
    </defs>
    <circle cx="100" cy="105" r="80" fill="url(#sen-glow)" class="event-art-pulse-bg"/>
    <!-- Base -->
    <polygon points="60,160 140,160 130,140 70,140" fill="#1a2030" stroke="#5a6080"/>
    <!-- Stem -->
    <rect x="92" y="100" width="16" height="40" fill="#2a3040" stroke="#5a6080"/>
    <!-- Turret head -->
    <g class="event-art-sentry-head">
        <ellipse cx="100" cy="90" rx="32" ry="22" fill="#1a2540" stroke="#5ad864" stroke-width="2"/>
        <!-- Eye -->
        <circle cx="100" cy="90" r="8" fill="#5ad864" opacity="0.7" class="event-art-pulse"/>
        <circle cx="100" cy="90" r="3" fill="#fff"/>
        <!-- Barrel -->
        <rect x="125" y="86" width="22" height="8" fill="#2a3040" stroke="#5ad864"/>
        <circle cx="147" cy="90" r="4" fill="#1a0a0a" stroke="#5ad864"/>
    </g>
</svg>`;

// Mirror obelisk — reflective glass with player echo.
const ART_OBELISK = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="event-art event-art-obelisk" aria-hidden="true">
    <defs>
        <radialGradient id="ob-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#88eaff" stop-opacity="0.4"/>
            <stop offset="100%" stop-color="#88eaff" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="ob-mirror" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="rgba(170,240,255,0.2)"/>
            <stop offset="50%" stop-color="rgba(255,255,255,0.5)"/>
            <stop offset="100%" stop-color="rgba(0,80,120,0.4)"/>
        </linearGradient>
    </defs>
    <circle cx="100" cy="100" r="85" fill="url(#ob-glow)" class="event-art-pulse-bg"/>
    <!-- Obelisk body -->
    <polygon points="80,30 120,30 125,170 75,170" fill="url(#ob-mirror)" stroke="#aaf0ff" stroke-width="2"/>
    <line x1="100" y1="30" x2="100" y2="170" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
    <!-- Reflection: smaller silhouette inside -->
    <g class="event-art-obelisk-echo" opacity="0.7">
        <circle cx="100" cy="80" r="6" fill="#aaf0ff"/>
        <rect x="92" y="86" width="16" height="22" rx="2" fill="#aaf0ff"/>
    </g>
    <!-- Cracks -->
    <line x1="85" y1="60" x2="95" y2="100" stroke="rgba(255,255,255,0.4)" stroke-width="0.5"/>
    <line x1="115" y1="80" x2="105" y2="130" stroke="rgba(255,255,255,0.4)" stroke-width="0.5"/>
</svg>`;

// Generic "anomaly" fallback — swirling cyber glyph.
const ART_GLITCH = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="event-art event-art-glitch" aria-hidden="true">
    <defs>
        <radialGradient id="gl-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#bc13fe" stop-opacity="0.5"/>
            <stop offset="100%" stop-color="#bc13fe" stop-opacity="0"/>
        </radialGradient>
    </defs>
    <circle cx="100" cy="100" r="85" fill="url(#gl-glow)" class="event-art-pulse-bg"/>
    <g class="event-art-glitch-spin" transform-origin="100 100">
        <polygon points="100,40 130,80 100,120 70,80" fill="none" stroke="#bc13fe" stroke-width="2"/>
        <polygon points="100,80 140,100 100,120 60,100" fill="none" stroke="#ff00aa" stroke-width="2" opacity="0.7"/>
        <polygon points="100,60 120,100 100,140 80,100" fill="none" stroke="#00f3ff" stroke-width="1.5" opacity="0.5"/>
    </g>
    <circle cx="100" cy="100" r="5" fill="#fff" class="event-art-pulse"/>
</svg>`;

// Server / data terminal — for "scavenge" / data-broker style events.
const ART_DATA_VAULT = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="event-art event-art-vault" aria-hidden="true">
    <defs>
        <radialGradient id="vau-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#00f3ff" stop-opacity="0.45"/>
            <stop offset="100%" stop-color="#00f3ff" stop-opacity="0"/>
        </radialGradient>
    </defs>
    <circle cx="100" cy="100" r="85" fill="url(#vau-glow)" class="event-art-pulse-bg"/>
    <!-- Server rack -->
    <rect x="55" y="50" width="90" height="120" fill="#0a1020" stroke="#00f3ff" stroke-width="2"/>
    <!-- Slots -->
    <g class="event-art-vault-slots">
        <rect x="62" y="60" width="76" height="14" fill="#1a2540" stroke="#3a5080"/>
        <circle cx="130" cy="67" r="2" fill="#5ad864" class="event-art-pulse"/>
        <rect x="62" y="80" width="76" height="14" fill="#1a2540" stroke="#3a5080"/>
        <circle cx="130" cy="87" r="2" fill="#5ad864" class="event-art-pulse"/>
        <rect x="62" y="100" width="76" height="14" fill="#1a2540" stroke="#3a5080"/>
        <circle cx="130" cy="107" r="2" fill="#ffd76a"/>
        <rect x="62" y="120" width="76" height="14" fill="#1a2540" stroke="#3a5080"/>
        <circle cx="130" cy="127" r="2" fill="#ff5b87"/>
        <rect x="62" y="140" width="76" height="14" fill="#1a2540" stroke="#3a5080"/>
        <circle cx="130" cy="147" r="2" fill="#5ad864" class="event-art-pulse"/>
    </g>
    <!-- Status row -->
    <text x="68" y="72" font-family="Orbitron" font-size="6" fill="#00f3ff">::CACHE.OK</text>
    <text x="68" y="92" font-family="Orbitron" font-size="6" fill="#00f3ff">::IDX.RDY</text>
</svg>`;

// Frozen lattice — crystallised circuit (cold/freeze events).
const ART_FROZEN = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="event-art event-art-frozen" aria-hidden="true">
    <defs>
        <radialGradient id="fro-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#aaf0ff" stop-opacity="0.5"/>
            <stop offset="100%" stop-color="#aaf0ff" stop-opacity="0"/>
        </radialGradient>
    </defs>
    <circle cx="100" cy="100" r="85" fill="url(#fro-glow)" class="event-art-pulse-bg"/>
    <!-- Snowflake / lattice -->
    <g stroke="#aaf0ff" stroke-width="2" fill="none" class="event-art-frozen-spin" transform-origin="100 100">
        <line x1="100" y1="40" x2="100" y2="160"/>
        <line x1="40" y1="100" x2="160" y2="100"/>
        <line x1="58" y1="58" x2="142" y2="142"/>
        <line x1="58" y1="142" x2="142" y2="58"/>
        <!-- Branch tips -->
        <polyline points="100,40 95,50 100,55 105,50 100,40"/>
        <polyline points="100,160 95,150 100,145 105,150 100,160"/>
        <polyline points="40,100 50,95 55,100 50,105 40,100"/>
        <polyline points="160,100 150,95 145,100 150,105 160,100"/>
    </g>
    <circle cx="100" cy="100" r="5" fill="#aaf0ff"/>
</svg>`;

// Map: art key → SVG markup.
const HERO_MAP = {
    medbay:        ART_MEDBAY,
    'relic-shrine': ART_RELIC_SHRINE,
    merchant:      ART_MERCHANT,
    conduit:       ART_CONDUIT,
    'combat-trial': ART_COMBAT_TRIAL,
    'corrupt-gift': ART_CORRUPT_GIFT,
    'memory-shard': ART_MEMORY_SHARD,
    beacon:        ART_BEACON,
    sentry:        ART_SENTRY,
    obelisk:       ART_OBELISK,
    glitch:        ART_GLITCH,
    'data-vault':  ART_DATA_VAULT,
    frozen:        ART_FROZEN,
};

export function getEventArt(key) {
    return HERO_MAP[key] || ART_GLITCH;
}

// ========== OPTION ICONS (24×24 viewBox) ==========
// Tiny inline SVGs that sit at the start of each option button. Each
// is a single shape so they read at 18-22px without becoming muddy.

const ICON_DEFS = {
    'heart-burst':  '<path d="M12 21s-7-4.35-7-10a4.5 4.5 0 0 1 8-2.85A4.5 4.5 0 0 1 19 11c0 5.65-7 10-7 10z" fill="currentColor" opacity="0.9"/><path d="M12 4v8m-3-3h6" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>',
    'bandage':      '<rect x="3" y="9" width="18" height="6" rx="2" fill="currentColor" opacity="0.85"/><circle cx="8" cy="12" r="1" fill="#fff"/><circle cx="12" cy="12" r="1" fill="#fff"/><circle cx="16" cy="12" r="1" fill="#fff"/>',
    'walk-away':    '<path d="M5 19l4-7 4 4 5-8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="5" r="2" fill="currentColor"/>',
    'gem':          '<polygon points="12,3 19,9 15,21 9,21 5,9" fill="currentColor" stroke="#fff" stroke-width="1"/><polygon points="12,3 19,9 12,9" fill="rgba(255,255,255,0.3)"/>',
    'coin-stack':   '<ellipse cx="12" cy="7" rx="7" ry="2.5" fill="currentColor"/><path d="M5 7v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V7" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M5 11v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    'sword':        '<path d="M6 18l8-8 4 4-8 8H6v-4z" fill="currentColor"/><line x1="14" y1="10" x2="20" y2="4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
    'fist':         '<path d="M6 10v6a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-7l-2-2-2 2v-3l-2-2-2 2v-2l-2-2-2 2v6z" fill="currentColor"/>',
    'eye':          '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
    'spark':        '<polygon points="12,2 14,10 22,12 14,14 12,22 10,14 2,12 10,10" fill="currentColor"/>',
    'shield':       '<path d="M12 2L4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z" fill="currentColor" opacity="0.85"/><path d="M9 12l2 2 4-4" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    'skull':        '<path d="M12 3a7 7 0 0 0-7 7v3l2 2v3h2v-2h2v2h2v-2h2v2h2v-3l2-2v-3a7 7 0 0 0-7-7z" fill="currentColor"/><circle cx="9" cy="11" r="1.5" fill="#000"/><circle cx="15" cy="11" r="1.5" fill="#000"/>',
    'mana-drop':    '<path d="M12 3c-3 5-6 8-6 12a6 6 0 0 0 12 0c0-4-3-7-6-12z" fill="currentColor"/><circle cx="10" cy="14" r="1.5" fill="rgba(255,255,255,0.7)"/>',
    'minion':       '<rect x="6" y="8" width="12" height="10" rx="2" fill="currentColor"/><circle cx="9" cy="12" r="1.2" fill="#fff"/><circle cx="15" cy="12" r="1.2" fill="#fff"/><line x1="8" y1="8" x2="6" y2="4" stroke="currentColor" stroke-width="1.5"/><line x1="16" y1="8" x2="18" y2="4" stroke="currentColor" stroke-width="1.5"/>',
    'star':         '<polygon points="12,3 15,10 22,10 16,14 18,21 12,17 6,21 8,14 2,10 9,10" fill="currentColor"/>',
    'cross':        '<path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
    'gear':         '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    'dice':         '<rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
};

export function getOptionIcon(key, color) {
    const def = ICON_DEFS[key];
    if (!def) return '';
    const c = color || 'currentColor';
    return `<svg viewBox="0 0 24 24" class="event-option-icon" aria-hidden="true" style="color:${c}">${def}</svg>`;
}

// Exposed for tests + future "preview" UIs that want to enumerate.
export const EVENT_ART_KEYS = Object.keys(HERO_MAP);
export const EVENT_ICON_KEYS = Object.keys(ICON_DEFS);
