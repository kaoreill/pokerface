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
