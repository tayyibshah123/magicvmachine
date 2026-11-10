import { readFile } from 'node:fs/promises';
import { test, expect, edition, storagePrefix } from './fixtures.js';
import { openGame, playUntil, readState, tap } from './game-driver.js';

test('fresh profile completes the tutorial and a normal combat through touch controls', async ({ page }, testInfo) => {
  test.setTimeout(15 * 60 * 1000);
  const events = [];
  try {
    await openGame(page);
    await playUntil(page, s => s.state === s.states.MAP && !s.breakout, { timeout: 600000, events });
    expect([...new Set(events.filter(s => s.breakout).map(s => s.room))].sort())
      .toEqual(edition === 'guided' ? [0, 1] : [0, 1, 2, 3, 4]);
    expect(await page.evaluate(() => localStorage.getItem('mvm_breakout_done'))).toBe('1');
    const firstMap = await readState(page);
    expect(firstMap.hp).toBeGreaterThan(0);
    let enteredCombat = false;
    let combatNode;
    let reachedReward = false;
    await playUntil(page, s => {
      if (s.state === s.states.COMBAT) { enteredCombat = true; combatNode = s.mapCurrentIdx; }
      if (s.state === s.states.REWARD) reachedReward = true;
      return enteredCombat && s.state === s.states.MAP;
    }, { timeout: 240000, events });
    expect(enteredCombat).toBe(true);
    expect(reachedReward).toBe(true);
    expect(await page.evaluate(id => Game.map.nodes.find(node => node.id === id)?.status, combatNode)).toBe('completed');
    if (!await page.evaluate(() => localStorage.getItem('mvm_analytics_consent'))) {
      await tap(page, '[data-consent="denied"]');
    }
    expect(await page.evaluate(() => localStorage.getItem('mvm_analytics_consent'))).toBe('denied');
  } finally {
    await testInfo.attach('journey-state-changes', { body: JSON.stringify(events, null, 2), contentType: 'application/json' });
  }
});

test('returning player resumes, uses a fresh hand, refreshes and resumes again', async ({ page }, testInfo) => {
  test.setTimeout(180000);
  const snapshot = JSON.parse(await readFile(new URL('./returning-save.json', import.meta.url), 'utf8'));
  await page.addInitScript(({ snapshot, prefix }) => {
    if (!localStorage.getItem(prefix + 'mvm_browser_fixture_seeded')) {
      localStorage.setItem(prefix + 'mvm_save_v1__A', JSON.stringify(snapshot));
      localStorage.setItem(prefix + 'mvm_active_slot', 'A');
      localStorage.setItem(prefix + 'mvm_browser_fixture_seeded', '1');
    }
  }, { snapshot, prefix: storagePrefix });
  const events = [];
  try {
    if (edition === 'stable') {
      await page.addInitScript(() => {
        localStorage.setItem('mvm_onboarding_done', '1');
        localStorage.setItem('mvm_first_run_done', '1');
        localStorage.setItem('mvm_analytics_consent', 'denied');
      });
      await page.goto('/');
      await tap(page, '#btn-intro-continue');
    } else {
      await openGame(page, { returning: true });
      await tap(page, '#btn-load-save');
    }
    await page.waitForFunction(() => Game.currentState === 2);
    expect(await page.evaluate(() => Game.techFragments)).toBe(12);
    await playUntil(page, s => s.state === s.states.COMBAT && s.dice.some(d => d.used)
      && !s.qte && !s.depth, { timeout: 45000, events });
    expect(events.some(s => s.state === s.states.COMBAT && s.dice.some(d => d.used))).toBe(true);
    const hp = await page.evaluate(() => Game.player.currentHp);
    await page.reload();
    await page.waitForFunction(() => !!window.Game?.canvas);
    await tap(page, '#intro-overlay');
    await page.waitForFunction(() => !document.querySelector('#intro-overlay'));
    await tap(page, '#btn-load-save');
    await page.waitForFunction(() => !!Game.player && [2, 3].includes(Game.currentState));
    expect(await page.evaluate(() => Game.techFragments)).toBe(12);
    expect(await page.evaluate(() => Game.player.currentHp)).toBe(hp);
    let enteredCombat = false;
    let combatNode;
    let reachedReward = false;
    await playUntil(page, s => {
      if (s.state === s.states.COMBAT) { enteredCombat = true; combatNode = s.mapCurrentIdx; }
      if (s.state === s.states.REWARD) reachedReward = true;
      return enteredCombat && s.state === s.states.MAP;
    }, { timeout: 110000, events });
    expect(reachedReward).toBe(true);
    expect(await page.evaluate(id => Game.map.nodes.find(node => node.id === id)?.status, combatNode)).toBe('completed');
  } finally {
    await testInfo.attach('journey-state-changes', { body: JSON.stringify(events, null, 2), contentType: 'application/json' });
  }
});


