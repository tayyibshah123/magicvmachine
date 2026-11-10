import { APP_EDITION } from '../version.js';

const W = 900;
const H = 1200;
const PLAY_ROOT = 'https://tayyibshah123.github.io/magicvmachine/';
let activeFallback = null;
let nativeSharePending = false;

function buildPlayUrl({ edition = APP_EDITION, challengeId, gauntletId } = {}) {
    const url = new URL(edition === 'guided' ? 'guided/' : './', PLAY_ROOT);
    if (edition === 'guided' && challengeId) url.searchParams.set('fight', challengeId);
    if (edition === 'stable' && gauntletId) url.searchParams.set('gauntlet', gauntletId);
    return url.href;
}

function safeLink(value) {
    try {
        const url = new URL(value);
        return ['https:', 'http:'].includes(url.protocol) ? url : null;
    } catch (_) { return null; }
}

function resultText(summary, url) {
    const operator = summary.className || 'Operator';
    const sector = summary.sectorLabel || summary.sector || 1;
    let result = summary.win ? `Cleared Sector ${sector}` : `Fell in Sector ${sector}`;
    if (url.searchParams.has('fight')) result = summary.win ? 'Won the First Fight' : 'Attempted the First Fight';
    if (url.searchParams.has('gauntlet')) result = summary.win
        ? 'Cleared the Boss Gauntlet' : `Fell in Sector ${sector} of the Boss Gauntlet`;
    const turns = summary.turns ?? 0;
    const health = url.searchParams.has('fight') && Number.isFinite(summary.hp) && Number.isFinite(summary.maxHp)
        ? ' ' + summary.hp + '/' + summary.maxHp + ' HP remaining.' : '';
    const achievement = summary.achievement ? ` ${summary.achievement}.` : '';
    return `${result} as ${operator} in Magic v Machine. ${turns} ${turns === 1 ? 'turn' : 'turns'}.${health}${achievement}`;
}

function makeElement(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
}

function pngFile(dataUrl) {
    const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), char => char.charCodeAt(0));
    return new File([bytes], 'magic-v-machine-result.png', { type: 'image/png' });
}

function drawBackdrop(ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0a0020');
    grad.addColorStop(0.5, '#1a0035');
    grad.addColorStop(1, '#040010');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // Neon grid floor
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.2)';
    ctx.lineWidth = 1;
    const horizon = H * 0.55;
    for (let x = -200; x < W + 200; x += 60) {
        ctx.beginPath();
        ctx.moveTo(W / 2, horizon);
        ctx.lineTo(x, H);
        ctx.stroke();
    }
    for (let y = horizon; y < H; y += 60) {
        const t = (y - horizon) / (H - horizon);
        ctx.globalAlpha = 0.15 + t * 0.35;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

function drawText(ctx, text, x, y, size, color, font = 'Orbitron', weight = '900') {
    ctx.font = `${weight} ${size}px '${font}', monospace`;
    ctx.textAlign = 'center';
    ctx.lineWidth = Math.max(3, size / 10);
    ctx.strokeStyle = '#000';
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y, W - 80);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.fillText(text, x, y, W - 80);
    ctx.shadowBlur = 0;
}

