import { test, expect } from './fixtures.js';
import { openGame, configureEncounter, tap } from './game-driver.js';
import { STATE } from '../../src/constants.js';

test('all six class controls leave every die reachable at narrow phone widths', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  await openGame(page, { returning: true });
  const measurements = [];
  for (const width of [360, 390, 414]) {
    await page.setViewportSize({ width, height: 844 });
    for (const classId of ['tactician', 'sentinel', 'arcanist', 'summoner', 'bloodstalker', 'annihilator']) {
      await configureEncounter(page, { classId, autoQTE: true });
      for (const hand of [3, 4, 6, 8]) {
        await page.evaluate(hand => {
          Game.dicePool = Array.from({ length: hand }, (_, id) => ({ id,
            type: id % 2 ? 'TAC_DEFEND' : 'TAC_ATTACK', used: false, selected: false }));
          Game.renderDiceUI();
        }, hand);
        await page.waitForTimeout(110);
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
        measurements.push({ width, classId, hand, ...result });
        expect(result.dice, `${classId} hand ${hand} at ${width}px`).toHaveLength(hand);
        for (const die of result.dice) {
          expect(die.reachable, JSON.stringify({ width, classId, hand, die })).toBe(true);
          expect(die.x).toBeGreaterThanOrEqual(-1);
          expect(die.x + die.w).toBeLessThanOrEqual(width + 1);
          expect(die.y + die.h).toBeLessThanOrEqual(845);
        }
        for (const control of result.controls) {
          expect(control.w, JSON.stringify(control)).toBeGreaterThanOrEqual(43.5);
          expect(control.h, JSON.stringify(control)).toBeGreaterThanOrEqual(43.5);
        }
      }
    }
  }
  await testInfo.attach('72-phone-class-hand-layouts', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
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
