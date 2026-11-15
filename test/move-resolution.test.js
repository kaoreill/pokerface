const { test } = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./helpers/load-game');

function ctx(overrides = {}) {
  return {
    personaKey: 'maya',
    turnNumber: 2,
    offerPkg: [0, 0],
    previousOwnOfferPkg: [0, 0],
    offerDV: 50,
    W: 60,
    asksSoFar: 0,
    termCount: 2,
    holdFirmStreak: 0,
    pokerFaceStreak: 0,
    lastLine: null,
    ...overrides,
  };
}

// Neutral tone's Rel contribution per persona, added to every neutral-tone assertion below.
const NEUTRAL = { maya: 1, jonas: 0, victoria: 0 };

function effects(line, tone, expression, personaKey, overrides = {}) {
  const { CONFIG, applyMoveEffects } = loadGame();
  const level = CONFIG.levels.find((l) => l.personaKey === personaKey);
  return applyMoveEffects(line, tone, expression, level.persona, ctx({ personaKey, ...overrides }));
}

// --- classifyOfferChange / isOfferLegal ---

test('classifyOfferChange counts terms moving toward the opponent and toward the player', () => {
  const { classifyOfferChange } = loadGame();
  assert.deepStrictEqual(classifyOfferChange([2, 0], [0, 1]), { towardOpponent: 1, towardPlayer: 1 });
  assert.deepStrictEqual(classifyOfferChange([1, 1, 1], [1, 1, 1]), { towardOpponent: 0, towardPlayer: 0 });
  assert.deepStrictEqual(classifyOfferChange([3, 2, 0], [1, 0, 0]), { towardOpponent: 2, towardPlayer: 0 });
});

test('isOfferLegal: from turn 2, moving only toward the player is illegal', () => {
  const { isOfferLegal } = loadGame();
  const r = isOfferLegal([0, 0], [1, 0], 2);
  assert.strictEqual(r.legal, false);
  assert.strictEqual(r.reason, "You can't take back what you already offered.");
});

test('isOfferLegal: mixed, identical and toward-opponent offers are legal from turn 2', () => {
  const { isOfferLegal } = loadGame();
  assert.strictEqual(isOfferLegal([2, 0], [1, 1], 2).legal, true);
  assert.strictEqual(isOfferLegal([1, 1], [1, 1], 3).legal, true);
  assert.strictEqual(isOfferLegal([2, 1], [1, 1], 4).legal, true);
});

test('isOfferLegal: turn 1 or no previous offer is always legal', () => {
  const { isOfferLegal } = loadGame();
  assert.strictEqual(isOfferLegal([0, 0], [1, 0], 1).legal, true);
  assert.strictEqual(isOfferLegal([0, 0], null, 2).legal, true);
});

// --- isLineLegal ---

test('Anchor is legal on turn 1 only', () => {
  const { isLineLegal } = loadGame();
  assert.strictEqual(isLineLegal('anchor', ctx({ turnNumber: 1, previousOwnOfferPkg: null })).legal, true);
  const r = isLineLegal('anchor', ctx({ turnNumber: 2 }));
  assert.strictEqual(r.legal, false);
  assert.strictEqual(typeof r.reason, 'string');
});

test('Anchor is legal on turn 2+ while no own offer exists yet, and illegal once one does', () => {
  const { isLineLegal } = loadGame();
  assert.strictEqual(isLineLegal('anchor', ctx({ turnNumber: 2, previousOwnOfferPkg: null })).legal, true);
  assert.strictEqual(isLineLegal('anchor', ctx({ turnNumber: 4, previousOwnOfferPkg: null })).legal, true);
  const r = isLineLegal('anchor', ctx({ turnNumber: 2, previousOwnOfferPkg: [0, 0] }));
  assert.strictEqual(r.legal, false);
  assert.strictEqual(r.reason, 'Only for your opening offer.');
});

test('Turn 2+ with no previous own offer: trade/holdFirm/concede are illegal and do not throw', () => {
  const { isLineLegal } = loadGame();
  for (const line of ['trade', 'holdFirm', 'concede']) {
    const r = isLineLegal(line, ctx({ turnNumber: 2, offerPkg: [1, 1], previousOwnOfferPkg: null }));
    assert.strictEqual(r.legal, false, line);
    assert.strictEqual(r.reason, 'Make an opening offer first.', line);
  }
});

test('Turn 2+ with no previous own offer: askQuestion and pressure are unaffected', () => {
  const { isLineLegal } = loadGame();
  const c = ctx({ turnNumber: 2, offerPkg: [1, 1], previousOwnOfferPkg: null });
  assert.strictEqual(isLineLegal('askQuestion', c).legal, true);
  assert.strictEqual(isLineLegal('pressure', c).legal, true);
});

