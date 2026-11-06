import { expect } from '@playwright/test';
import { storagePrefix } from './fixtures.js';

const touchSessions = new WeakMap();
async function touchSession(page) {
  if (!touchSessions.has(page)) {
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
    touchSessions.set(page, session);
  }
  return touchSessions.get(page);
}

export async function tap(page, selector) {
  const element = page.locator(selector).first();
  await expect(element).toBeVisible();
  if (!/#btn-(end-turn|reroll)|#dice-container|\.char-card|\.reward-card|#breakout-storyboard|#cb-dismiss/.test(selector)) {
    await element.tap();
    return;
  }
  await element.tap({ force: true });
}

export async function openGame(page, { returning = false } = {}) {
  if (returning) {
    await page.addInitScript(prefix => {
      localStorage.setItem(prefix + 'mvm_onboarding_done', '1');
      localStorage.setItem(prefix + 'mvm_first_run_done', '1');
      localStorage.setItem(prefix + 'mvm_analytics_consent', 'denied');
    }, storagePrefix);
  }
  await page.goto('/');
  await page.waitForFunction(() => window.Game?.canvas && window.Game?.ctx);
  await tap(page, '#intro-overlay');
  await page.waitForFunction(() => !document.querySelector('#intro-overlay'));
}

export async function readState(page) {
  return page.evaluate(async () => {
    const { Breakout } = await import('/src/services/breakout.js');
    const { DICE_TYPES, STATE } = await import('/src/constants.js');
    const g = Game, r = g.canvas.getBoundingClientRect();
    return {
      state: g.currentState, states: STATE, turn: g.turnCount, hp: g.player?.currentHp,
      mana: g.player?.mana, enemyHp: g.enemy?.currentHp,
      locked: g.inputLocked, running: g._endTurnRunning, depth: g._combatActionDepth,
      paused: g.paused, room: Breakout._roomIdx, breakout: Breakout.isActive(),
      mapCurrentIdx: g.map?.currentIdx,
      wait: Breakout._room?.sequence?.[Breakout._beatIdx]?.wait, tapArmed: Breakout._tapAdvanceArmed,
      storyboard: document.getElementById('breakout-storyboard')?.style.display === 'flex',
      qte: g.qte?.active ? {
        type: g.qte.type, phase: g.qte.phase, radius: g.qte.radius,
        cooldown: g.inputCooldown, x: g.qte.targetX, y: g.qte.targetY
      } : null,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      player: g.player ? { x: g.player.x, y: g.player.y } : null,
      enemy: g.enemy ? { x: g.enemy.x, y: g.enemy.y } : null,
      minions: (g.player?.minions || []).map(m => ({ x: m.x, y: m.y, hp: m.currentHp })),
      dice: g.dicePool.map(d => ({
        id: d.id, type: d.type, used: d.used, selected: d.selected, sealed: d.sealed,
        slot: g._dieSlot(d.type), target: DICE_TYPES[d.type]?.target, cost: DICE_TYPES[d.type]?.cost || 0
      }))
    };
  });
}

export async function dragDie(page, dieId, target = 'enemy') {
  const location = await page.evaluate(({ dieId, target }) => {
    const element = document.querySelector('#dice-container .die[data-die-id="' + dieId + '"]');
    if (!element) return null;
    const d = element.getBoundingClientRect(), r = Game.canvas.getBoundingClientRect();
    const entity = typeof target === 'object' ? target
      : target === 'player' ? Game.player : target === 'ally' ? Game.player.minions[0] : Game.enemy;
    if (!entity) return null;
    return {
      sx: d.x + d.width / 2, sy: d.y + d.height / 2,
      tx: r.x + entity.x / 1080 * r.width, ty: r.y + entity.y / 1920 * r.height
    };
  }, { dieId, target });
  if (!location) throw new Error('Missing die or target for die ' + dieId);
  const cdp = await touchSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: location.sx, y: location.sy, id: 1 }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
        x: location.sx + (location.tx - location.sx) * i / 8,
        y: location.sy + (location.ty - location.sy) * i / 8, id: 1
      }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

