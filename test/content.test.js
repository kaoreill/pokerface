const { test } = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./helpers/load-game');

const BUCKETS = ['+4', '+1to3', '0', '-1to-4', '<=-5'];
const SPECIALS = ['opening', 'accepting', 'countering', 'finalOffer', 'bluffCaught', 'walkedOut'];
const first = () => 0;

// Level 1 (Jonas): terms are Your equity share, Final say, Jonas's role.
const JONAS_PREV = [2, 1, 0];
const JONAS_TRADE_PKG = [1, 1, 2]; // equity toward the player (got), role toward Jonas (gave)

function tipCtx(game, overrides = {}) {
  return {
    personaKey: 'maya',
    turnNumber: 2,
    line: 'holdFirm',
    lastLine: null,
    tone: 'neutral',
    expression: 'pokerFace',
    anchorResult: null,
    bluffCaught: false,
    skipTimeConcession: false,
    asksSoFar: 1,
    relDelta: 0,
    offerPkg: null,
    previousOwnOfferPkg: null,
    levelConfig: game.CONFIG.levels[0],
    ...overrides,
  };
}

test('every persona has >= 3 lines in every Rel-change bucket', () => {
  const { CONFIG } = loadGame();
  for (const level of CONFIG.levels) {
    for (const bucket of BUCKETS) {
      assert.ok(level.persona.lines[bucket].length >= 3, `${level.key} ${bucket}`);
    }
  }
});

test('every persona has >= 2 lines in every special bank', () => {
  const { CONFIG } = loadGame();
  for (const level of CONFIG.levels) {
    for (const special of SPECIALS) {
      assert.ok(level.persona.lines[special].length >= 2, `${level.key} ${special}`);
    }
  }
});

test('Victoria has >= 2 opening lines for each reputation band', () => {
  const { CONFIG } = loadGame();
  const victoria = CONFIG.levels.find((l) => l.personaKey === 'victoria');
  for (const band of ['respectful', 'neutral', 'distrustful']) {
    assert.ok(victoria.persona.lines.openingByRep[band].length >= 2, band);
  }
});

test('all dialogue lines are non-empty strings without emoji', () => {
  const { CONFIG } = loadGame();
  const walk = (node, where) => {
    if (Array.isArray(node)) {
      node.forEach((s) => {
        assert.strictEqual(typeof s, 'string', where);
        assert.ok(s.trim().length > 0, where);
        assert.ok(!/\p{Extended_Pictographic}/u.test(s), `${where}: ${s}`);
      });
    } else {
      Object.keys(node).forEach((k) => walk(node[k], `${where}.${k}`));
    }
  };
  for (const level of CONFIG.levels) walk(level.persona.lines, level.key);
});

test("Victoria's opening line depends on reputation band", () => {
  const { getOpponentLine } = loadGame();
  assert.notStrictEqual(
    getOpponentLine({ personaKey: 'victoria', special: 'opening', repBand: 'respectful' }),
    getOpponentLine({ personaKey: 'victoria', special: 'opening', repBand: 'distrustful' })
  );
});

test('getOpponentLine picks the first line of the right bucket bank with rng = () => 0', () => {
  const { CONFIG, getOpponentLine } = loadGame();
  for (const level of CONFIG.levels) {
    for (const bucket of BUCKETS) {
      const line = getOpponentLine({ personaKey: level.personaKey, relChangeBucket: bucket, special: null, repBand: null }, first);
      assert.strictEqual(line, level.persona.lines[bucket][0]);
    }
  }
});

test('getOpponentLine picks the first line of each special bank with rng = () => 0', () => {
  const { CONFIG, getOpponentLine } = loadGame();
  for (const level of CONFIG.levels) {
    for (const special of SPECIALS) {
      const line = getOpponentLine({ personaKey: level.personaKey, relChangeBucket: '0', special, repBand: null }, first);
      assert.strictEqual(line, level.persona.lines[special][0]);
    }
  }
});

test('Victoria opening with a repBand uses openingByRep; other personas ignore repBand', () => {
  const { CONFIG, getOpponentLine } = loadGame();
  const victoria = CONFIG.levels.find((l) => l.personaKey === 'victoria');
  assert.strictEqual(
    getOpponentLine({ personaKey: 'victoria', special: 'opening', repBand: 'neutral' }, first),
    victoria.persona.lines.openingByRep.neutral[0]
  );
  const maya = CONFIG.levels.find((l) => l.personaKey === 'maya');
  assert.strictEqual(
    getOpponentLine({ personaKey: 'maya', special: 'opening', repBand: 'distrustful' }, first),
    maya.persona.lines.opening[0]
  );
});