test('Ask a question is legal on any turn while asksSoFar < termCount', () => {
  const { isLineLegal } = loadGame();
  assert.strictEqual(isLineLegal('askQuestion', ctx({ turnNumber: 1, previousOwnOfferPkg: null })).legal, true);
  assert.strictEqual(isLineLegal('askQuestion', ctx({ asksSoFar: 1, termCount: 2 })).legal, true);
  const r = isLineLegal('askQuestion', ctx({ asksSoFar: 2, termCount: 2 }));
  assert.strictEqual(r.legal, false);
  assert.strictEqual(typeof r.reason, 'string');
});

test('Trade needs a term toward the opponent and a term toward the player, from turn 2', () => {
  const { isLineLegal } = loadGame();
  assert.strictEqual(isLineLegal('trade', ctx({ offerPkg: [2, 0], previousOwnOfferPkg: [0, 1] })).legal, true);
  assert.strictEqual(isLineLegal('trade', ctx({ offerPkg: [2, 1], previousOwnOfferPkg: [0, 1] })).legal, false);
  assert.strictEqual(isLineLegal('trade', ctx({ offerPkg: [0, 1], previousOwnOfferPkg: [0, 1] })).legal, false);
  assert.strictEqual(isLineLegal('trade', ctx({ offerPkg: [0, 0], previousOwnOfferPkg: [0, 1] })).legal, false);
  assert.strictEqual(isLineLegal('trade', ctx({ turnNumber: 1, offerPkg: [2, 0], previousOwnOfferPkg: null })).legal, false);
});

test('Hold firm needs turn 2+ and an offer identical to the previous offer', () => {
  const { isLineLegal } = loadGame();
  assert.strictEqual(isLineLegal('holdFirm', ctx({ offerPkg: [1, 1], previousOwnOfferPkg: [1, 1] })).legal, true);
  assert.strictEqual(isLineLegal('holdFirm', ctx({ offerPkg: [2, 1], previousOwnOfferPkg: [1, 1] })).legal, false);
  assert.strictEqual(isLineLegal('holdFirm', ctx({ turnNumber: 1, offerPkg: [1, 1], previousOwnOfferPkg: null })).legal, false);
});

test('Concede needs a term toward the opponent and none toward the player, from turn 2', () => {
  const { isLineLegal } = loadGame();
  assert.strictEqual(isLineLegal('concede', ctx({ offerPkg: [2, 1], previousOwnOfferPkg: [1, 1] })).legal, true);
  assert.strictEqual(isLineLegal('concede', ctx({ offerPkg: [2, 0], previousOwnOfferPkg: [1, 1] })).legal, false);
  assert.strictEqual(isLineLegal('concede', ctx({ offerPkg: [1, 1], previousOwnOfferPkg: [1, 1] })).legal, false);
  assert.strictEqual(isLineLegal('concede', ctx({ turnNumber: 1, offerPkg: [2, 1], previousOwnOfferPkg: null })).legal, false);
});

test('Pressure is legal from turn 2 only', () => {
  const { isLineLegal } = loadGame();
  assert.strictEqual(isLineLegal('pressure', ctx()).legal, true);
  assert.strictEqual(isLineLegal('pressure', ctx({ turnNumber: 1, previousOwnOfferPkg: null })).legal, false);
});

test('legal lines report reason null', () => {
  const { isLineLegal } = loadGame();
  assert.strictEqual(isLineLegal('pressure', ctx()).reason, null);
});

// --- Line table ---

test('Anchor: DV 75-90 gives pressure +4, Rel -2, strong', () => {
  for (const dv of [75, 82, 90]) {
    const e = effects('anchor', 'neutral', 'pokerFace', 'maya', { turnNumber: 1, offerDV: dv });
    assert.strictEqual(e.pressureDelta, 4, `dv ${dv}`);
    assert.strictEqual(e.relDelta, -2 + NEUTRAL.maya, `dv ${dv}`);
    assert.strictEqual(e.anchorResult, 'strong');
  }
});

test('Anchor above 90 is insulting: Rel -10, no pressure', () => {
  const e = effects('anchor', 'neutral', 'pokerFace', 'maya', { turnNumber: 1, offerDV: 95 });
  assert.strictEqual(e.relDelta, -10 + NEUTRAL.maya);
  assert.strictEqual(e.pressureDelta, 0);
  assert.strictEqual(e.anchorResult, 'insulting');
});