export async function tapQTE(page, { quality = 'perfect' } = {}) {
  const cdp = await touchSession(page);
  const point = await page.evaluate(() => {
    const q = Game.qte;
    const r = Game.canvas.getBoundingClientRect();
    return { id: q.id, x: r.x + q.targetX / 1080 * r.width, y: r.y + q.targetY / 1920 * r.height };
  });
    let handle;
    try {
    handle = await page.waitForFunction(({ quality, id }) => {
      const q = Game.qte;
      if (!q.active || q.id !== id) throw new Error('QTE_WINDOW_ENDED');
      if (!q.active || q.phase !== 'active' || Game.inputCooldown > 0
        || q.radius > (quality === 'good' ? (Game.qteWiderWindow ? 62 : 50) : 35)
        || q.radius < (quality === 'perfect' ? 22 : 15)) return false;
      window.__qaQualifiedTouch = { radius: q.radius, type: q.type, phase: q.phase,
        wave: q.waveIdx, id: q.id, observedAt: performance.now() };
      return true;
    }, { quality, id: point.id }, { polling: 'raf', timeout: 8000 });
    } catch (error) {
      if (error.message.includes('QTE_WINDOW_ENDED')) error.name = 'TimeoutError';
      throw error;
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await handle.dispose();
    return { ...point, ...await page.evaluate(() => window.__qaQualifiedTouch) };
}

export async function playUntil(page, predicate, { timeout = 360000, events = [] } = {}) {
  const deadline = Date.now() + timeout;
  let previous = '';
  let lastProgress = Date.now();
  let previousStage = '';
  let repeatedDrag = '';
  let unchangedDrags = 0;
  while (Date.now() < deadline) {
    const s = await readState(page);
    const signature = JSON.stringify([s.state, s.room, s.mapCurrentIdx, s.wait, s.turn, s.hp, s.enemyHp, s.depth,
      s.qte?.phase, s.dice.map(d => [d.id, d.used])]);
    if (signature !== previous) {
      events.push({ time: Date.now(), ...s }); previous = signature; lastProgress = Date.now();
    } else if (Date.now() - lastProgress > 30000) {
      throw new Error('No journey progress for 30 seconds: ' + JSON.stringify(s));
    }
    const stage = JSON.stringify([s.state, s.room, s.breakout, s.mapCurrentIdx]);
    if (stage !== previousStage) {
      console.log('Journey progress: ' + JSON.stringify({ state: s.state, room: s.room, breakout: s.breakout,
        mapCurrentIdx: s.mapCurrentIdx, turn: s.turn, hp: s.hp, enemyHp: s.enemyHp }));
      previousStage = stage;
    }
    if (await predicate(s)) return s;
    // The timing window is shorter than several independent UI visibility
    // queries. Handle a live ring immediately after sampling the combat state.
    if (s.qte) {
      if (s.qte.phase !== 'auto' && (s.qte.phase !== 'active' || s.qte.radius >= 15)) {
        try { await tapQTE(page, { quality: 'good' }); }
        catch (error) {
          const current = await readState(page);
          const ended = error.name === 'TimeoutError'
            && (!current.qte || error.message.includes('QTE_WINDOW_ENDED'));
          if (!ended) throw error;
          events.push({ time: Date.now(), action: 'timing-window-missed', ...current });
        }
      } else await page.waitForTimeout(16);
      continue;
    }
    const ui = await page.evaluate(() => {
      const visible = selector => {
        const element = document.querySelector(selector);
        return !!element && element.getClientRects().length > 0
          && getComputedStyle(element).visibility !== 'hidden';
      };
      return {
        classId: window.Game?.player?.classId,
        consent: visible('[data-consent="denied"]'), onboarding: visible('#onb-name'),
        confirm: visible('#btn-char-detail-confirm'), banner: visible('.class-briefing-overlay.active #cb-dismiss'),
        rest: visible('#screen-rest.active'),
        pause: visible('#pause-overlay.active'), recap: visible('.combat-recap.active [data-action="skip"]')
      };
    });
    if (ui.consent) {
      await tap(page, '[data-consent="denied"]');
      await page.locator('#analytics-consent-banner').waitFor({ state: 'hidden' });
      continue;
    }
    if (ui.onboarding) {
      await page.locator('#onb-name').fill('BROWSER QA');
      await tap(page, '#onb-next-1');
      await page.locator('#onb-name').waitFor({ state: 'hidden' });
      continue;
    }
    if (ui.confirm) {
      await tap(page, '#btn-char-detail-confirm');
      await page.locator('#btn-char-detail-confirm').waitFor({ state: 'hidden' });
      continue;
    }
    if (s.state === s.states.GAMEOVER) throw new Error('Journey unexpectedly ended in GAMEOVER');
    if (ui.banner) {
      await tap(page, '#cb-dismiss');
      await page.locator('.class-briefing-overlay').waitFor({ state: 'detached' });
      continue;
    }
    if (ui.pause) { await tap(page, '#pause-overlay.active'); continue; }
    if (s.state === s.states.CHAR_SELECT) {
      await expect(page.locator('#screen-char-select')).toHaveClass(/active/);
      if (await page.locator('.char-card[data-class-id="summoner"]').isHidden()
        && await page.locator('#btn-more-operators').isVisible()) {
        await tap(page, '#btn-more-operators');
      }
      await page.waitForFunction(() => {
        const card = document.querySelector('.char-card[data-class-id="summoner"]');
        const rect = card?.getBoundingClientRect();
        return !!rect && card.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      });
      await tap(page, '.char-card[data-class-id="summoner"]');
      await expect(page.locator('#btn-char-detail-confirm')).toBeVisible();
      continue;
    }
    if (s.storyboard) {
      // Production arms this slate's click listener 350ms after opening.
      await page.waitForTimeout(400);
      await tap(page, '#breakout-storyboard');
      await page.locator('#breakout-storyboard').waitFor({ state: 'hidden' });
      continue;
    }
    if (ui.recap) {
      await tap(page, '.combat-recap.active [data-action="skip"]'); continue;
    }
    if (s.state === s.states.REWARD) {
      await tap(page, '.reward-card'); continue;
    }
    if (ui.rest) {
      await tap(page, '#btn-rest-sleep');
      await page.locator('#screen-rest').waitFor({ state: 'hidden' });
      continue;
    }
    if (s.state === s.states.EVENT) {
      const index = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('#event-options button')];
        const enabled = buttons.map((button, index) => ({ button, index })).filter(({ button }) => !button.disabled);
        const safe = enabled.find(({ button }) => /\b(leave|ignore|decline|walk\s+away)\b/i.test(button.textContent));
        return (safe || enabled.at(-1))?.index ?? -1;
      });
      if (index < 0) throw new Error('Event has no enabled choice');
      await tap(page, '#event-options button:nth-of-type(' + (index + 1) + ')');
      // Effects complete the node immediately, then leave EVENT after1s.
      // Await that exit so one native choice cannot be granted repeatedly.
      await page.waitForFunction(() => Game.currentState !== 11);
      continue;
    }
    // The combat lock can remain set on the map after a win. Map nodes use
    // their own live handlers and do not consult the dice interaction lock.
    if ([s.states.COMBAT, s.states.BREAKOUT].includes(s.state)
      && (s.locked || s.running || s.depth || s.paused)) { await page.waitForTimeout(50); continue; }
    if (s.breakout && s.wait === 'tap') {
      if (s.tapArmed) await page.touchscreen.tap(195, 400);
      else await page.waitForTimeout(50);
      continue;
    }
    if (s.state === s.states.MAP) {
      let node;
      for (const type of ['combat', 'rest', 'event']) {
        const candidates = page.locator('.map-node-abs.available[data-type="' + type + '"]');
        if (await candidates.count()) { node = candidates.first(); break; }
      }
      if (!node) throw new Error('No available combat, rest or event route');
      const box = await node.boundingBox();
      if (!box) throw new Error('Available map node has no native touch target');
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(150); continue;
    }
    if (![s.states.COMBAT, s.states.BREAKOUT].includes(s.state)) { await page.waitForTimeout(50); continue; }
    // The ordinary journey waits for its opening hand. Rapid input during
    // encounter entry belongs to the separate transition regression.
    if (!s.dice.length) { await page.waitForTimeout(50); continue; }
    const unused = s.dice.filter(d => !d.used);
    const available = unused.filter(d => d.cost <= s.mana);
    const required = s.breakout && s.wait?.startsWith('die_used:') ? s.wait.slice('die_used:'.length) : null;
    const needsMana = unused.some(d => d.cost > s.mana);
    const heavy = available.filter(d => ['METEOR', 'EARTHQUAKE'].includes(d.type))
      .sort((a, b) => b.cost - a.cost)[0];
    let die = required ? available.find(d => required === 'signature' ? d.type === 'SIGNATURE' : d.slot === required)
      : s.breakout && s.wait === 'die_used' ? available.find(d => d.type === 'SIGNATURE') || available[0]
        : (needsMana && available.find(d => d.slot === 'mana'))
          || available.find(d => d.type === 'SIGNATURE') || heavy
          || (ui.classId === 'summoner' && available.find(d => d.slot === 'minion'))
          || available.find(d => d.slot === 'attack') || available.find(d => d.slot === 'minion')
          || available.find(d => d.slot === 'defend') || available.find(d => d.slot !== 'mana');
    if (s.breakout && s.wait === 'enemy_turn') die = null;
    if (s.breakout && s.wait === 'reroll') {
      if (available[0] && !available.some(d => d.selected)) {
        await tap(page, '#dice-container .die[data-die-id="' + available[0].id + '"]');
      }
      await tap(page, '#btn-reroll');
    } else if (die) {
      const target = die.slot === 'minion' ? { x: 540, y: 950 } : die.target === 'enemy' ? 'enemy' : 'player';
      await expect(page.locator('#dice-container .die[data-die-id="' + die.id + '"]')).not.toHaveClass(/die-entering/);
      await dragDie(page, die.id, target);
      const after = await readState(page);
      if (after.state === s.state && after.turn === s.turn && after.room === s.room
        && !after.qte && !after.depth && !after.dice.find(d => d.id === die.id)?.used) {
        const key = JSON.stringify([s.state, s.room, s.turn, s.wait, die.id, die.type]);
        unchangedDrags = key === repeatedDrag ? unchangedDrags + 1 : 1;
        repeatedDrag = key;
        if (unchangedDrags >= 4) {
          const gesture = await page.evaluate(dieId => {
            const el = document.querySelector('#dice-container .die[data-die-id="' + dieId + '"]');
            const r = el?.getBoundingClientRect();
            const top = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return { dragActive: Game.dragState.active, dragDie: Game.dragState.die?.type,
              mouseX: Game.mouseX, mouseY: Game.mouseY, dropTarget: Game.getDropTarget()?.name,
              dieClass: el?.className, topTag: top?.tagName, topClass: top?.className,
              activeScreens: [...document.querySelectorAll('.screen.active')].map(screen => screen.id),
              mapClass: document.getElementById('screen-map')?.className,
              bodyClass: document.body.className, revivePending: !!Game._revivePending };
          }, die.id);
          events.push({ time: Date.now(), action: 'unchanged-drag', die, target, gesture, ...after });
          throw new Error('Four native drags did not use ' + die.type + ': ' + JSON.stringify(gesture));
        }
      } else {
        repeatedDrag = '';
        unchangedDrags = 0;
      }
    } else {
      await tap(page, '#btn-end-turn');
    }
    await page.waitForTimeout(60);
  }
  throw new Error('Journey deadline reached. Last state: ' + JSON.stringify(await readState(page)));
}

