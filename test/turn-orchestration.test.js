const { test } = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./helpers/load-game');

// Level 0 (Maya): OV([i, j]) = 40*i/12 + 60*j/10, DV([i, j]) = 70*(1 - i/12) + 30*(1 - j/10).
const FIRM_OFFER = [3, 0]; // DV 82.5, OV 10: far too low for Maya to accept at any point in these tests

function setup(overrides = {}) {
  const game = loadGame();
  const level = game.CONFIG.levels[0];
  const base = game.createInitialHandState(level, 50, 50);
  return { game, level, state: { ...base, ...overrides } };
}

function mid(overrides = {}) {
  return setup({ turnNumber: 2, previousOwnOfferPkg: FIRM_OFFER, ...overrides });
}

function move(line, overrides = {}) {
  return { offerPkg: FIRM_OFFER, line, tone: 'neutral', expression: 'pokerFace', ...overrides };
}

test('createInitialHandState builds a fresh hand with Rel from the persona', () => {
  const { game, level } = setup();
  const s = game.createInitialHandState(level, 60, 50);
  assert.strictEqual(s.rel, 55);
  assert.strictEqual(s.W, 60);
  assert.strictEqual(s.turnNumber, 1);
  assert.strictEqual(s.timeSteps, 0);
  assert.strictEqual(s.pressure, 0);
  assert.deepStrictEqual(s.log, []);
  assert.deepStrictEqual(s.revealedTerms, []);
  assert.strictEqual(s.previousOwnOfferPkg, null);
  assert.strictEqual(s.ended, false);
  assert.strictEqual(s.endingType, null);
  const low = game.createInitialHandState(game.CONFIG.levels[1], 60, 0);
  assert.strictEqual(low.rel, 30);
});

test('turn 1 Ask a question opens with a package closest to OV = A0', () => {
  const { game, level, state } = setup();
  const next = game.playTurn(state, move('askQuestion', { offerPkg: null }));

  let best = null;
  for (const pkg of game.enumeratePackages(level)) {
    const gap = Math.abs(game.computeOV(level, pkg) - level.persona.A0);
    const dv = game.computeDV(level, pkg);
    if (!best || gap < best.gap || (gap === best.gap && dv > best.dv)) best = { pkg, gap, dv };
  }
  assert.deepStrictEqual(next.opponentCounterPkg, best.pkg);
  assert.strictEqual(next.opponentCounterOV, game.computeOV(level, best.pkg));
  assert.strictEqual(next.ended, false);
  assert.strictEqual(next.log[0].response, 'counter');
  assert.deepStrictEqual(next.log[0].counterPkg, best.pkg);
  assert.strictEqual(next.log[0].offerPkg, null);
  assert.deepStrictEqual(next.revealedTerms, ['Equity']);
  assert.strictEqual(next.log[0].revealedTerm, 'Equity');
  assert.strictEqual(next.asksSoFar, 1);
  assert.strictEqual(next.timeSteps, 1);
  assert.strictEqual(next.rel, 60);
  assert.strictEqual(next.turnNumber, 2);
});

test('previousOwnOfferPkg stays null after a turn-1 Ask and the next turn Anchor passes validation', () => {
  const { game, state } = setup();
  const afterAsk = game.playTurn(state, move('askQuestion', { offerPkg: null }));
  assert.strictEqual(afterAsk.previousOwnOfferPkg, null);
  const afterAnchor = game.playTurn(afterAsk, move('anchor'));
  assert.deepStrictEqual(afterAnchor.previousOwnOfferPkg, FIRM_OFFER);
  assert.strictEqual(afterAnchor.log[1].anchorResult, 'strong');
  assert.strictEqual(afterAnchor.turnNumber, 3);
});

test('a later Ask reveals the next most important term and uses the locked previous offer', () => {
  const { game, state } = mid({ revealedTerms: ['Equity'], asksSoFar: 1 });
  const next = game.playTurn(state, move('askQuestion', { offerPkg: [0, 0] }));
  assert.deepStrictEqual(next.revealedTerms, ['Equity', 'Salary']);
  assert.deepStrictEqual(next.log[0].offerPkg, FIRM_OFFER);
  assert.deepStrictEqual(next.previousOwnOfferPkg, FIRM_OFFER);
  assert.strictEqual(next.asksSoFar, 2);
  assert.throws(() => game.playTurn(next, move('askQuestion')), /every term/);
});