async function captureActions(page, testInfo, name, selectors) {
  const boxes = [];
  for (const selector of selectors) {
    const element = page.locator(selector);
    await expect(element).toBeVisible();
    const box = await element.evaluate(node => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height,
        reachable: node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
    });
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.reachable).toBe(true);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
    boxes.push({ selector, ...box });
  }
  for (let i = 1; i < boxes.length; i++) {
    const previous = boxes[i - 1], current = boxes[i];
    expect(Math.max(current.x - previous.x - previous.width, current.y - previous.y - previous.height)).toBeGreaterThanOrEqual(6);
  }
  const path = testInfo.outputPath(name + '.png');
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
  await testInfo.attach(name + '-tap-bounds', { body: JSON.stringify(boxes), contentType: 'application/json' });
}

for (const width of [360, 390]) {
  test('Stable fast start and isolated gauntlet at ' + width + 'px', async ({ page }, testInfo) => {
    test.skip(edition !== 'stable', 'Stable edition flow');
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 844 });
    await openGame(page);
    await captureActions(page, testInfo, 'classic-onboarding-' + width, ['#onb-next-1', '#onb-start-classic']);
    await tap(page, '#onb-start-classic');
    await expect(page.locator('#onboarding-overlay')).toHaveCount(0);
    await playUntil(page, s => s.state === s.states.MAP, { timeout: 25000 });
    expect(await page.evaluate(() => localStorage.getItem('mvm_first_run_done'))).toBe('1');
    expect(await page.evaluate(() => Game._sharedGauntletStarted)).toBeFalsy();
    const campaign = await page.evaluate(() => Game._readSaveRaw());
    expect(campaign).toBeTruthy();

    const startGauntlet = async (screenshot) => {
      await page.goto('/?gauntlet=tactician-v1');
      if (screenshot) {
        await captureActions(page, testInfo, 'gauntlet-preview-' + width,
          ['#btn-start-gauntlet-preset', '#btn-copy-gauntlet-preset', '#btn-exit-gauntlet-preset']);
      }
      await expect(page.locator('#onboarding-overlay')).toHaveCount(0);
      expect(await page.evaluate(() => Game._readSaveRaw())).toBeNull();
      await tap(page, '#btn-start-gauntlet-preset');
      await page.waitForFunction(() => Game.currentState === 2);
      const setup = await page.evaluate(() => ({
        classId: Game.player.classId,
        bosses: Game.map.nodes.filter(n => n.type === 'boss').length,
        difficulty: Game._getRunDifficultyTier(), ascension: Game._getRunAscension(),
        twist: Game._challengeTwist.id
      }));
      expect(setup).toEqual({ classId: 'tactician', bosses: 5, difficulty: 'operator', ascension: 0, twist: 'fortified' });
      await page.waitForFunction(() => !document.querySelector('.map-node-abs.available.node-entering'));
      if (screenshot) {
        await captureActions(page, testInfo, 'gauntlet-route-' + width,
          ['.map-node-abs.current', '.map-node-abs.available[data-type="pact"]']);
      }
      await tap(page, '.map-node-abs.available[data-type="pact"]');
      await tap(page, '#pact-options .pact-card');
      await expect(page.locator('#screen-pact')).toBeHidden();
      await playUntil(page, s => s.state === s.states.COMBAT && !s.locked && s.dice.length > 0, { timeout: 35000 });
      return page.evaluate(() => ({ hand: Game.dicePool.map(die => die.type), intents: Game.enemy.nextIntents.map(({ type, val }) => [type, val]) }));
    };
    const first = await startGauntlet(true);
    const second = await startGauntlet(false);
    expect(second).toEqual(first);
    await page.goto('/');
    await tap(page, '#btn-intro-continue');
    await page.waitForFunction(() => Game.currentState === 2);
    expect(await page.evaluate(() => Game._readSaveRaw())).toBe(campaign);
  });
}
