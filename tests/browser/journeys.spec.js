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
    await openGame(page, { returning: true });
    await tap(page, '#btn-load-save');
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
