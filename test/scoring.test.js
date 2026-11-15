const { test } = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./helpers/load-game');

// Level 0 (Maya, minRel 40): DV([i, j]) = 70*(1 - i/12) + 30*(1 - j/10), OV([i, j]) = 40*i/12 + 60*j/10.
const HIGH_DV_PKG = [6, 0]; // DV 65
const LOW_DV_PKG = [12, 5]; // DV 15

function setup(overrides = {}, W = 50) {
  const game = loadGame();
  const base = game.createInitialHandState(game.CONFIG.levels[0], W, 50);
  return { game, state: { ...base, ...overrides } };
}

function closedDeal(pkg, rel, W = 50) {
  return setup({ ended: true, endingType: 'deal', agreedPkg: pkg, rel }, W);
}

function counterOnTable(pkg, rel, W = 50) {
  return setup({ opponentCounterPkg: pkg, rel }, W);
}

function rep(game, ending, finalRel, bluffs = 0, start = 50) {
  return game.updateReputation(start, { ending, finalRel, bluffsCaughtThisLevel: bluffs });
}

test('Deal requires DV >= W and final Rel >= minRel', () => {
  const { game, state } = closedDeal(HIGH_DV_PKG, 40);
  const result = game.determineEnding(state, null);
  assert.strictEqual(result.ending, 'deal');
  assert.strictEqual(result.cleared, true);
  assert.deepStrictEqual(result.finalPkg, HIGH_DV_PKG);
  assert.ok(Math.abs(result.dv - 65) < 1e-9);
  assert.strictEqual(result.rel, 40);
});

test('Won the deal, lost the relationship: DV >= W but Rel < minRel => failed', () => {
  const { game, state } = closedDeal(HIGH_DV_PKG, 39);
  const result = game.determineEnding(state, null);
  assert.strictEqual(result.ending, 'wonLostRelationship');
  assert.strictEqual(result.cleared, false);
  assert.ok(Math.abs(result.dv - 65) < 1e-9);
  assert.strictEqual(result.rel, 39);
});

test('accepting the opponent counter with DV >= W uses the same deal / lost-relationship split', () => {
  const ok = counterOnTable(HIGH_DV_PKG, 55);
  assert.strictEqual(ok.game.determineEnding(ok.state, 'accept').ending, 'deal');
  const exact = counterOnTable(HIGH_DV_PKG, 40, 65);
  const exactResult = exact.game.determineEnding(exact.state, 'accept');
  assert.strictEqual(exactResult.ending, 'deal');
  assert.deepStrictEqual(exactResult.finalPkg, HIGH_DV_PKG);
  assert.ok(Math.abs(exactResult.dv - 65) < 1e-9);
  const bad = counterOnTable(HIGH_DV_PKG, 30);
  const badResult = bad.game.determineEnding(bad.state, 'accept');
  assert.strictEqual(badResult.ending, 'wonLostRelationship');
  assert.strictEqual(badResult.cleared, false);
});

test('accepting a counter below the line throws until the fold is confirmed', () => {
  const { game, state } = counterOnTable(LOW_DV_PKG, 80);
  assert.throws(() => game.determineEnding(state, 'accept'), /Below your line — confirm the fold first\./);
});

test('accept and foldConfirmed throw when there is no opponent counter', () => {
  const { game, state } = setup();
  assert.throws(() => game.determineEnding(state, 'accept'));
  assert.throws(() => game.determineEnding(state, 'foldConfirmed'));
});

test('Fold applies +10 Rel then requires Rel >= minRel + 10 to clear', () => {
  const clear = counterOnTable(LOW_DV_PKG, 40);
  const cleared = clear.game.determineEnding(clear.state, 'foldConfirmed');
  assert.strictEqual(cleared.ending, 'foldCleared');
  assert.strictEqual(cleared.cleared, true);
  assert.strictEqual(cleared.rel, 50);
  assert.ok(Math.abs(cleared.dv - 15) < 1e-9);
  assert.deepStrictEqual(cleared.finalPkg, LOW_DV_PKG);

  const fail = counterOnTable(LOW_DV_PKG, 39);
  const failed = fail.game.determineEnding(fail.state, 'foldConfirmed');
  assert.strictEqual(failed.ending, 'foldFailed');
  assert.strictEqual(failed.cleared, false);
  assert.strictEqual(failed.rel, 49);
});