export async function configureEncounter(page, options = {}) {
  return page.evaluate(async o => {
    const { Player } = await import('/src/entities/player.js');
    const { Enemy } = await import('/src/entities/enemy.js');
    const { Minion } = await import('/src/entities/minion.js');
    const { PLAYER_CLASSES, STATE } = await import('/src/constants.js');
    const { ClassAbility } = await import('/src/ui/class-ability.js');
    const { Perf } = await import('/src/services/perf.js');
    Game.clearTrackedTimers();
    Game._combatGen = (Game._combatGen || 0) + 1;
    Game.player = new Player(PLAYER_CLASSES.find(c => c.id === (o.classId || 'tactician')));
    Game.player.classId = o.classId || 'tactician';
    Game.player.maxHp = 100;
    Game.player.currentHp = o.hp ?? 100;
    Game.player.mana = 20;
    Game.player.shield = 0;
    Game.player.diceUpgrades = o.upgrades || [];
    Game.enemy = new Enemy({ name: o.enemyName || 'Browser QA', hp: o.enemyHp ?? 500, dmg: 20, kind: o.enemyKind }, 0);
    Object.assign(Game, {
      _guidedRun: null, _practiceSession: false,
      currentState: STATE.COMBAT, _combatActionDepth: 0, _revivePending: null, _endTurnRunning: false,
      _winCombatRunning: false, _combatStartedAt: 0, inputLocked: false, paused: false,
      autoQTE: !!o.autoQTE, qteWiderWindow: !!o.widerWindow, assistDisabled: true,
      combatPaceMult: 1, turnCount: 3, sector: 1, godMode: false, effects: [],
      _activeSectorMech: null, _ascEffects: {}, activePacts: new Set(), challengeMode: false, archiveMode: false,
      map: { currentIdx: 'fight', nodes: [{ id: 'fight', type: 'combat', status: 'current', x: 50, y: 70, connections: [] }] }
    });
    ClassAbility.init(Game);
    ClassAbility.startCombat();
    if (o.minions) {
      Game.player.minions = [];
      Game.enemy.minions = [];
    }
    for (const [index, data] of (o.minions || []).entries()) {
      const friendly = data.playerSide !== false;
      const minion = new Minion(friendly ? 260 : 820, friendly ? 1080 : 550, index + 1, friendly);
      minion.currentHp = minion.maxHp = data.hp ?? 10;
      minion.dmg = data.dmg ?? 20;
      (friendly ? Game.player : Game.enemy).minions.push(minion);
    }
    Game.changeState(STATE.COMBAT);
    Game.invalidateStackCache();
    Game._syncSignatureDie();
    Game.enemy.decideTurn();
    Game.dicePool = (o.dice || ['TAC_ATTACK', 'TAC_DEFEND']).map((type, id) => ({ id, type, used: false, selected: false }));
    Game.renderRelics();
    Game.renderDiceUI();
    Game.updateHUD();
    document.getElementById('btn-end-turn').disabled = false;
    Perf.setOverride(o.performance || 'high');
  }, options);
}
