const { test } = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./helpers/load-game');

test('enumeratePackages produces the full cartesian product', () => {
  const { CONFIG, enumeratePackages } = loadGame();
  const level2 = CONFIG.levels[1]; // 7 * 4 * 3 options
  assert.strictEqual(enumeratePackages(level2).length, 7 * 4 * 3);
});

test('enumeratePackages covers every level with unique packages', () => {
  const { CONFIG, enumeratePackages } = loadGame();
  for (const level of CONFIG.levels) {
    const expected = level.terms.reduce((n, t) => n * t.options.length, 1);
    const pkgs = enumeratePackages(level);
    assert.strictEqual(pkgs.length, expected);
    assert.strictEqual(new Set(pkgs.map((p) => p.join(','))).size, expected);
  }
});

test('computeMaxLine follows the spec formula and is capped at 70', () => {
  const { CONFIG, computeMaxLine } = loadGame();
  for (const level of CONFIG.levels) {
    const maxLine = computeMaxLine(level);
    assert.ok(Number.isInteger(maxLine));
    assert.ok(maxLine <= 70);
    assert.ok(maxLine >= 40); // required by runSelfTest later, true for these three levels
  }
});

test('computeMaxLine equals floor(min(best acceptable DV - 5, 70))', () => {
  const { CONFIG, enumeratePackages, computeDV, computeOV, computeMaxLine } = loadGame();
  for (const level of CONFIG.levels) {
    let best = -Infinity;
    for (const pkg of enumeratePackages(level)) {
      if (computeOV(level, pkg) >= level.persona.Ro - 5) best = Math.max(best, computeDV(level, pkg));
    }
    assert.strictEqual(computeMaxLine(level), Math.floor(Math.min(best - 5, 70)));
  }
});

test('packageDistance sums per-term index differences', () => {
  const { packageDistance } = loadGame();
  assert.strictEqual(packageDistance([0, 0], [2, 1]), 3);
  assert.strictEqual(packageDistance([3, 1], [0, 2]), 4);
});