test('getOpponentLine picks the last line when rng is just under 1', () => {
  const { CONFIG, getOpponentLine } = loadGame();
  const bank = CONFIG.levels[0].persona.lines['+4'];
  assert.strictEqual(
    getOpponentLine({ personaKey: 'maya', relChangeBucket: '+4', special: null }, () => 0.9999),
    bank[bank.length - 1]
  );
});

test('getOpponentLine throws a clear error when a bank is missing or empty', () => {
  const { CONFIG, getOpponentLine } = loadGame();
  assert.throws(() => getOpponentLine({ personaKey: 'maya', special: 'nonsense' }), /nonsense/);
  assert.throws(() => getOpponentLine({ personaKey: 'maya', relChangeBucket: 'bogus', special: null }), /bogus/);
  assert.throws(() => getOpponentLine({ personaKey: 'nobody', relChangeBucket: '0', special: null }), /nobody/);
  const maya = CONFIG.levels[0];
  const saved = maya.persona.lines['0'];
  maya.persona.lines['0'] = [];
  try {
    assert.throws(() => getOpponentLine({ personaKey: 'maya', relChangeBucket: '0', special: null }), /empty|missing/i);
  } finally {
    maya.persona.lines['0'] = saved;
  }
});

test('relChangeBucket and getReactionFace map Rel change at every boundary', () => {
  const { relChangeBucket, getReactionFace } = loadGame();
  const expected = [
    [10, '+4', '😄', 'leans in, nodding'],
    [4, '+4', '😄', 'leans in, nodding'],
    [3, '+1to3', '🙂', 'relaxed, open posture'],
    [1, '+1to3', '🙂', 'relaxed, open posture'],
    [0, '0', '😐', 'still, hard to read'],
    [-1, '-1to-4', '😒', 'arms crossed'],
    [-4, '-1to-4', '😒', 'arms crossed'],
    [-5, '<=-5', '😠', 'leans back, looks away'],
    [-30, '<=-5', '😠', 'leans back, looks away'],
  ];
  for (const [delta, bucket, face, caption] of expected) {
    assert.strictEqual(relChangeBucket(delta), bucket, `bucket ${delta}`);
    assert.deepStrictEqual(getReactionFace(delta), { face, caption, bucket }, `face ${delta}`);
  }
});

test('repBand splits at 65 and 35', () => {
  const { repBand } = loadGame();
  assert.strictEqual(repBand(100), 'respectful');
  assert.strictEqual(repBand(65), 'respectful');
  assert.strictEqual(repBand(64), 'neutral');
  assert.strictEqual(repBand(35), 'neutral');
  assert.strictEqual(repBand(34), 'distrustful');
  assert.strictEqual(repBand(0), 'distrustful');
});

test('termDirections gives -1 / 0 / 1 per term', () => {
  const { termDirections } = loadGame();
  assert.deepStrictEqual(termDirections([3, 1, 0], [2, 1, 1]), [1, 0, -1]);
});

test('coach rule 1: a caught bluff wins over every later rule and mentions trust and reputation', () => {
  const game = loadGame();
  const tip = game.getCoachTip(tipCtx(game, {
    bluffCaught: true, line: 'concede', lastLine: 'concede', expression: 'open', skipTimeConcession: true,
    anchorResult: 'insulting', tone: 'hard', turnNumber: 4, asksSoFar: 0,
  }));
  assert.match(tip, /trust/i);
  assert.match(tip, /reputation/i);
});

test('coach rule 2: a second Concede in a row gives the exact text and beats rules 3 to 8', () => {
  const game = loadGame();
  const tip = game.getCoachTip(tipCtx(game, {
    line: 'concede', lastLine: 'concede', expression: 'open', skipTimeConcession: true,
    anchorResult: 'weak', tone: 'hard', turnNumber: 4, asksSoFar: 0,
  }));
  assert.strictEqual(tip, 'You gave something up and got nothing back. Try a Trade.');
});

test('coach rule 3: an Open expression that blocked the concession gives the exact text and beats rules 4 to 8', () => {
  const game = loadGame();
  const tip = game.getCoachTip(tipCtx(game, {
    line: 'holdFirm', expression: 'open', skipTimeConcession: true,
    anchorResult: 'insulting', tone: 'hard', turnNumber: 4, asksSoFar: 0,
  }));
  assert.strictEqual(tip, 'They could see you had room. Consider a poker face.');
});

test('coach rule 3 needs the Open expression: skipTimeConcession alone does not trigger it', () => {
  const game = loadGame();
  const tip = game.getCoachTip(tipCtx(game, { expression: 'pokerFace', skipTimeConcession: true }));
  assert.notStrictEqual(tip, 'They could see you had room. Consider a poker face.');
});