export const Share = {
    buildPlayUrl,

    async copyLink(url) {
        if (!safeLink(url)) return false;
        try {
            await navigator.clipboard.writeText(url);
            return true;
        } catch (_) { return false; }
    },

    closeFallback() {
        if (!activeFallback) return false;
        const { dialog, previousFocus } = activeFallback;
        activeFallback = null;
        if (dialog.open && typeof dialog.close === 'function') dialog.close();
        dialog.remove();
        if (previousFocus?.isConnected) previousFocus.focus();
        return true;
    },

    showFallback({ url, text, dataUrl } = {}) {
        const link = safeLink(url)?.href || buildPlayUrl();
        this.closeFallback();
        const dialog = makeElement('dialog');
        dialog.id = 'run-share-dialog';
        dialog.setAttribute('aria-labelledby', 'run-share-title');
        dialog.setAttribute('aria-modal', 'true');
        const title = makeElement('h2', text ? 'Share result' : 'Share game link');
        title.id = 'run-share-title';
        dialog.append(title);
        if (text) dialog.append(makeElement('p', text));
        const openLink = makeElement('a', 'Open game link');
        openLink.href = link;
        openLink.target = '_blank';
        openLink.rel = 'noopener';
        const field = makeElement('input');
        field.type = 'url';
        field.value = link;
        field.readOnly = true;
        field.setAttribute('aria-label', 'Game link');
        const status = makeElement('p');
        status.setAttribute('role', 'status');
        const copy = makeElement('button', 'Copy link', 'btn secondary');
        copy.type = 'button';
        copy.onclick = async () => {
            const copied = await this.copyLink(link);
            if (!dialog.isConnected) return;
            if (copied) status.textContent = 'Link copied.';
            else {
                field.focus();
                field.select();
                status.textContent = 'Link selected. Use your device’s copy command.';
            }
        };
        const close = makeElement('button', 'Close', 'btn secondary');
        close.type = 'button';
        close.onclick = () => this.closeFallback();
        dialog.addEventListener('cancel', event => { event.preventDefault(); this.closeFallback(); });
        dialog.append(openLink, field, copy);
        if (dataUrl) {
            const download = makeElement('a', 'Download image', 'btn secondary');
            download.href = dataUrl;
            download.download = 'magic-v-machine-result.png';
            dialog.append(download);
        }
        dialog.append(status, close);
        activeFallback = { dialog, previousFocus: document.activeElement };
        document.body.append(dialog);
        try { dialog.showModal(); } catch (_) { dialog.setAttribute('open', ''); }
        close.focus();
    },

    // Build a data URL for the share image.
    buildDataUrl({ win, className, classColor, sector, sectorLabel, turns, fragments, killName, synergies, operator, achievement, firstFight, hp, maxHp, highestHit }) {
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        drawBackdrop(ctx);

        // Header
        drawText(ctx, 'MAGIC v MACHINE', W / 2, 110, 56, '#00f3ff');
        const outcome = firstFight ? (win ? 'FIGHT WON' : 'FIGHT ENDED') : (win ? 'RUN COMPLETE' : 'RUN ENDED');
        if (operator) {
            drawText(ctx, `OPERATOR ${operator}`, W / 2, 170, 24, '#00f3ff', 'Orbitron', '500');
            drawText(ctx, outcome, W / 2, 210, 36, win ? '#00ff99' : '#ff5566');
        } else {
            drawText(ctx, outcome, W / 2, 180, 36, win ? '#00ff99' : '#ff5566');
        }

        // Class block
        drawText(ctx, (className || 'OPERATOR').toUpperCase(), W / 2, 310, 72, classColor || '#ffd700');
        drawText(ctx, firstFight ? 'FIRST FIGHT' : `SECTOR ${sectorLabel || sector || 1}`, W / 2, 380, 40, '#ffffff');

        // Stat grid
        const statY = 500;
        const drawStat = (label, value, x) => {
            drawText(ctx, label, x, statY, 24, '#88eaff');
            drawText(ctx, String(value), x, statY + 60, 56, '#ffffff');
        };
        if (firstFight) {
            drawStat('TURNS', turns || 0, W * 0.3);
            drawStat('HP LEFT', Number.isFinite(hp) && Number.isFinite(maxHp) ? hp + '/' + maxHp : '', W * 0.7);
        } else {
            drawStat('TURNS', turns || 0, W * 0.2);
            drawStat('FRAGMENTS', fragments || 0, W * 0.4);
            drawStat('TOP HIT', highestHit || 0, W * 0.6);
            drawStat('SYNERGIES', (synergies || []).length, W * 0.8);
        }

        // Footer: the killing blow (or victory banner)
        if (killName) {
            const opponent = firstFight ? killName : win ? `BEAT ${killName}` : `OPPONENT ${killName}`;
            drawText(ctx, opponent, W / 2, 700, 30, '#ff99aa');
        }
        if (achievement) drawText(ctx, achievement, W / 2, 750, 26, '#ffd76a');

        if ((synergies || []).length > 0) {
            ctx.font = '500 24px Rajdhani, sans-serif';
            ctx.fillStyle = '#e0b0ff';
            ctx.textAlign = 'center';
            synergies.slice(0, 4).forEach((s, i) => {
                ctx.fillText(`✦ ${s}`, W / 2, 800 + i * 38);
            });
        }

        // Watermark
        drawText(ctx, 'MvM', W / 2, H - 100, 64, '#ff5eb9');
        drawText(ctx, 'Cyberpunk Roguelite Dice', W / 2, H - 60, 22, '#ffffff', 'Rajdhani', '500');

        return canvas.toDataURL('image/png');
    },

    async shareRun(summary, { url, challengeId, gauntletId } = {}) {
        if (nativeSharePending) return 'busy';
        const requestedLink = challengeId || gauntletId ? buildPlayUrl({ challengeId, gauntletId }) : (url || summary.url);
        const playUrl = safeLink(requestedLink) || new URL(buildPlayUrl());
        const text = resultText(summary, playUrl);
        let dataUrl;
        try { dataUrl = this.buildDataUrl({ ...summary, firstFight: playUrl.searchParams.has('fight') }); } catch (_) {}
        if (typeof navigator.share === 'function') {
            const payload = { title: 'Magic v Machine', text, url: playUrl.href };
            try {
                // Keep the share call in the originating user gesture.
                if (dataUrl && typeof navigator.canShare === 'function') {
                    const files = [pngFile(dataUrl)];
                    if (navigator.canShare({ ...payload, files })) payload.files = files;
                }
            } catch (_) { /* Link and text can still be shared. */ }
            nativeSharePending = true;
            try {
                await navigator.share(payload);
                return 'shared';
            } catch (e) {
                if (e && e.name === 'AbortError') return 'abort';
            } finally { nativeSharePending = false; }
        }
        this.showFallback({ url: playUrl.href, text, dataUrl });
        return 'fallback';
    }
};
