const { test } = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./helpers/load-game');

test('computeAcceptanceThreshold matches the spec formula for Maya', () => {
  const { CONFIG, computeAcceptanceThreshold } = loadGame();
  const maya = CONFIG.levels[0].persona;
  const { A, Aeff } = computeAcceptanceThreshold(maya, 2, 4, 60);
  assert.strictEqual(A, 66);
  assert.strictEqual(Aeff, Math.max(45 - 5, 66 - 0.15 * 10));
});

test('computeAcceptanceThreshold floors A at Ro and Aeff at Ro - 5', () => {
  const { CONFIG, computeAcceptanceThreshold } = loadGame();
  const maya = CONFIG.levels[0].persona;
  const { A, Aeff } = computeAcceptanceThreshold(maya, 20, 30, 100);
  assert.strictEqual(A, 45);
  assert.strictEqual(Aeff, 40);
});

test('computeAcceptanceThreshold raises Aeff when Rel is below 50', () => {
  const { CONFIG, computeAcceptanceThreshold } = loadGame();
  const maya = CONFIG.levels[0].persona;
  const { A, Aeff } = computeAcceptanceThreshold(maya, 0, 0, 30);
  assert.strictEqual(A, 80);
  assert.ok(Math.abs(Aeff - 83) < 1e-9);
});

test('resolveBluffChance clamps at 0.95', () => {
  const { CONFIG, resolveBluffChance } = loadGame();
  const victoria = CONFIG.levels[2].persona;
  assert.strictEqual(resolveBluffChance(victoria, 20, 3), 0.95);
});

test('resolveBluffChance adds the low-rep and repeat-pressure terms', () => {
  const { CONFIG, resolveBluffChance } = loadGame();
  const maya = CONFIG.levels[0].persona;
  assert.ok(Math.abs(resolveBluffChance(maya, 50, 0) - 0.2) < 1e-9);
  assert.ok(Math.abs(resolveBluffChance(maya, 39, 0) - 0.35) < 1e-9);
  assert.ok(Math.abs(resolveBluffChance(maya, 40, 1) - 0.4) < 1e-9);
});

test('pickOpponentCounter has no cap when there is no previous counteroffer', () => {
  const { CONFIG, pickOpponentCounter } = loadGame();
  const level1 = CONFIG.levels[0];
  const { ov } = pickOpponentCounter(level1, [0, 0], 70, null);
  assert.ok(ov >= 70 + 3);
});

test('pickOpponentCounter caps the target at the previous counteroffer OV so the opponent does not take things back', () => {
  const { CONFIG, enumeratePackages, computeOV, computeDV, packageDistance, pickOpponentCounter } = loadGame();
  const level = CONFIG.levels[0];
  const offer = [0, 0];
  const aeff = 70;
  const previousOV = 60;
  const qualifying = enumeratePackages(level).filter((p) => computeOV(level, p) >= previousOV);
  const minDist = Math.min(...qualifying.map((p) => packageDistance(p, offer)));
  const nearest = qualifying.filter((p) => packageDistance(p, offer) === minDist);
  const bestDV = Math.max(...nearest.map((p) => computeDV(level, p)));
  const expected = nearest.find((p) => computeDV(level, p) === bestDV);
  const capped = pickOpponentCounter(level, offer, aeff, previousOV);
  const uncapped = pickOpponentCounter(level, offer, aeff, null);
  assert.ok(capped.ov >= previousOV);
  assert.deepStrictEqual(capped.pkg, expected);
  assert.notDeepStrictEqual(capped.pkg, uncapped.pkg);
});

test('pickOpponentCounter picks the nearest qualifying package, ties broken by highest DV', () => {
  const { CONFIG, enumeratePackages, computeOV, computeDV, packageDistance, pickOpponentCounter } = loadGame();
  const level = CONFIG.levels[0];
  const offer = [0, 0];
  const aeff = 60;
  const target = aeff + 3;
  const qualifying = enumeratePackages(level).filter((p) => computeOV(level, p) >= target);
  const minDist = Math.min(...qualifying.map((p) => packageDistance(p, offer)));
  const nearest = qualifying.filter((p) => packageDistance(p, offer) === minDist);
  const bestDV = Math.max(...nearest.map((p) => computeDV(level, p)));
  const result = pickOpponentCounter(level, offer, aeff, null);
  assert.strictEqual(packageDistance(result.pkg, offer), minDist);
  assert.strictEqual(computeDV(level, result.pkg), bestDV);
  assert.strictEqual(result.ov, computeOV(level, result.pkg));
});

test('pickOpponentCounter falls back to the highest-OV package when nothing meets the target', () => {
  const { CONFIG, enumeratePackages, computeOV, pickOpponentCounter } = loadGame();
  const level = CONFIG.levels[0];
  const maxOV = Math.max(...enumeratePackages(level).map((p) => computeOV(level, p)));
  const result = pickOpponentCounter(level, [0, 0], 500, null);
  assert.strictEqual(result.ov, maxOV);
});
