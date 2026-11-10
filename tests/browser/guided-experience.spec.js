import { test, expect, storagePrefix } from './fixtures.js';
import { openGame, configureEncounter, tap, dragDie, tapQTE, playUntil, readState } from './game-driver.js';
import { STATE } from '../../src/constants.js';

test('a shared fight link offers native play before setup and leaves the campaign untouched', async ({ page }, info) => {
  await page.goto('/?fight=tactician-v1');
  const objective = page.locator('[data-kind="shared-fight"]');
  await expect(objective).toBeVisible();
  await expect(objective).toContainText('9 damage');
  await expect(page.locator('#intro-overlay, #analytics-consent-banner')).toHaveCount(0);
  await expect(page.locator('#screen-char-select')).toBeHidden();
  await expect(page.locator('#btn-reroll')).toBeHidden();
  const bounds = [];
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => document.fonts.ready);
    const layout = await objective.evaluate(card => {
      const rect = node => {
        const { x, y, top, right, bottom, left, width, height } = node.getBoundingClientRect();
        return { x, y, top, right, bottom, left, width, height };
      };
      const exit = card.querySelector('button');
      const exitRect = rect(exit);
      const endTurn = document.getElementById('btn-end-turn');
      const endTurnRect = rect(endTurn);
      const hit = box => document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { card: rect(card), exit: exitRect, endTurn: endTurnRect, exitHittable: exit.contains(hit(exitRect)),
        endTurnHittable: endTurn.contains(hit(endTurnRect)),
        title: rect(card.querySelector('.learning-objective-title')),
        intent: rect(card.querySelector('.learning-objective-progress')),
        dice: [...document.querySelectorAll('#dice-container .die')].map(rect) };
    });
    bounds.push({ width, ...layout });
    expect(layout.exitHittable).toBe(true);
    expect(layout.endTurnHittable).toBe(true);
    expect(layout.card.right).toBeLessThanOrEqual(layout.endTurn.left + 1);
    expect(layout.title.top).toBeGreaterThanOrEqual(layout.card.top - 1);
    expect(layout.intent.bottom).toBeLessThanOrEqual(layout.card.bottom + 1);
    expect(layout.dice).toHaveLength(3);
    for (const die of layout.dice) expect(die.top).toBeGreaterThanOrEqual(layout.card.bottom - 1);
    const path = info.outputPath(`shared-first-fight-${width}.png`);
    await page.screenshot({ path });
    await info.attach(`shared-first-fight-${width}`, { path, contentType: 'image/png' });
  }
  await info.attach('shared-first-fight-bounds', { body: JSON.stringify(bounds, null, 2), contentType: 'application/json' });
  const first = await readState(page);
  expect(first.dice.map(die => die.type)).toEqual(['TAC_ATTACK', 'TAC_ATTACK', 'TAC_DEFEND']);
  await dragDie(page, first.dice[2].id, 'player');
  await expect.poll(() => page.evaluate(() => ({ used: Game.dicePool[2].used, shield: Game.player.shield })))
    .toEqual({ used: true, shield: 5 });
  expect(await page.evaluate(prefix => Object.keys(window.__MVM_NATIVE_STORAGE__.local)
    .filter(key => key.startsWith(prefix)), storagePrefix)).toEqual([]);
  await tap(page, '[data-kind="shared-fight"] .learning-objective-help');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#intro-overlay')).toBeVisible();
  await expect(page.locator('[data-kind="shared-fight"]')).toHaveCount(0);
});

