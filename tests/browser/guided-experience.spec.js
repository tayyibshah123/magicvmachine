import { test, expect, storagePrefix } from './fixtures.js';
import { openGame, configureEncounter, tap, dragDie, tapQTE, playUntil } from './game-driver.js';
import { STATE } from '../../src/constants.js';

test('a fresh player can choose Full Rules without mandatory training or a changed difficulty choice', async ({ page }) => {
  await page.addInitScript(prefix => localStorage.setItem(prefix + 'mvm_difficulty', 'operator'), storagePrefix);
  await openGame(page);
  await tap(page, '[data-learning-mode="full"]');
  await tap(page, '#onb-next-1');
  await expect(page.locator('#screen-char-select')).toBeVisible();
  await expect(page.locator('.char-card:visible')).toHaveCount(6);
  await tap(page, '.char-card[data-class-id="sentinel"]');
  await tap(page, '#btn-char-detail-confirm');
  await expect.poll(() => page.evaluate(() => document.getElementById('screen-map').classList.contains('active')
    || !!document.querySelector('.class-briefing-overlay.active'))).toBe(true);
  if (await page.locator('.class-briefing-overlay.active #cb-dismiss').isVisible()) await tap(page, '#cb-dismiss');
  await expect(page.locator('#screen-map')).toBeVisible({ timeout: 20000 });
  expect(await page.evaluate(() => ({ guidance: Game._guidedRun,
    difficulty: localStorage.getItem('mvm_difficulty'), core: document.body.classList.contains('guided-core') })))
    .toEqual({ guidance: null, difficulty: 'operator', core: false });
});

test('an actual short-core checkpoint survives a cold refresh without completing or resetting training', async ({ page }, info) => {
  test.setTimeout(150000);
  await openGame(page);
  await tap(page, '#onb-next-1');
  await tap(page, '.char-card[data-class-id="tactician"]');
  await tap(page, '#btn-char-detail-confirm');
  const events = [];
  await playUntil(page, s => s.breakout && s.room === 0 && s.dice.length > 0 && !s.storyboard && !s.locked,
    { timeout: 45000, events });
  const checkpoint = await page.evaluate(() => JSON.parse(Game._readSaveRaw()));
  expect(checkpoint.guidance.core.roomIndex).toBe(0);
  await page.reload();
  await page.waitForFunction(() => window.Game?.ctx);
  await tap(page, '#intro-overlay');
  await tap(page, '#btn-load-save');
  await expect.poll(() => page.evaluate(async () => {
    const { Breakout } = await import('/src/services/breakout.js');
    return { active: Breakout.isActive(), room: Breakout._roomIdx, classId: Game.player?.classId,
      progress: Game._guidedRun?.core, practice: !!Game._practiceSession };
  })).toEqual({ active: true, room: 0, classId: 'tactician', progress: checkpoint.guidance.core, practice: false });
  expect(await page.evaluate(() => localStorage.getItem('mvm_breakout_done'))).toBeNull();
  await info.attach('core-checkpoint', { body: JSON.stringify(checkpoint, null, 2), contentType: 'application/json' });
});

test('native paid-skill practice uses real mana and restores the real checkpoint without rewards', async ({ page }, info) => {
  test.setTimeout(180000);
  await openGame(page, { returning: true });
  await configureEncounter(page, { classId: 'tactician', hp: 57 });
  await page.evaluate(() => { Game.techFragments = 23; Game.saveGame(); });
  const physical = () => page.evaluate(prefix => {
    const storage = window.__MVM_NATIVE_STORAGE__.local;
    return Object.fromEntries(Object.keys(storage).filter(key => key.startsWith(prefix))
      .map(key => [key, storage.getItem(key)]));
  }, storagePrefix);
  const before = await physical();
  await tap(page, '#btn-settings');
  await tap(page, '#btn-learning-practice');
  await expect(page.locator('#learning-practice-library')).toBeVisible();
  await tap(page, '[data-lesson-id="resources"]');
  await expect.poll(() => page.evaluate(() => !!Game._practiceSession)).toBe(true);
  expect(await physical()).toEqual(before);
  const events = [];
  await playUntil(page, s => s.state === STATE.MENU && !s.breakout, { timeout: 130000, events });
  const after = await physical();
  const learningKey = storagePrefix + 'mvm_learning_v1';
  delete before[learningKey]; delete after[learningKey];
  expect(after).toEqual(before);
  expect(await page.evaluate(() => ({ hp: Game.player.currentHp, fragments: Game.techFragments,
    practice: !!Game._practiceSession }))).toEqual({ hp: 57, fragments: 23, practice: false });
  expect(events.some(event => event.manaSpent >= 2 && event.dice.some(die => die.type === 'EARTHQUAKE' && die.used))).toBe(true);
  await info.attach('native-paid-practice-events', { body: JSON.stringify(events, null, 2), contentType: 'application/json' });
});