test('opponent walks out the instant cumulative Rel this turn drops to 15 or below', () => {
  const { game, state } = mid({ rel: 22, timeSteps: 3 });
  const next = game.playTurn(state, move('holdFirm', { tone: 'hard' }));
  assert.strictEqual(next.rel, 15);
  assert.strictEqual(next.ended, true);
  assert.strictEqual(next.endingType, 'opponentWalk');
  assert.strictEqual(next.opponentCounterPkg, null);
  assert.strictEqual(next.opponentCounterOV, null);
  assert.strictEqual(next.timeSteps, 3);
  assert.strictEqual(next.log[0].response, 'walkout');
  assert.strictEqual(next.log[0].counterPkg, null);
  assert.strictEqual(next.log[0].relDelta, -7);
});

test('Rel just above 15 does not walk out', () => {
  const { game, state } = mid({ rel: 23 });
  const next = game.playTurn(state, move('holdFirm', { tone: 'hard' }));
  assert.strictEqual(next.rel, 16);
  assert.strictEqual(next.ended, false);
});

test('a caught bluff counts toward the same-turn walkout check', () => {
  const { game, state } = mid({ rel: 29 });
  const next = game.playTurn(state, move('pressure'), () => 0.01);
  assert.strictEqual(next.rel, 15);
  assert.strictEqual(next.endingType, 'opponentWalk');
  assert.strictEqual(next.bluffsCaughtThisLevel, 1);
  assert.strictEqual(next.timeSteps, 0);
});

test('from turn 2 on, an offer that only moves terms toward the player is rejected', () => {
  const { game, state } = mid({ previousOwnOfferPkg: [3, 2] });
  const before = JSON.stringify(state);
  assert.throws(() => game.playTurn(state, move('pressure', { offerPkg: [2, 2] })), /take back/);
  assert.strictEqual(JSON.stringify(state), before);
});

test('an offer with DV below W is rejected', () => {
  const { game, state } = setup();
  assert.throws(() => game.playTurn(state, move('anchor', { offerPkg: [12, 10] })), /below your line/);
});

test('an offer whose DV is a float hair under W is allowed', () => {
  const { game, level, state } = setup({ W: 65 });
  assert.ok(game.computeDV(level, [6, 0]) < 65);
  assert.doesNotThrow(() => game.playTurn(state, move('anchor', { offerPkg: [6, 0] })));
});

test('an illegal line is rejected with its reason', () => {
  const { game, state } = setup();
  assert.throws(() => game.playTurn(state, move('trade')), /Trade needs an earlier offer/);
});

test('the counter on the final turn (turnNumber === maxTurns) is marked isFinalOffer', () => {
  const { game, state } = mid({ turnNumber: level0MaxTurns() });
  const final = game.playTurn(state, move('holdFirm'));
  assert.strictEqual(final.isFinalOffer, true);
  assert.notStrictEqual(final.opponentCounterPkg, null);

  const earlier = game.playTurn(mid({ turnNumber: level0MaxTurns() - 1 }).state, move('holdFirm'));
  assert.strictEqual(earlier.isFinalOffer, false);
});

test('no further move can be played once the counter is a final offer', () => {
  const { game, state } = mid({ turnNumber: level0MaxTurns() });
  const final = game.playTurn(state, move('holdFirm'));
  assert.throws(() => game.playTurn(final, move('holdFirm')), /final offer/i);
});

test('no move can be played once the hand has ended', () => {
  const { game, state } = mid({ ended: true, endingType: 'deal' });
  assert.throws(() => game.playTurn(state, move('holdFirm')), /ended/i);
});

test('time concession is skipped on a repeated Concede', () => {
  const { game, state } = mid({ timeSteps: 2, lastLine: 'concede' });
  const next = game.playTurn(state, move('concede', { offerPkg: [4, 0] }));
  assert.strictEqual(next.timeSteps, 2);
  assert.strictEqual(next.log[0].skipTimeConcession, true);

  const first = mid({ timeSteps: 2, lastLine: 'holdFirm' });
  assert.strictEqual(game.playTurn(first.state, move('concede', { offerPkg: [4, 0] })).timeSteps, 3);
});

test('time concession is skipped on an Open offer with DV >= W + 15', () => {
  const { game, state } = mid({ timeSteps: 2 });
  const open = game.playTurn(state, move('holdFirm', { expression: 'open' }));
  assert.strictEqual(open.timeSteps, 2);
  const poker = game.playTurn(state, move('holdFirm', { expression: 'pokerFace' }));
  assert.strictEqual(poker.timeSteps, 3);
});

test('a Pressure bluff that is caught costs Rel and pressure and is recorded', () => {
  const { game, state } = mid();
  const next = game.playTurn(state, move('pressure'), () => 0.01);
  assert.strictEqual(next.rel, 55 - 15 + 1);
  assert.strictEqual(next.pressure, -5);
  assert.strictEqual(next.bluffsCaughtThisLevel, 1);
  assert.strictEqual(next.pressureCountThisLevel, 1);
  assert.strictEqual(next.log[0].bluffAttempted, true);
  assert.strictEqual(next.log[0].bluffCaught, true);
  assert.strictEqual(next.log[0].relDelta, -14);
  assert.strictEqual(next.log[0].pressureDelta, -5);
});