test('coach rule 4: anchor too high or too weak beats rules 5 to 8', () => {
  const game = loadGame();
  const high = game.getCoachTip(tipCtx(game, { line: 'anchor', anchorResult: 'insulting', tone: 'hard', turnNumber: 4, asksSoFar: 0 }));
  const weak = game.getCoachTip(tipCtx(game, { line: 'anchor', anchorResult: 'weak', tone: 'hard', turnNumber: 4, asksSoFar: 0 }));
  assert.match(high, /anchor/i);
  assert.match(high, /high|insult/i);
  assert.match(weak, /anchor/i);
  assert.match(weak, /weak|low|more/i);
  assert.notStrictEqual(high, weak);
});

test('coach rule 5: Hard with Maya or Jonas, Warm with Victoria, beats rules 6 to 8 and names the tone', () => {
  const game = loadGame();
  const base = { turnNumber: 4, asksSoFar: 0 };
  assert.match(game.getCoachTip(tipCtx(game, { ...base, personaKey: 'maya', tone: 'hard' })), /hard/i);
  assert.match(game.getCoachTip(tipCtx(game, { ...base, personaKey: 'jonas', tone: 'hard' })), /hard/i);
  assert.match(game.getCoachTip(tipCtx(game, { ...base, personaKey: 'victoria', tone: 'warm' })), /warm/i);
  assert.doesNotMatch(game.getCoachTip(tipCtx(game, { ...base, personaKey: 'victoria', tone: 'hard' })), /responds badly|doesn't land/i);
});

test('coach rule 6: turn 3+ with no question asked gives the exact text and beats rules 7 and 8', () => {
  const game = loadGame();
  const level = game.CONFIG.levels[1];
  const tip = game.getCoachTip(tipCtx(game, {
    personaKey: 'jonas', levelConfig: level, line: 'trade', turnNumber: 3, asksSoFar: 0,
    offerPkg: JONAS_TRADE_PKG, previousOwnOfferPkg: JONAS_PREV,
  }));
  assert.strictEqual(tip, "You still don't know what they care about.");
});

test('coach rule 6 does not fire on turn 2 or once a question has been asked', () => {
  const game = loadGame();
  assert.notStrictEqual(game.getCoachTip(tipCtx(game, { turnNumber: 2, asksSoFar: 0 })), "You still don't know what they care about.");
  assert.notStrictEqual(game.getCoachTip(tipCtx(game, { turnNumber: 5, asksSoFar: 1 })), "You still don't know what they care about.");
});

test('coach rule 7: a Trade in level 2 names the term given and the term got, and beats rule 8', () => {
  const game = loadGame();
  const level = game.CONFIG.levels[1];
  const tip = game.getCoachTip(tipCtx(game, {
    personaKey: 'jonas', levelConfig: level, line: 'trade', turnNumber: 3, asksSoFar: 1,
    offerPkg: JONAS_TRADE_PKG, previousOwnOfferPkg: JONAS_PREV,
  }));
  assert.ok(tip.includes("Jonas's role"), tip);
  assert.ok(tip.includes('Your equity share'), tip);
  assert.ok(tip.indexOf("Jonas's role") < tip.indexOf('Your equity share'), 'gave is named before got');
});

test('coach rule 7 falls through to rule 8 when the trade detail is unavailable', () => {
  const game = loadGame();
  const tip = game.getCoachTip(tipCtx(game, { line: 'trade', asksSoFar: 1, offerPkg: null, previousOwnOfferPkg: null }));
  assert.strictEqual(typeof tip, 'string');
  assert.ok(tip.length > 0);
});

test('coach rule 8: always returns a non-empty string and varies with the sign of relDelta', () => {
  const game = loadGame();
  const up = game.getCoachTip(tipCtx(game, { relDelta: 3 }));
  const flat = game.getCoachTip(tipCtx(game, { relDelta: 0 }));
  const down = game.getCoachTip(tipCtx(game, { relDelta: -3 }));
  for (const tip of [up, flat, down]) {
    assert.strictEqual(typeof tip, 'string');
    assert.ok(tip.length > 0);
  }
  assert.strictEqual(new Set([up, flat, down]).size, 3);
});

test('rep bands and reactions live in CONFIG.rules', () => {
  const { CONFIG } = loadGame();
  assert.deepStrictEqual(CONFIG.rules.repBands, { respectful: 65, neutral: 35 });
  assert.strictEqual(CONFIG.rules.reactions.length, 5);
});