test('fold bonus is clamped at 100', () => {
  const { game, state } = counterOnTable(LOW_DV_PKG, 95);
  assert.strictEqual(game.determineEnding(state, 'foldConfirmed').rel, 100);
});

test('foldConfirmed throws when the counter is not below the line', () => {
  const { game, state } = counterOnTable(HIGH_DV_PKG, 80, 65);
  assert.throws(() => game.determineEnding(state, 'foldConfirmed'));
});

test('walk fails the level and leaves Rel unchanged', () => {
  const { game, state } = counterOnTable(HIGH_DV_PKG, 62);
  const result = game.determineEnding(state, 'walk');
  assert.deepStrictEqual(result, { ending: 'walk', cleared: false, finalPkg: null, dv: null, rel: 62 });
});

test('opponentWalk passes through as a failed ending', () => {
  const { game, state } = setup({ ended: true, endingType: 'opponentWalk', rel: 12 });
  assert.deepStrictEqual(game.determineEnding(state, null), { ending: 'opponentWalk', cleared: false, finalPkg: null, dv: null, rel: 12 });
});

test('computeLevelScore: deal = 5*DV + 3*Rel + 2*W, foldCleared drops the 2*W term', () => {
  const { game } = setup();
  assert.strictEqual(game.computeLevelScore('deal', 60, 72, 50), 616);
  assert.strictEqual(game.computeLevelScore('foldCleared', 60, 72, 50), 516);
});

test('computeLevelScore is 0 for every failed ending', () => {
  const { game } = setup();
  for (const ending of ['wonLostRelationship', 'foldFailed', 'walk', 'opponentWalk']) {
    assert.strictEqual(game.computeLevelScore(ending, 60, 72, 50), 0, ending);
    assert.strictEqual(game.computeLevelScore(ending, null, 10, 50), 0, ending);
  }
});

test('reputation: cleared deal with Rel >= 70 gives +10', () => {
  const { game } = setup();
  const r = rep(game, 'deal', 70);
  assert.strictEqual(r.rep, 60);
  assert.deepStrictEqual(r.changes.map((c) => c.delta), [10]);
  assert.strictEqual(typeof r.changes[0].reason, 'string');
});

test('reputation: cleared deal with Rel < 70 gives +5', () => {
  const { game } = setup();
  const r = rep(game, 'deal', 69);
  assert.strictEqual(r.rep, 55);
  assert.deepStrictEqual(r.changes.map((c) => c.delta), [5]);
});

test('reputation: foldCleared gives +3 instead of the two clear rows', () => {
  const { game } = setup();
  for (const finalRel of [45, 85]) {
    const r = rep(game, 'foldCleared', finalRel);
    assert.strictEqual(r.rep, 53);
    assert.deepStrictEqual(r.changes.map((c) => c.delta), [3]);
  }
});

test('reputation: final Rel below 40 costs 10 on any ending, 40 does not', () => {
  const { game } = setup();
  for (const ending of ['deal', 'wonLostRelationship', 'foldCleared', 'foldFailed', 'walk', 'opponentWalk']) {
    assert.ok(rep(game, ending, 39).changes.some((c) => c.delta === -10), ending);
  }
  assert.deepStrictEqual(rep(game, 'foldFailed', 40).changes, []);
});

test('reputation: each bluff caught costs 10', () => {
  const { game } = setup();
  const one = rep(game, 'foldFailed', 55, 1);
  assert.strictEqual(one.rep, 40);
  assert.deepStrictEqual(one.changes.map((c) => c.delta), [-10]);
  const two = rep(game, 'foldFailed', 55, 2);
  assert.strictEqual(two.rep, 30);
  assert.strictEqual(two.changes.reduce((s, c) => s + c.delta, 0), -20);
});