test('one native ally prompt settles a whole lethal volley and every dart reaches impact', async ({ page }, info) => {
  await openGame(page, { returning: true });
  await configureEncounter(page, { classId: 'summoner', enemyHp: 1, autoQTE: false,
    minions: [{ hp: 10, dmg: 20 }, { hp: 10, dmg: 20 }, { hp: 10, dmg: 20 }] });
  await page.evaluate(() => {
    const seen = new Map();
    const prompts = new Set();
    window.__volleyObserved = { prompts: [], flights: [], settledAtFirstFlight: null, terminal: null };
    const sample = () => {
      const state = window.__volleyObserved;
      if (Game.qte?.active && Game.qte.minionBoost && !prompts.has(Game.qte.id)) {
        prompts.add(Game.qte.id); state.prompts.push({ hp: Game.enemy.currentHp, totals: { ...Game.qte.volleyBoost } });
      }
      for (const effect of Game.effects) if (effect.type === 'nature_dart' && !seen.has(effect)) {
        const flight = { progress: 0, retired: false };
        seen.set(effect, flight); state.flights.push(flight);
        state.settledAtFirstFlight ??= Game.enemy.currentHp;
      }
      for (const [effect, flight] of seen) {
        flight.progress = effect.progress;
        flight.retired = !Game.effects.includes(effect);
      }
      if (Game.currentState !== 3) { state.terminal = Game.currentState; return; }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await tap(page, '#btn-end-turn');
  await page.waitForFunction(() => Game.qte?.active && Game.qte.minionBoost);
  await tapQTE(page);
  await expect.poll(() => page.evaluate(() => window.__volleyObserved.terminal)).toBe(STATE.COMBAT_WIN);
  const result = await page.evaluate(() => window.__volleyObserved);
  expect(result.prompts).toEqual([{ hp: 1, totals: { base: 60, good: 66, perfect: 78 } }]);
  expect(result.settledAtFirstFlight).toBe(0);
  expect(result.flights).toHaveLength(3);
  for (const flight of result.flights) { expect(flight.progress).toBeGreaterThanOrEqual(1); expect(flight.retired).toBe(true); }
  await info.attach('native-volley-presentation', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
});

test('mobile encounter rules pause safely in a readable body-level panel and close through native touch', async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openGame(page, { returning: true });
  await configureEncounter(page, { classId: 'sentinel', enemyName: 'Maintenance Spike' });
  await page.evaluate(() => {
    Game.enemy._armedDetonate = true;
    document.documentElement.style.setProperty('--text-scale-multiplier', '1.4');
    Game._showLearningObjective();
  });
  await tap(page, '#learning-objective .learning-objective-help');
  const panel = page.locator('#learning-boss-rules');
  await expect(panel).toBeVisible();
  expect(await panel.evaluate(node => node.parentElement === document.body)).toBe(true);
  await expect(panel).toContainText('next player turn');
  expect(await page.evaluate(() => Game.paused)).toBe(true);
  await page.touchscreen.tap(10, 10);
  expect(await page.evaluate(() => Game.turnCount)).toBe(3);
  await info.attach('large-text-encounter-rules', { body: await page.screenshot(), contentType: 'image/png' });
  await tap(page, '#learning-boss-rules .learning-modal-close');
  await expect(panel).toHaveCount(0);
  expect(await page.evaluate(() => Game.paused)).toBe(false);
});

test('a wrong native drop gives a useful target correction and leaves the die available', async ({ page }) => {
  await openGame(page, { returning: true });
  await configureEncounter(page, { classId: 'tactician', dice: ['TAC_ATTACK', 'TAC_DEFEND'] });
  await page.evaluate(async () => {
    const { Learning } = await import('/src/services/learning.js');
    Game._guidedRun = Learning.createRun('tactician');
  });
  await dragDie(page, 0, 'player');
  await expect(page.locator('#hint-toast')).toContainText('living hostile');
  expect(await page.evaluate(() => ({ hp: Game.player.currentHp,
    enemyHp: Game.enemy.currentHp, used: Game.dicePool[0].used, qte: Game.qte.active })))
    .toEqual({ hp: 100, enemyHp: 500, used: false, qte: false });
});

test('native Challenge briefing and replacement cancellation both preserve the checkpoint', async ({ page }) => {
  await openGame(page);
  await tap(page, '#onb-next-1');
  await configureEncounter(page, { classId: 'tactician' });
  const checkpoint = await page.evaluate(async () => {
    const { Unlocks } = await import('/src/services/unlocks.js');
    Game.saveAndReturn();
    Unlocks.grant('daily', 'browser-test');
    Unlocks.applyMenuVisibility();
    return Game._readSaveRaw();
  });
  if (await page.locator('[data-consent="denied"]').isVisible()) await tap(page, '[data-consent="denied"]');
  await tap(page, '#btn-challenge');
  await expect(page.locator('#learning-mode-briefing')).toBeVisible();
  expect(await page.evaluate(() => Game._readSaveRaw())).toBe(checkpoint);
  await tap(page, '#learning-mode-briefing .learning-modal-close');
  await expect(page.locator('#learning-mode-briefing')).toHaveCount(0);
  expect(await page.evaluate(() => Game._readSaveRaw())).toBe(checkpoint);
  await tap(page, '#btn-challenge');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'START', exact: true }).tap();
  await expect(page.locator('#learning-mode-briefing')).toHaveCount(0);
  expect(await page.evaluate(() => Game._readSaveRaw())).toBe(checkpoint);
  expect(await page.evaluate(() => Game.currentState)).toBe(STATE.MENU);
});

for (const [classId, pattern, waves] of [
  ['tactician', 'steady', 1], ['sentinel', 'steady', 1], ['arcanist', 'pulse', 1],
  ['bloodstalker', 'pulse', 1], ['annihilator', 'accelerate', 1], ['summoner', 'multi', 2]
]) test(`${classId} completes the staged second core drill using its real native timing rhythm`, async ({ page }, info) => {
  test.setTimeout(180000);
  await openGame(page);
  await tap(page, '#onb-next-1');
  if (await page.locator(`.char-card[data-class-id="${classId}"]`).isHidden()) await tap(page, '#btn-more-operators');
  await tap(page, `.char-card[data-class-id="${classId}"]`);
  await tap(page, '#btn-char-detail-confirm');
  await page.waitForFunction(() => Game.currentState === 21);
  // Stage the real second checkpoint; its actions, damage, enemy phase and
  // completion are then driven entirely by native input and the renderer.
  await page.evaluate(async () => {
    const { Breakout } = await import('/src/services/breakout.js');
    Breakout.start(Game, { guided: true, progress: { roomIndex: 1, actions: [] } });
  });
  const events = [];
  await playUntil(page, s => s.state === STATE.MAP && !s.breakout, { timeout: 150000, events });
  expect(events.some(event => event.qte?.type === 'ATTACK' && event.qte.pattern === pattern && event.qte.waves === waves)).toBe(true);
  expect(await page.evaluate(() => Game._guidedRun.core)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('mvm_breakout_done'))).toBe('1');
  expect(await page.evaluate(() => Game.player.currentHp)).toBeGreaterThan(0);
  await info.attach(classId + '-native-core-events', { body: JSON.stringify(events, null, 2), contentType: 'application/json' });
});