test('Anchor below 75 has no effect and is weak', () => {
  const e = effects('anchor', 'neutral', 'pokerFace', 'maya', { turnNumber: 1, offerDV: 74.9 });
  assert.strictEqual(e.relDelta, NEUTRAL.maya);
  assert.strictEqual(e.pressureDelta, 0);
  assert.strictEqual(e.anchorResult, 'weak');
});

test('Anchor: a real package a hair under the strong boundary still counts as strong', () => {
  const { CONFIG, computeDV } = loadGame();
  const level = CONFIG.levels[2];
  const dv = computeDV(level, [0, 4, 0, 1, 1]);
  assert.ok(dv < 75 && dv > 75 - 1e-9);
  assert.strictEqual(effects('anchor', 'neutral', 'pokerFace', 'victoria', { turnNumber: 1, offerDV: dv }).anchorResult, 'strong');
  assert.strictEqual(effects('anchor', 'neutral', 'pokerFace', 'maya', { turnNumber: 1, offerDV: 75 - 1e-12 }).anchorResult, 'strong');
});

test('Anchor: a hair above the insulting boundary is still strong', () => {
  const e = effects('anchor', 'neutral', 'pokerFace', 'maya', { turnNumber: 1, offerDV: 90 + 1e-12 });
  assert.strictEqual(e.anchorResult, 'strong');
  assert.strictEqual(effects('anchor', 'neutral', 'pokerFace', 'maya', { turnNumber: 1, offerDV: 90.1 }).anchorResult, 'insulting');
});

test('Open: a real package a hair under W + roomMargin still skips the time concession', () => {
  const { CONFIG, computeDV } = loadGame();
  const dv = computeDV(CONFIG.levels[0], [6, 0]);
  assert.ok(dv < 65 && dv > 65 - 1e-9);
  const e = effects('trade', 'neutral', 'open', 'maya', { offerDV: dv, W: 50 });
  assert.strictEqual(e.skipTimeConcession, true);
  assert.strictEqual(effects('trade', 'neutral', 'open', 'maya', { offerDV: 64.9, W: 50 }).skipTimeConcession, false);
});

test('anchorResult is null for other lines', () => {
  const e = effects('holdFirm', 'neutral', 'pokerFace', 'victoria');
  assert.strictEqual(e.anchorResult, null);
});

test('Ask a question: Rel +4 for Maya and Jonas, +1 for Victoria', () => {
  assert.strictEqual(effects('askQuestion', 'neutral', 'pokerFace', 'maya').relDelta, 4 + NEUTRAL.maya);
  assert.strictEqual(effects('askQuestion', 'neutral', 'pokerFace', 'jonas').relDelta, 4);
  assert.strictEqual(effects('askQuestion', 'neutral', 'pokerFace', 'victoria').relDelta, 1);
  assert.strictEqual(effects('askQuestion', 'neutral', 'pokerFace', 'maya').pressureDelta, 0);
});

test('Ask a question works with no offer package', () => {
  const e = effects('askQuestion', 'neutral', 'pokerFace', 'maya', { turnNumber: 1, offerPkg: null, offerDV: null, previousOwnOfferPkg: null });
  assert.strictEqual(e.relDelta, 4 + NEUTRAL.maya);
});

test('Trade: Rel +3 and a tradeBonus of 5; other lines have tradeBonus 0', () => {
  const e = effects('trade', 'neutral', 'pokerFace', 'victoria');
  assert.strictEqual(e.relDelta, 3);
  assert.strictEqual(e.tradeBonus, 5);
  assert.strictEqual(effects('concede', 'neutral', 'pokerFace', 'victoria').tradeBonus, 0);
});

test('Hold firm: pressure +2 and persona Rel (Maya -1, Jonas -3, Victoria 0)', () => {
  const m = effects('holdFirm', 'neutral', 'pokerFace', 'maya');
  assert.strictEqual(m.pressureDelta, 2);
  assert.strictEqual(m.relDelta, -1 + NEUTRAL.maya);
  assert.strictEqual(effects('holdFirm', 'neutral', 'pokerFace', 'jonas').relDelta, -3);
  assert.strictEqual(effects('holdFirm', 'neutral', 'pokerFace', 'victoria').relDelta, 0);
});

test('Hold firm: streak of 1 prior is the 2nd in a row, no extra penalty', () => {
  assert.strictEqual(effects('holdFirm', 'neutral', 'pokerFace', 'jonas', { holdFirmStreak: 1 }).relDelta, -3);
});