test('reputation: walking away with Rel >= 50 gives +5, below 50 gives -5', () => {
  const { game } = setup();
  const high = rep(game, 'walk', 50);
  assert.strictEqual(high.rep, 55);
  assert.deepStrictEqual(high.changes.map((c) => c.delta), [5]);
  const low = rep(game, 'walk', 49);
  assert.strictEqual(low.rep, 45);
  assert.deepStrictEqual(low.changes.map((c) => c.delta), [-5]);
});

test('reputation: walk with Rel below 40 stacks -5 and -10', () => {
  const { game } = setup();
  const r = rep(game, 'walk', 30);
  assert.strictEqual(r.rep, 35);
  assert.deepStrictEqual(r.changes.map((c) => c.delta).sort((a, b) => a - b), [-10, -5]);
});

test('reputation: wonLostRelationship and opponentWalk get only low-Rel and bluff rows', () => {
  const { game } = setup();
  for (const ending of ['wonLostRelationship', 'opponentWalk']) {
    assert.deepStrictEqual(rep(game, ending, 45).changes, []);
    assert.strictEqual(rep(game, ending, 45).rep, 50);
    assert.strictEqual(rep(game, ending, 20, 1).rep, 30);
  }
});

test('updateReputation stacks a caught bluff with a clear, e.g. cleared Rel 75 with 1 bluff caught: +10 then -10 = net 0', () => {
  const { game } = setup();
  const r = rep(game, 'deal', 75, 1);
  assert.strictEqual(r.rep, 50);
  assert.deepStrictEqual(r.changes.map((c) => c.delta), [10, -10]);
});

test('reputation clamps to 0 and 100', () => {
  const { game } = setup();
  assert.strictEqual(rep(game, 'deal', 90, 0, 95).rep, 100);
  assert.strictEqual(rep(game, 'opponentWalk', 10, 2, 15).rep, 0);
});

test('computeFinalScore sums level scores plus 5 * rep', () => {
  const { game } = setup();
  assert.strictEqual(game.computeFinalScore([616, 516, 0], 60), 616 + 516 + 300);
  assert.strictEqual(game.computeFinalScore([], 40), 200);
});

test('bestAcceptableDV is the best DV among packages meeting the final Aeff', () => {
  const { game, state } = setup({ timeSteps: 4, pressure: 3, rel: 62 });
  const level = state.levelConfig;
  const p = level.persona;
  const A = Math.max(p.Ro, p.A0 - p.c * 4 - 3);
  const aeff = Math.max(p.Ro - 5, A - 0.15 * (62 - 50));
  let expected = null;
  for (let i = 0; i <= 12; i++) {
    for (let j = 0; j <= 10; j++) {
      const ov = 40 * i / 12 + 60 * j / 10;
      const dv = 70 * (1 - i / 12) + 30 * (1 - j / 10);
      if (ov >= aeff && (expected === null || dv > expected)) expected = dv;
    }
  }
  assert.ok(expected !== null);
  assert.ok(Math.abs(game.bestAcceptableDV(state) - expected) < 1e-9);
});

test('bestAcceptableDV returns null when no package reaches the threshold', () => {
  const { game, state } = setup();
  state.levelConfig = { ...state.levelConfig, persona: { ...state.levelConfig.persona, Ro: 200, A0: 200 } };
  assert.strictEqual(game.bestAcceptableDV(state), null);
});

test('a package whose DV equals W up to float error still counts as meeting the line', () => {
  const { game, state } = counterOnTable(HIGH_DV_PKG, 55, 65);
  assert.strictEqual(game.determineEnding(state, 'accept').ending, 'deal');
  assert.throws(() => game.determineEnding(state, 'foldConfirmed'));
});
