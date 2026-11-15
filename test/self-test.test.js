const { test } = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./helpers/load-game');

test('runSelfTest passes all four checks for all three levels', () => {
  const { runSelfTest } = loadGame();
  const result = runSelfTest({ log: false });
  assert.strictEqual(result.levels.length, 3);
  for (const level of result.levels) {
    assert.strictEqual(level.checks.length, 4);
    for (const check of level.checks) {
      assert.ok(check.pass, `${level.key}: ${check.name} — ${check.detail}`);
    }
  }
  assert.strictEqual(result.passed, true);
});

test('runSelfTest reports a failing check instead of throwing', () => {
  const game = loadGame();
  game.CONFIG.levels[0].persona.Ro = 200;
  const result = game.runSelfTest({ log: false });
  assert.strictEqual(result.passed, false);
  assert.ok(result.levels[0].checks.some((c) => !c.pass));
});
