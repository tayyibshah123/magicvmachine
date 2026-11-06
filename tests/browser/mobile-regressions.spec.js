import { test, expect } from './fixtures.js';
import { openGame, configureEncounter, tap, dragDie } from './game-driver.js';
import { STATE } from '../../src/constants.js';

test('all six class controls leave every die reachable at narrow phone widths', async ({ page }, testInfo) => {
  test.setTimeout(180000);
  await openGame(page, { returning: true });
  const measurements = [];
  for (const { width, accessible = false } of [{ width: 360 }, { width: 390 }, { width: 414 }, { width: 360, accessible: true }]) {
    const height = accessible ? 800 : 844;
    await page.setViewportSize({ width, height });
    if (accessible) await page.evaluate(() => {
      for (const [id, value] of [['chk-large-touch', true], ['sel-handedness', 'left'], ['sld-text-scale', '140']]) {
        const element = document.getElementById(id);
        if (typeof value === 'boolean') element.checked = value;
        else element.value = value;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    for (const classId of ['tactician', 'sentinel', 'arcanist', 'summoner', 'bloodstalker', 'annihilator']) {
      await configureEncounter(page, { classId, autoQTE: true });
      for (const hand of (accessible ? [6, 8] : [3, 4, 5, 6, 8])) {
        await page.evaluate(hand => {
          Game.dicePool = Array.from({ length: hand }, (_, id) => ({ id,
            type: id % 2 ? 'TAC_DEFEND' : 'TAC_ATTACK', used: false, selected: false }));
          Game.renderDiceUI();
        }, hand);
        await page.waitForFunction(() => [...document.querySelectorAll('#dice-container .die')]
          .every(el => !el.classList.contains('die-entering') && Number(getComputedStyle(el).opacity) > 0.99));
        const result = await page.evaluate(() => {
          const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
          return {
            dice: [...document.querySelectorAll('#dice-container .die')].map(el => {
              const r = rect(el), top = document.elementFromPoint(r.x + r.w / 2, r.y + r.h / 2);
              return { ...r, reachable: el === top || el.contains(top) };
            }),
            controls: [...document.querySelectorAll('#btn-reroll, #btn-end-turn, #class-ability-widget button')]
              .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
              .map(el => ({ id: el.id || el.dataset.action, ...rect(el) }))
          };
        });
        measurements.push({ width, height, accessible, classId, hand, ...result });
        expect(result.dice, `${classId} hand ${hand} at ${width}px`).toHaveLength(hand);
        for (const die of result.dice) {
          expect(die.reachable, JSON.stringify({ width, classId, hand, die })).toBe(true);
          expect(die.x).toBeGreaterThanOrEqual(-1);
          expect(die.x + die.w).toBeLessThanOrEqual(width + 1);
          expect(die.y + die.h).toBeLessThanOrEqual(height + 1);
        }
        for (const control of result.controls) {
          expect(control.w, JSON.stringify(control)).toBeGreaterThanOrEqual(43.5);
          expect(control.h, JSON.stringify(control)).toBeGreaterThanOrEqual(43.5);
        }
        if ((width === 390 || accessible) && hand === 6) {
          await testInfo.attach(classId + (accessible ? '-accessible' : '') + '-phone-combat', { body: await page.screenshot(), contentType: 'image/png' });
        }
        if (width === 360 && !accessible && hand === 6) {
          for (const id of [0, 5]) {
            if (classId === 'annihilator') {
              // This class deliberately disables selection without rerolls.
              // Verify the same edge dice through their actual drag action.
              await dragDie(page, id, id === 0 ? 'enemy' : 'player');
              await expect.poll(() => page.evaluate(id => Game.dicePool.find(d => d.id === id).used, id)).toBe(true);
              await expect.poll(() => page.evaluate(() => !Game.qte?.active && !Game.inputLocked
                && !(Game._combatActionDepth || 0) && Game.inputCooldown <= 0)).toBe(true);
            } else {
              const die = result.dice[id];
              await page.touchscreen.tap(die.x + die.w / 2, die.y + die.h / 2);
              await expect.poll(() => page.evaluate(id => Game.dicePool.find(d => d.id === id).selected, id)).toBe(true);
            }
          }
        }
      }
    }
  }
  expect(measurements).toHaveLength(102);
  await testInfo.attach('102-phone-class-hand-layouts', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
});

test('native save and return preserves a combat checkpoint and abandon requires confirmation', async ({ page }) => {
  await openGame(page, { returning: true });
  await configureEncounter(page, { classId: 'sentinel', hp: 57, enemyHp: 100 });
  await page.evaluate(() => { Game.techFragments = 23; Game.saveGame(); });
  await tap(page, '#btn-settings');
  await expect(page.locator('#modal-settings')).toBeVisible();
  await tap(page, '#btn-quit');
  await expect(page.locator('#screen-start')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(Game._readSaveRaw()).player.hp)).toBe(57);
  await tap(page, '#btn-load-save');
  await expect.poll(() => page.evaluate(() => Game.currentState)).toBe(STATE.MAP);
  expect(await page.evaluate(() => ({ hp: Game.player.currentHp, fragments: Game.techFragments })))
    .toEqual({ hp: 57, fragments: 23 });
  await tap(page, '#btn-map-settings');
  page.once('dialog', dialog => dialog.dismiss());
  await tap(page, '#btn-abandon-run');
  expect(await page.evaluate(() => !!Game._readSaveRaw())).toBe(true);
  await expect(page.locator('#modal-settings')).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await tap(page, '#btn-abandon-run');
  await expect(page.locator('#screen-start')).toBeVisible();
  expect(await page.evaluate(() => Game._readSaveRaw())).toBeNull();
});

test('a pending reward cold-resumes with the same offer and can only be collected once', async ({ page }) => {
  await openGame(page, { returning: true });
  await configureEncounter(page, { classId: 'tactician' });
  const before = await page.evaluate(() => {
    Game._rewardContext = { encounterType: 'normal', killName: 'Browser checkpoint' };
    Game.generateRewards({ prepareOnly: true });
    Game.saveGame();
    return structuredClone(Game.pendingReward);
  });
  await page.reload();
  await page.waitForFunction(() => window.Game?.canvas);
  await tap(page, '#intro-overlay');
  await tap(page, '#btn-load-save');
  await expect(page.locator('#screen-reward')).toBeVisible();
  expect(await page.evaluate(() => Game.pendingReward)).toEqual(before);
  await tap(page, '.reward-card');
  await expect(page.locator('#screen-map')).toBeVisible();
  const after = await page.evaluate(() => ({ receipt: Game.pendingReward,
    relics: Game.player.relics.map(r => r.id), hp: Game.player.currentHp }));
  await page.reload();
  await page.waitForFunction(() => window.Game?.canvas);
  await tap(page, '#intro-overlay');
  await tap(page, '#btn-load-save');
  await expect(page.locator('#screen-map')).toBeVisible();
  expect(await page.evaluate(() => ({ receipt: Game.pendingReward,
    relics: Game.player.relics.map(r => r.id), hp: Game.player.currentHp }))).toEqual(after);
});

test('a lethal native class-widget attack settles HP before its full visual and victory', async ({ page }) => {
  await openGame(page, { returning: true });
  await configureEncounter(page, { classId: 'arcanist', enemyHp: 5 });
  await page.waitForFunction(() => document.querySelector('#class-ability-widget .ca-glyph[data-idx="0"]')?.classList.contains('active'));
  await page.locator('#class-ability-widget [data-action="arc-tap"]').tap();
  await expect.poll(() => page.evaluate(() => Game.enemy.currentHp)).toBe(0);
  expect(await page.evaluate(() => ({ state: Game.currentState,
    lightning: Game.effects.some(e => e.type === 'lightning') }))).toEqual({ state: STATE.COMBAT, lightning: true });
  await expect.poll(() => page.evaluate(() => Game.currentState)).toBe(STATE.COMBAT_WIN);
  expect(await page.evaluate(() => Game.effects.some(e => e.type === 'lightning'))).toBe(false);
});