test('a Pressure bluff that is not caught adds pressure', () => {
  const { game, state } = mid();
  const next = game.playTurn(state, move('pressure'), () => 0.99);
  assert.strictEqual(next.pressure, 8);
  assert.strictEqual(next.rel, 56);
  assert.strictEqual(next.bluffsCaughtThisLevel, 0);
  assert.strictEqual(next.pressureCountThisLevel, 1);
  assert.strictEqual(next.log[0].bluffCaught, false);
});

test('earlier Pressure lines raise the later catch chance whether or not they were caught', () => {
  const { game, state } = mid();
  const first = game.playTurn(state, move('pressure'), () => 0.99);
  assert.strictEqual(first.pressureCountThisLevel, 1);
  // chance is now 0.20 + 0.20 = 0.40, so 0.3 is caught where it was not on the first Pressure
  const second = game.playTurn(first, move('pressure'), () => 0.3);
  assert.strictEqual(second.log[1].bluffCaught, true);
  assert.strictEqual(second.pressureCountThisLevel, 2);
});

test('the opponent accepts an offer that clears the threshold, recording the deal', () => {
  const game = loadGame();
  const state = { ...game.createInitialHandState(game.CONFIG.levels[0], 30, 50), turnNumber: 2, previousOwnOfferPkg: [3, 10], timeSteps: 5 };
  const next = game.playTurn(state, move('holdFirm', { offerPkg: [3, 10] }));
  assert.strictEqual(next.ended, true);
  assert.strictEqual(next.endingType, 'deal');
  assert.deepStrictEqual(next.agreedPkg, [3, 10]);
  assert.strictEqual(next.log[0].response, 'accept');
  assert.strictEqual(next.timeSteps, 6);
});

test('Trade adds its OV bonus to the acceptance check', () => {
  const game = loadGame();
  const level = game.CONFIG.levels[0];
  const offer = [5, 9];
  const state = { ...game.createInitialHandState(level, 30, 50), turnNumber: 2, previousOwnOfferPkg: [4, 10] };
  const next = game.playTurn(state, move('trade', { offerPkg: offer }));
  const { Aeff } = game.computeAcceptanceThreshold(level.persona, 1, 0, 59);
  const ov = game.computeOV(level, offer);
  assert.ok(ov < Aeff && ov + 5 >= Aeff);
  assert.strictEqual(next.endingType, 'deal');
  assert.strictEqual(next.log[0].tradeBonus, 5);
});

test('playTurn does not mutate its input state', () => {
  const { game, state } = mid();
  const before = JSON.stringify(state);
  const logRef = state.log;
  const revealedRef = state.revealedTerms;
  const next = game.playTurn(state, move('askQuestion'));
  assert.strictEqual(JSON.stringify(state), before);
  assert.strictEqual(state.log, logRef);
  assert.strictEqual(state.revealedTerms, revealedRef);
  assert.strictEqual(state.log.length, 0);
  assert.strictEqual(state.revealedTerms.length, 0);
  assert.notStrictEqual(next, state);
  assert.strictEqual(next.levelConfig, state.levelConfig);
});

test('bookkeeping: streaks, lastLine, previousOwnOfferPkg and the log entry', () => {
  const { game, state } = mid({ holdFirmStreak: 1, pokerFaceStreak: 2 });
  const next = game.playTurn(state, move('holdFirm'));
  assert.strictEqual(next.holdFirmStreak, 2);
  assert.strictEqual(next.pokerFaceStreak, 3);
  assert.strictEqual(next.lastLine, 'holdFirm');
  assert.deepStrictEqual(next.previousOwnOfferPkg, FIRM_OFFER);
  const e = next.log[0];
  assert.strictEqual(e.turn, 2);
  assert.strictEqual(e.line, 'holdFirm');
  assert.strictEqual(e.tone, 'neutral');
  assert.strictEqual(e.expression, 'pokerFace');
  assert.strictEqual(e.relAfter, next.rel);
  assert.strictEqual(e.pressureDelta, 2);
  assert.strictEqual(e.response, 'counter');
  assert.deepStrictEqual(e.counterPkg, next.opponentCounterPkg);

  const reset = game.playTurn(next, move('holdFirm', { expression: 'open' }));
  assert.strictEqual(reset.pokerFaceStreak, 0);
  assert.strictEqual(reset.holdFirmStreak, 3);
  assert.strictEqual(game.playTurn(next, move('concede', { offerPkg: [4, 0] })).holdFirmStreak, 0);
});

function level0MaxTurns() {
  return loadGame().CONFIG.levels[0].persona.maxTurns;
}
