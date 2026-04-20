// Share card generator (§8.3).
// Renders a 3:4 aspect canvas summarising a run and offers a native share
// sheet (iOS/Android PWAs support `navigator.share` with files).

const W = 900;
const H = 1200;

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
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
}

export const Share = {
    // Build a data URL for the share image.
    buildDataUrl({ win, className, classColor, sector, turns, fragments, killName, synergies, operator }) {
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        drawBackdrop(ctx);

        // Header
        drawText(ctx, 'MAGIC v MACHINE', W / 2, 110, 56, '#00f3ff');
        if (operator) {
            drawText(ctx, `OPERATOR ${operator}`, W / 2, 170, 24, '#00f3ff', 'Orbitron', '500');
            drawText(ctx, win ? 'RUN COMPLETE' : 'RUN ENDED', W / 2, 210, 36, win ? '#00ff99' : '#ff5566');
        } else {
            drawText(ctx, win ? 'RUN COMPLETE' : 'RUN ENDED', W / 2, 180, 36, win ? '#00ff99' : '#ff5566');
        }

        // Class block
        drawText(ctx, (className || 'OPERATOR').toUpperCase(), W / 2, 310, 72, classColor || '#ffd700');
        drawText(ctx, `SECTOR ${sector || 1}`, W / 2, 380, 40, '#ffffff');

        // Stat grid
        const statY = 500;
        const drawStat = (label, value, x) => {
            drawText(ctx, label, x, statY, 24, '#88eaff');
            drawText(ctx, String(value), x, statY + 60, 56, '#ffffff');
        };
        drawStat('TURNS', turns || 0, W * 0.25);
        drawStat('FRAGMENTS', fragments || 0, W * 0.5);
        drawStat('SYNERGIES', (synergies || []).length, W * 0.75);

        // Footer: the killing blow (or victory banner)
        if (killName) {
            drawText(ctx, win ? `FINAL: ${killName}` : `FELL TO ${killName}`, W / 2, 700, 30, '#ff99aa');
        }

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

    // Open the native share sheet with the generated image.
    async shareRun(summary) {
        const dataUrl = this.buildDataUrl(summary);
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], 'mvm-run.png', { type: 'image/png' });
        const text = `${summary.win ? 'Cleared' : 'Fell on'} Sector ${summary.sector} as ${summary.className || 'Operator'} in Magic v Machine!`;
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({ files: [file], text });
                return 'shared';
            } catch (e) {
                if (e && e.name === 'AbortError') return 'abort';
                return 'error';
            }
        }
        // Fallback: open the data URL in a new tab so the user can save/screenshot.
        try {
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            return 'fallback';
        } catch (e) {
            return 'error';
        }
    }
};