test('Hold firm: 3rd and later in a row add an extra Rel -5 (Jonas -3 + -5)', () => {
  assert.strictEqual(effects('holdFirm', 'neutral', 'pokerFace', 'jonas', { holdFirmStreak: 2 }).relDelta, -8);
  assert.strictEqual(effects('holdFirm', 'neutral', 'pokerFace', 'jonas', { holdFirmStreak: 4 }).relDelta, -8);
  assert.strictEqual(effects('holdFirm', 'neutral', 'pokerFace', 'victoria', { holdFirmStreak: 2 }).relDelta, -5);
});

test('Concede: Rel +2, time concession skipped only after a previous Concede', () => {
  const first = effects('concede', 'neutral', 'pokerFace', 'maya', { lastLine: 'holdFirm' });
  assert.strictEqual(first.relDelta, 2 + NEUTRAL.maya);
  assert.strictEqual(first.skipTimeConcession, false);
  const second = effects('concede', 'neutral', 'pokerFace', 'maya', { lastLine: 'concede' });
  assert.strictEqual(second.skipTimeConcession, true);
  assert.strictEqual(effects('trade', 'neutral', 'pokerFace', 'maya', { lastLine: 'concede' }).skipTimeConcession, false);
});

test('Pressure marks isBluffAttempt with no line Rel or pressure, regardless of tone', () => {
  for (const tone of ['warm', 'neutral', 'firm', 'hard']) {
    assert.strictEqual(effects('pressure', tone, 'pokerFace', 'maya').isBluffAttempt, true, tone);
  }
  const e = effects('pressure', 'neutral', 'pokerFace', 'jonas');
  assert.strictEqual(e.relDelta, 0);
  assert.strictEqual(e.pressureDelta, 0);
  assert.strictEqual(effects('holdFirm', 'neutral', 'pokerFace', 'maya').isBluffAttempt, false);
});

// --- Tone table ---

test('Tone table: Rel and pressure for every tone and persona', () => {
  const table = {
    warm: { maya: 3, jonas: 2, victoria: -1, pressure: 0 },
    neutral: { maya: 1, jonas: 0, victoria: 0, pressure: 0 },
    firm: { maya: -1, jonas: -3, victoria: 2, pressure: 1 },
    hard: { maya: -6, jonas: -8, victoria: -4, pressure: 3 },
  };
  for (const [tone, row] of Object.entries(table)) {
    for (const key of ['maya', 'jonas', 'victoria']) {
      const e = effects('pressure', tone, 'pokerFace', key);
      assert.strictEqual(e.relDelta, row[key], `${tone}/${key} rel`);
      assert.strictEqual(e.pressureDelta, row.pressure, `${tone}/${key} pressure`);
    }
  }
});

test('Tone, line and expression deltas sum (Hard + Hold firm + Open, Jonas)', () => {
  const e = effects('holdFirm', 'hard', 'open', 'jonas');
  assert.strictEqual(e.relDelta, -3 + -8 + 1);
  assert.strictEqual(e.pressureDelta, 2 + 3);
});

// --- Expression ---

test('Open: Rel +1', () => {
  assert.strictEqual(effects('pressure', 'neutral', 'open', 'victoria').relDelta, 1);
});

test('Open skips the time concession when offerDV is W+15 or more', () => {
  assert.strictEqual(effects('holdFirm', 'neutral', 'open', 'maya', { offerDV: 75, W: 60 }).skipTimeConcession, true);
  assert.strictEqual(effects('holdFirm', 'neutral', 'open', 'maya', { offerDV: 80, W: 60 }).skipTimeConcession, true);
  assert.strictEqual(effects('holdFirm', 'neutral', 'open', 'maya', { offerDV: 74.9, W: 60 }).skipTimeConcession, false);
});

test('Poker face with a high offerDV does not skip the time concession', () => {
  assert.strictEqual(effects('holdFirm', 'neutral', 'pokerFace', 'maya', { offerDV: 90, W: 60 }).skipTimeConcession, false);
});

test('Poker face: no effect for the first three in a row', () => {
  for (const streak of [0, 1, 2]) {
    assert.strictEqual(effects('pressure', 'neutral', 'pokerFace', 'victoria', { pokerFaceStreak: streak }).relDelta, 0, `streak ${streak}`);
  }
});

test('Poker face: 4th and later in a row cost Rel -2', () => {
  assert.strictEqual(effects('pressure', 'neutral', 'pokerFace', 'victoria', { pokerFaceStreak: 3 }).relDelta, -2);
  assert.strictEqual(effects('pressure', 'neutral', 'pokerFace', 'victoria', { pokerFaceStreak: 6 }).relDelta, -2);
});

test('Open ignores the poker-face streak', () => {
  assert.strictEqual(effects('pressure', 'neutral', 'open', 'victoria', { pokerFaceStreak: 5 }).relDelta, 1);
});
