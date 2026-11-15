const { test } = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./helpers/load-game');

test('computeDV/computeOV match the p/q formula for level 1', () => {
  const { CONFIG, computeDV, computeOV } = loadGame();
  const level1 = CONFIG.levels[0];
  const pkg = [0, 0];
  assert.strictEqual(computeDV(level1, pkg), 100);
  assert.strictEqual(computeOV(level1, pkg), 0);
  const pkg2 = [12, 10];
  assert.strictEqual(computeDV(level1, pkg2), 0);
  assert.strictEqual(computeOV(level1, pkg2), 100);
});

test('engine constants live in CONFIG.rules', () => {
  const { CONFIG } = loadGame();
  const r = CONFIG.rules;
  assert.deepStrictEqual(r.opponent, { relCoeff: 0.15, relMidpoint: 50, floorMargin: 5, counterMargin: 3 });
  assert.deepStrictEqual(r.bluff, { lowRepBelow: 40, lowRepBonus: 0.15, perPressure: 0.20, cap: 0.95 });
  assert.deepStrictEqual(r.maxLine, { margin: 5, cap: 70 });
  assert.deepStrictEqual(r.selfTest, { minDV: 50, minMaxLine: 40 });
  assert.strictEqual(r.openingTurn, 2);
  assert.strictEqual(r.repMin, 0);
  assert.strictEqual(r.repMax, 100);
});