test('a native shared fight win reports the settled score and offers a fresh replay', async ({ page }, info) => {
  test.setTimeout(90000);
  await page.addInitScript(prefix => {
    localStorage.setItem(prefix + 'mvm_sparks', '73');
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  }, storagePrefix);
  await page.goto('/?fight=tactician-v1');
  await expect(page.locator('[data-kind="shared-fight"]')).toBeVisible();
  await playUntil(page, s => s.state === s.states.BOOT && !s.breakout, { timeout: 65000 });
  await expect(page.locator('#shared-fight-title')).toHaveText('Drone defeated');
  const score = await page.locator('#shared-fight-stats').textContent();
  expect(score).toMatch(/^[2-6] turns · [1-9][0-9]*\/24 HP$/);
  const health = score.split(' · ')[1];

  const replay = 'https://tayyibshah123.github.io/magicvmachine/guided/?fight=tactician-v1';
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => document.fonts.ready);
    const bounds = await page.locator('#shared-fight-result button').evaluateAll(buttons => buttons.map(button => {
      const { x, y, width, height } = button.getBoundingClientRect();
      return { id: button.id, x, y, width, height,
        reachable: button.contains(document.elementFromPoint(x + width / 2, y + height / 2)) };
    }));
    for (const box of bounds) {
      expect(box.reachable).toBe(true);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    for (let i = 1; i < bounds.length; i++) {
      const previous = bounds[i - 1], current = bounds[i];
      expect(Math.max(current.x - previous.x - previous.width, current.y - previous.y - previous.height)).toBeGreaterThanOrEqual(4);
    }
    const path = info.outputPath('shared-fight-result-' + width + '.png');
    await page.screenshot({ path });
    await info.attach('shared-fight-result-' + width, { path, contentType: 'image/png' });
    await info.attach('shared-fight-result-bounds-' + width, { body: JSON.stringify(bounds), contentType: 'application/json' });
  }
  await tap(page, '#shared-fight-share');
  const panel = page.locator('#run-share-dialog');
  await expect(panel).toContainText(health + ' remaining');
  await expect(panel.getByRole('link', { name: 'Open game link' })).toHaveAttribute('href', replay);
  await expect(panel.getByRole('link', { name: 'Download image' })).toHaveAttribute('href', /^data:image\/png;base64,/);
  await panel.getByRole('button', { name: 'Close' }).tap();
  await tap(page, '#shared-fight-retry');
  await expect(page.locator('[data-kind="shared-fight"]')).toContainText('9 damage');
  expect((await readState(page)).hp).toBe(24);
  expect(await page.evaluate(prefix => window.__MVM_NATIVE_STORAGE__.local.getItem(prefix + 'mvm_sparks'), storagePrefix)).toBe('73');
  await expect(page.locator('#shared-fight-result')).toBeHidden();
});

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
  await page.setViewportSize({ width: 360, height: 800 });
  await openGame(page);
  await tap(page, '#onb-next-1');
  await expect(page.locator('.char-card:visible')).toHaveCount(2);
  await expect(page.getByText('Flexible attacks and rerolls', { exact: true })).toBeVisible();
  await expect(page.getByText('Shield and automatic protection', { exact: true })).toBeVisible();
  const layouts = [];
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [document.getElementById('screen-char-select'),
      ...document.querySelectorAll('.char-card.learning-recommended')].every(node => {
      const style = getComputedStyle(node);
      return Number(style.opacity) > 0.99 && [...style.filter.matchAll(/blur\(([\d.]+)px\)/g)]
        .every(match => Number(match[1]) <= 0.01);
    }));
    const cards = await page.locator('.char-card.learning-recommended').evaluateAll(nodes => nodes.map(card => {
      const rect = node => {
        const { top, right, bottom, left, width, height } = node.getBoundingClientRect();
        return { top, right, bottom, left, width, height };
      };
      const bounds = rect(card);
      const centre = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      return { classId: card.dataset.classId, card: bounds,
        preview: rect(card.querySelector('.char-preview')), name: rect(card.querySelector('.char-name')),
        badge: rect(card.querySelector('.learning-recommended-badge')), role: rect(card.querySelector('.learning-operator-role')),
        centreHittable: centre?.closest('.char-card') === card };
    }));
    layouts.push({ width, height: 800, cards });
    await page.screenshot({ path: info.outputPath(`guided-operators-${width}.png`) });
    await info.attach(`guided-recommended-operators-${width}`, {
      path: info.outputPath(`guided-operators-${width}.png`), contentType: 'image/png'
    });
  }
  await info.attach('guided-recommended-operator-bounds', { body: JSON.stringify(layouts, null, 2), contentType: 'application/json' });
  for (const layout of layouts) for (const card of layout.cards) {
    expect(card.centreHittable, `${layout.width}px ${card.classId} centre`).toBe(true);
    expect(card.preview.bottom, `${layout.width}px ${card.classId} preview before name`).toBeLessThanOrEqual(card.name.top + 0.5);
    expect(card.name.bottom, `${layout.width}px ${card.classId} name before badge`).toBeLessThanOrEqual(card.badge.top + 0.5);
    expect(card.badge.bottom, `${layout.width}px ${card.classId} badge before role`).toBeLessThanOrEqual(card.role.top + 0.5);
    expect(card.card.top).toBeGreaterThanOrEqual(0);
    expect(card.card.bottom).toBeLessThanOrEqual(layout.height);
    for (const part of [card.preview, card.name, card.badge, card.role]) {
      expect(part.width).toBeGreaterThan(0);
      expect(part.height).toBeGreaterThan(0);
      expect(part.top).toBeGreaterThanOrEqual(card.card.top - 0.5);
      expect(part.bottom).toBeLessThanOrEqual(card.card.bottom + 0.5);
      expect(part.left).toBeGreaterThanOrEqual(Math.max(0, card.card.left) - 0.5);
      expect(part.right).toBeLessThanOrEqual(Math.min(layout.width, card.card.right) + 0.5);
    }
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await tap(page, '.char-card[data-class-id="tactician"]');
  await tap(page, '#btn-char-detail-confirm');
  const events = [];
  await playUntil(page, s => s.breakout && s.room === 0 && s.dice.length > 0 && !s.storyboard && !s.locked,
    { timeout: 45000, events });
  await expect(page.locator('#btn-reroll')).toBeHidden();
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
  if (await page.evaluate(() => window.MVMConsent.read()) === null) {
    await tap(page, '[data-consent="denied"]');
    await expect(page.locator('#analytics-consent-banner')).toBeHidden();
  }
  expect(await page.evaluate(() => window.MVMConsent.read())).toBe(false);
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
