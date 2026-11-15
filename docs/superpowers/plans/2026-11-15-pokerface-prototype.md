# Poker Face Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-file (`index.html`) browser prototype of the Poker Face negotiation game, matching the spec exactly.

**Architecture:** One inline `<script>` in `index.html` holds all logic in plain functions operating on plain objects (`CONFIG`, a per-hand state object). The same script is dual-exported (`if (typeof module !== 'undefined') module.exports = {...}`) so Node's built-in test runner (`node --test`) can exercise the pure game logic without a browser. DOM rendering/event wiring is added last, on top of the already-tested logic, and verified manually in a real browser since it has no meaningful unit-testable surface.

**Tech Stack:** Vanilla HTML/CSS/JS only. No frameworks, no bundler. Tests use Node's built-in `node:test` + `node:assert` (no npm install) against logic extracted from `index.html`.

**Spec:** `/home/katej/projects/pokerface/pokerface.md` (the user's own build prompt — approved as-is as the design spec; no separate design doc was written).

## Global Constraints

- Ship exactly one file, `index.html`: all HTML/CSS/JS inline, no build step, no frameworks/libraries/fonts/images/network requests. Must work both via GitHub Pages and opened directly from disk.
- All opponent dialogue goes through one function, `getOpponentLine(context)`; all coach text through one function, `getCoachTip(context)`.
- Every tunable number lives in a single `CONFIG` object at the top of the script.
- Game state is one plain object. `localStorage` is used only for the high score, wrapped in try/catch.
- Usable on a phone (single column under 700px) and fully by keyboard.
- Visuals are emoji + CSS only: dark green felt, card-shaped panels, suits ♠ ♥ ♦ ♣ as accents, chip stacks for the three scores.
- `runSelfTest()` runs on page load and logs to the console; if a check fails, CONFIG numbers must be tuned until all pass, and the tuning documented.

## Review Focus

- **No prior counteroffer on the opponent's first counter** (turn 1 real offer, not accepted): step 7's "never higher than the OV of their previous counteroffer" cap has nothing to apply to yet — the engine must not invent a cap of 0 or crash; `pickOpponentCounter` must treat "no previous counteroffer" as "no cap."
- **Bluff-detection probability can exceed 1.0**: persona `bluffDetection` + 0.15 (low Rep) + 0.20 × earlier-Pressure-count can sum past 1, which breaks `Math.random() < chance` semantics for "never caught" — `resolveBluffChance` must clamp to a valid probability.
- **Rel hits ≤15 mid-turn from combined line+tone+expression deltas**: the walkout check (step 3) must run after Rel is clamped from *all* of that turn's sources, before any time-step increment or counteroffer calc — a reasonable implementer could instead check Rel after each individual delta and walk out early for the wrong reason, or skip the walkout and still compute a counter.
- **Default slider value for `W` can fall outside `[30, maxLine]`** when a level's computed `maxLine` is below the spec's stated default of 50 — the UI must clamp the default, not just the range.
- **The final-turn counteroffer must actually be un-actionable except accept/walk**: it's not enough to show a "final offer" label — the offer-builder controls and "Play move" must be disabled/hidden once `isFinalOffer` is true, or a player could keep negotiating past the spec's turn limit.

---

### Task 1: Project setup, CONFIG, and core value functions

**Files:**
- Create: `index.html` (skeleton `<!DOCTYPE html>` + empty `<body>` + one `<script>` block containing `CONFIG` and the functions below, with a trailing `if (typeof module !== 'undefined') { module.exports = { CONFIG, computeDV, computeOV }; }`)
- Create: `test/helpers/load-game.js` — exports `loadGame()`: reads `index.html`, extracts the text between the single `<script>`/`</script>` pair with a regex, writes it to `test/.tmp/game.js`, `require`s it fresh (bust Node's cache) and returns the module's exports.
- Create: `test/core.test.js`

**Interfaces:**
- Produces: `CONFIG` (object: `CONFIG.levels` is an array of 3 level configs, each `{ key, name, suit, opponentName, terms: [{ name, options: [...], playerWeight, opponentWeight }], persona: { A0, Ro, c, maxTurns, minRel, bluffDetection, startingRel(rep) } }`), `computeDV(levelConfig, pkg)`, `computeOV(levelConfig, pkg)` where `pkg` is an array of option-indices, one per term in `levelConfig.terms` order.

- [ ] **Step 1: `git init` the project**

Run: `git -C /home/katej/projects/pokerface init` (no `.git` exists yet). Add a minimal `.gitignore` for `test/.tmp/`.

- [ ] **Step 2: Write the failing test**

```js
// test/core.test.js
const { loadGame } = require('./helpers/load-game');
test('computeDV/computeOV match the p/q formula for level 1', () => {
  const { CONFIG, computeDV, computeOV } = loadGame();
  const level1 = CONFIG.levels[0]; // Salary talk
  // Salary: 13 options (i=0 best for player), Equity: 11 options (i=0 best for player)
  const pkg = [0, 0]; // best for player on both terms
  assert.strictEqual(computeDV(level1, pkg), 100);
  assert.strictEqual(computeOV(level1, pkg), 0);
  const pkg2 = [12, 10]; // worst for player on both terms (= best for opponent)
  assert.strictEqual(computeDV(level1, pkg2), 0);
  assert.strictEqual(computeOV(level1, pkg2), 100);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/core.test.js`
Expected: FAIL (`index.html` / exports don't exist yet).

- [ ] **Step 4: Implement `CONFIG` and the two functions in `index.html`**

Transcribe the three levels' terms/weights/persona values verbatim from `pokerface.md` §"Levels":
- Level 1 "Salary talk ♣" vs Maya: Salary 60k–90k step 2.5k (13 options), weight 0.70/0.40; Equity 0.5%–3.0% step 0.25% (11 options), weight 0.30/0.60. Persona: `A0=80, Ro=45, c=5, maxTurns=8, minRel=40, bluffDetection=0.20, startingRel=() => 55`.
- Level 2 "Co-founder split ♦" vs Jonas: Equity share [70,65,60,55,50,45,40], weight 0.50/0.30; Final say 4 options (`"You decide"`, `"You decide, Jonas can veto tech"`, `"Joint, an advisor breaks ties"`, `"Equal votes, no tie-break"`), weight 0.35/0.25; Role 3 options (`"VP Engineering"`, `"CTO"`, `"CTO with a board seat"`), weight 0.15/0.45. Persona: `A0=85, Ro=50, c=4, maxTurns=8, minRel=60, bluffDetection=0.50, startingRel=(rep) => 50 + 0.4*(rep-50)`.
- Level 3 "Merger ♠" vs Victoria: Valuation [12,11,10,9,8] (€M), weight 0.30/0.35; Payment 5 options (`"100% cash"`,`"75% cash"`,`"50-50"`,`"75% stock"`,`"100% stock"`), weight 0.10/0.25; Role 5 options (`"CEO"`,`"Co-CEO"`,`"COO"`,`"Advisor for one year"`,`"Exit"`), weight 0.15/0.25; Job guarantee [24,18,12,6,0] months, weight 0.30/0.05; Brand 3 options (`"Your brand stays"`,`"Co-branded"`,`"Their brand only"`), weight 0.15/0.10. Persona: `A0=90, Ro=55, c=4, maxTurns=10, minRel=45, bluffDetection=0.70, startingRel=(rep) => 45 + 0.4*(rep-50)`.

`computeDV(levelConfig, pkg)`: for each term `t` at index `idx`, `p = 1 - pkg[idx]/(options.length-1)`, sum `playerWeight*p` across terms, `* 100`. `computeOV` mirrors with `q = pkg[idx]/(options.length-1)` and `opponentWeight`.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/core.test.js` → PASS

- [ ] **Step 6: Commit**

```bash
git add index.html test/
git commit -m "Add CONFIG and core DV/OV value functions"
```

---

### Task 2: Package enumeration and the negotiation line (`maxLine`)

**Files:**
- Modify: `index.html` (append functions to the same script block)
- Create: `test/enumeration.test.js`

**Interfaces:**
- Consumes: `CONFIG`, `computeDV`, `computeOV` (Task 1)
- Produces: `enumeratePackages(levelConfig)` → array of all possible `pkg` arrays (cartesian product of each term's option indices), `computeMaxLine(levelConfig)` → integer, `packageDistance(pkgA, pkgB)` → sum of `Math.abs(a[i]-b[i])` across terms.

- [ ] **Step 1: Write the failing tests**

```js
test('enumeratePackages produces the full cartesian product', () => {
  const { CONFIG, enumeratePackages } = loadGame();
  const level2 = CONFIG.levels[1]; // 7 * 4 * 3 options
  assert.strictEqual(enumeratePackages(level2).length, 7 * 4 * 3);
});

test('computeMaxLine follows the spec formula and is capped at 70', () => {
  const { CONFIG, computeMaxLine } = loadGame();
  for (const level of CONFIG.levels) {
    const maxLine = computeMaxLine(level);
    assert.ok(maxLine <= 70);
    assert.ok(maxLine >= 40); // required by runSelfTest later, true for these three levels
  }
});

test('packageDistance sums per-term index differences', () => {
  const { packageDistance } = loadGame();
  assert.strictEqual(packageDistance([0, 0], [2, 1]), 3);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/enumeration.test.js` → FAIL

- [ ] **Step 3: Implement the three functions**

`computeMaxLine(levelConfig)`: among `enumeratePackages(levelConfig).filter(pkg => computeOV(levelConfig, pkg) >= levelConfig.persona.Ro - 5)`, take the max `computeDV`, subtract 5, `Math.min(result, 70)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/enumeration.test.js` → PASS

- [ ] **Step 5: Commit**

```bash
git add index.html test/enumeration.test.js
git commit -m "Add package enumeration and maxLine calculation"
```

---

### Task 3: Opponent acceptance threshold, bluff chance, and counter-offer selection

**Files:**
- Modify: `index.html`
- Create: `test/opponent-engine.test.js`

**Interfaces:**
- Consumes: `enumeratePackages`, `computeOV`, `computeDV`, `packageDistance` (Task 2)
- Produces:
  - `computeAcceptanceThreshold(persona, timeSteps, pressure, rel)` → `{ A, Aeff }` per `A = max(Ro, A0 - c*timeSteps - pressure)`, `Aeff = max(Ro - 5, A - 0.15*(rel-50))`.
  - `resolveBluffChance(persona, rep, pressureCountThisLevel)` → number in `[0, 0.95]`: `persona.bluffDetection + (rep < 40 ? 0.15 : 0) + 0.20 * pressureCountThisLevel`, clamped to `0.95` max (Review Focus item 2).
  - `pickOpponentCounter(levelConfig, playerOfferPkg, aeff, previousCounterOV)` → `{ pkg, ov }`: `target = aeff + 3`; if `previousCounterOV != null`, `target = Math.min(target, previousCounterOV)`; among `enumeratePackages` with `computeOV >= target`, pick smallest `packageDistance` to `playerOfferPkg`, tie-break highest `computeDV`. If no previous counter exists, no cap is applied (Review Focus item 1).

- [ ] **Step 1: Write the failing tests**

```js
test('computeAcceptanceThreshold matches the spec formula for Maya', () => {
  const { CONFIG, computeAcceptanceThreshold } = loadGame();
  const maya = CONFIG.levels[0].persona; // A0=80, Ro=45, c=5
  const { A, Aeff } = computeAcceptanceThreshold(maya, 2, 4, 60);
  assert.strictEqual(A, 66); // max(45, 80-10-4)
  assert.strictEqual(Aeff, Math.max(45 - 5, 66 - 0.15 * 10)); // 64.5
});

test('resolveBluffChance clamps at 0.95', () => {
  const { CONFIG, resolveBluffChance } = loadGame();
  const victoria = CONFIG.levels[2].persona; // bluffDetection 0.70
  assert.strictEqual(resolveBluffChance(victoria, 20, 3), 0.95); // 0.70+0.15+0.60 > 0.95
});

test('pickOpponentCounter has no cap when there is no previous counteroffer', () => {
  const { CONFIG, pickOpponentCounter } = loadGame();
  const level1 = CONFIG.levels[0];
  const { ov } = pickOpponentCounter(level1, [0, 0], 70, null);
  assert.ok(ov >= 70 + 3);
});

test('pickOpponentCounter never exceeds the previous counteroffer OV', () => {
  const { CONFIG, pickOpponentCounter } = loadGame();
  const level1 = CONFIG.levels[0];
  const { ov } = pickOpponentCounter(level1, [0, 0], 70, 75);
  assert.ok(ov <= 75);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/opponent-engine.test.js` → FAIL

- [ ] **Step 3: Implement the three functions as specified above**

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/opponent-engine.test.js` → PASS

- [ ] **Step 5: Commit**

```bash
git add index.html test/opponent-engine.test.js
git commit -m "Add opponent acceptance threshold, bluff chance, and counter selection"
```

---

### Task 4: Move resolution — line/tone/expression legality and effects

**Files:**
- Modify: `index.html`
- Create: `test/move-resolution.test.js`

**Interfaces:**
- Consumes: nothing new from earlier tasks (pure rule logic on move/turn history)
- Produces:
  - `isLineLegal(line, moveCtx)` → `{ legal: boolean, reason: string|null }`, where `moveCtx = { turnNumber, offerPkg, previousOwnOfferPkg, offerDV, questionsAskedThisLevel /* Set of term names */, holdFirmStreak, concedeStreakPrev }`.
  - `applyMoveEffects(line, tone, expression, persona, moveCtx)` → `{ relDelta, pressureDelta, skipTimeConcession: boolean, isBluffAttempt: boolean }`. Tone/expression deltas come from the spec's Tone table and Expression rules; line deltas from the Line table. All deltas sum (e.g. Hard tone + Hold firm both contribute to `relDelta`).

- [ ] **Step 1: Write the failing tests**

```js
test('Anchor: DV 75-90 gives pressure +4, Rel -2', () => {
  const { CONFIG, applyMoveEffects } = loadGame();
  const maya = CONFIG.levels[0].persona;
  const ctx = { turnNumber: 1, offerPkg: [0,0], previousOwnOfferPkg: null, offerDV: 82, questionsAskedThisLevel: new Set(), holdFirmStreak: 0, concedeStreakPrev: false };
  const effects = applyMoveEffects('anchor', 'neutral', 'pokerFace', maya, ctx);
  assert.strictEqual(effects.pressureDelta, 4);
  assert.strictEqual(effects.relDelta, -2);
});

test('Anchor above 90 is insulting: Rel -10, no pressure', () => { /* offerDV 95 */ });
test('Hold firm triples: 3rd+ in a row adds an extra Rel -5 on top of the base -3 (Jonas)', () => { /* holdFirmStreak 2 -> this will be 3rd */ });
test('Trade requires one term toward opponent and one toward player vs previousOwnOfferPkg', () => {
  const { isLineLegal } = loadGame();
  const ctx = { turnNumber: 2, offerPkg: [2, 0], previousOwnOfferPkg: [0, 0], /* ... */ };
  assert.strictEqual(isLineLegal('trade', ctx).legal, true);
});
test('From turn 2, an offer moving only toward the player is illegal for any line', () => { /* assert on the shared turn-2+ validity check, see Task 5 */ });
test('Open expression skips the time concession when offerDV is W+15 or more', () => { /* assert skipTimeConcession */ });
test('4th+ consecutive poker-face turn costs Rel -2', () => { /* ... */ });
test('Ask a question: Rel +4 for Maya/Jonas, +1 for Victoria, and is illegal if that term was already asked about this level', () => { /* ... */ });
test('Pressure bluff marks isBluffAttempt true regardless of tone', () => { /* ... */ });
```

(Write one concrete assertion per row of the spec's Line table, Tone table, and the two Expression rules — these are the exact numbers to assert, not an exhaustive restatement here.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/move-resolution.test.js` → FAIL

- [ ] **Step 3: Implement `isLineLegal` and `applyMoveEffects`**

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/move-resolution.test.js` → PASS

- [ ] **Step 5: Commit**

```bash
git add index.html test/move-resolution.test.js
git commit -m "Add line/tone/expression legality checks and effect calculations"
```

---

### Task 5: Turn and hand orchestration

**Files:**
- Modify: `index.html`
- Create: `test/turn-orchestration.test.js`

**Interfaces:**
- Consumes: all of Tasks 1–4.
- Produces:
  - `createInitialHandState(levelConfig, W, rep)` → `{ levelConfig, W, rel, timeSteps, pressure, turnNumber, log: [], questionsAskedThisLevel: Set, pressureCountThisLevel: 0, bluffsCaughtThisLevel: 0, holdFirmStreak: 0, pokerFaceStreak: 0, lastLine: null, playerOfferPkg: null, opponentCounterPkg: null, opponentCounterOV: null, isFinalOffer: false, ended: false, endingType: null }`.
  - `playTurn(handState, move)` where `move = { offerPkg, line, tone, expression }` → returns a **new** hand state with: legality enforced (throws/returns `{ error }` if illegal — UI is responsible for disabling illegal choices before calling this), Rel/pressure updated and clamped to `[0,100]`, walkout check applied (sets `ended`/`endingType: 'opponentWalk'` if `rel <= 15`, per Review Focus item 3, checked *after* all of this turn's deltas), `timeSteps` incremented unless skipped, opponent's accept/counter decision applied (via `computeAcceptanceThreshold` + `pickOpponentCounter`), `isFinalOffer` set true when `turnNumber === persona.maxTurns`, and a log entry appended.
  - Turn 1 "Ask a question" special case: no `offerPkg` required; opponent's opening counter targets `OV ≈ A0` directly (skip the accept check).

- [ ] **Step 1: Write the failing tests**

```js
test('turn 1 Ask a question opens with a package closest to OV = A0', () => { /* ... */ });
test('opponent walks out the instant cumulative Rel this turn drops to 15 or below', () => {
  // craft a move whose combined line+tone+expression Rel delta takes rel from 20 to 15
  // assert ended === true, endingType === 'opponentWalk', and no counter offer was computed
});
test('from turn 2 on, an offer that only moves terms toward the player is rejected before any effects are applied', () => { /* ... */ });
test('the counter on the final turn (turnNumber === maxTurns) is marked isFinalOffer', () => { /* ... */ });
test('time concession is skipped on a repeated Concede and on an Open offer with DV >= W+15', () => { /* assert timeSteps unchanged */ });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/turn-orchestration.test.js` → FAIL

- [ ] **Step 3: Implement `createInitialHandState` and `playTurn`**, following the exact 9-step order from the spec's "How the opponent decides" section (Rel changes → pressure changes → walkout check → timeStep increment → threshold → accept/counter → final-offer flag).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/turn-orchestration.test.js` → PASS

- [ ] **Step 5: Commit**

```bash
git add index.html test/turn-orchestration.test.js
git commit -m "Add turn and hand orchestration"
```

---

### Task 6: Hand ending, scoring, and reputation

**Files:**
- Modify: `index.html`
- Create: `test/scoring.test.js`

**Interfaces:**
- Consumes: hand state shape from Task 5.
- Produces:
  - `determineEnding(handState, playerAction)` where `playerAction` is `'accept' | 'walk' | 'foldConfirmed'` → one of `'deal' | 'wonLostRelationship' | 'foldCleared' | 'foldFailed' | 'walk' | 'opponentWalk'`, applying the fold's `rel += 10` bonus before the `minRel + 10` check.
  - `computeLevelScore(ending, DV, Rel, W)` → `5*DV + 3*Rel + (ending === 'foldCleared' ? 0 : 2*W)` for a cleared ending, `0` for any failed ending.
  - `updateReputation(rep, { ending, finalRel, bluffsCaughtThisLevel, walkedAway })` → applies every matching row from the spec's Reputation table (cleared ≥70 Rel: +10; cleared <70: +5; cleared-by-folding: +3 instead of those two; final Rel <40 any ending: -10; each bluff caught: -10; walked away Rel≥50: +5; walked away Rel<50: -5), clamped to `[0,100]`.
  - `computeFinalScore(levelScores /* array of up to 3 numbers, 0 for unplayed/failed */, rep)` → `sum(levelScores) + 5*rep`.

- [ ] **Step 1: Write the failing tests**

```js
test('Deal requires DV >= W and final Rel >= minRel', () => { /* ... */ });
test('Won the deal, lost the relationship: DV >= W but Rel < minRel => failed', () => { /* ... */ });
test('Fold applies +10 Rel then requires Rel >= minRel + 10 to clear, and drops the 2*W score term', () => { /* ... */ });
test('updateReputation stacks a caught bluff with a clear, e.g. cleared Rel 75 with 1 bluff caught: +10 then -10 = net 0', () => { /* ... */ });
test('computeFinalScore sums level scores plus 5 * rep', () => { /* ... */ });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/scoring.test.js` → FAIL

- [ ] **Step 3: Implement the four functions**

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/scoring.test.js` → PASS

- [ ] **Step 5: Commit**

```bash
git add index.html test/scoring.test.js
git commit -m "Add ending determination, scoring, and reputation updates"
```

---

### Task 7: `runSelfTest()`

**Files:**
- Modify: `index.html`
- Create: `test/self-test.test.js`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: `runSelfTest()` → `{ passed: boolean, levels: [{ key, checks: [{ name, pass, detail }] }] }`. Called automatically only in a browser context (guard with `if (typeof window !== 'undefined') runSelfTest();` at the bottom of the script, logging each check to `console.log`/`console.error`) — the Node tests call it directly, bypassing the guard.

- [ ] **Step 1: Write the failing test**

```js
test('runSelfTest passes all four checks for all three levels', () => {
  const { runSelfTest } = loadGame();
  const result = runSelfTest();
  for (const level of result.levels) {
    for (const check of level.checks) {
      assert.ok(check.pass, `${level.key}: ${check.name} — ${check.detail}`);
    }
  }
  assert.strictEqual(result.passed, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/self-test.test.js` → FAIL

- [ ] **Step 3: Implement `runSelfTest()` with the four checks from the spec:**
1. Each level's player and opponent weights each sum to 1.
2. At least one package has `OV >= Ro` and `DV >= 50`.
3. `computeMaxLine(level) >= 40`.
4. A simulated player who, every turn, offers the package with `OV` closest to `Ro` (ties broken by highest DV) using Neutral tone and Poker face expression, and "Trade" when legal else "Hold firm", reaches `'deal'` or `'foldCleared'` before `persona.maxTurns`.

If check 4 fails for a level, adjust that level's `CONFIG` numbers (not the engine) until it passes, and record exactly what changed for the final report to the user.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/self-test.test.js` → PASS (iterate CONFIG per Step 3's note if not)

- [ ] **Step 5: Commit**

```bash
git add index.html test/self-test.test.js
git commit -m "Add runSelfTest with the four spec-required checks"
```

---

### Task 8: Content — `getOpponentLine` and `getCoachTip`

**Files:**
- Modify: `index.html`
- Create: `test/content.test.js`

**Interfaces:**
- Consumes: hand state / move shapes from Tasks 4–6.
- Produces:
  - `getOpponentLine(context)` → string, where `context = { personaKey, relChangeBucket: '+4'|'+1to3'|'0'|'-1to-4'|'<=-5'|null, special: 'opening'|'accepting'|'countering'|'finalOffer'|'bluffCaught'|'walkedOut'|null, repBand: 'respectful'|'neutral'|'distrustful'|null }`. Dialogue lines live in `CONFIG.levels[i].persona.lines`, keyed by bucket/special, each an array of ≥3 strings (≥1 for the one-off special cases: opening, accepting, countering, finalOffer, bluffCaught, walkedOut, and Victoria's 3 reputation openers).
  - `getCoachTip(context)` → string|null, applying the spec's 8 rules **in order**, returning the first match's tip text (or `null` if rule 8's "otherwise" has nothing to add — still return a neutral observation per spec, so this realistically never returns `null`).

- [ ] **Step 1: Write the failing tests**

```js
test('every persona has >= 3 lines in every Rel-change bucket', () => {
  const { CONFIG } = loadGame();
  for (const level of CONFIG.levels) {
    for (const bucket of ['+4', '+1to3', '0', '-1to-4', '<=-5']) {
      assert.ok(level.persona.lines[bucket].length >= 3, `${level.key} ${bucket}`);
    }
  }
});

test('getCoachTip rule precedence: a caught bluff always wins even if other conditions also match', () => {
  const { getCoachTip } = loadGame();
  const ctx = { bluffCaught: true, secondConcedeInRow: true, /* ... */ };
  assert.match(getCoachTip(ctx), /trust|reputation/i);
});
test('getCoachTip falls through to rule 6 (no question asked by turn 3+) when nothing earlier matches', () => { /* ... */ });
test("Victoria's opening line depends on reputation band", () => {
  const { getOpponentLine } = loadGame();
  assert.notStrictEqual(
    getOpponentLine({ personaKey: 'victoria', special: 'opening', repBand: 'respectful' }),
    getOpponentLine({ personaKey: 'victoria', special: 'opening', repBand: 'distrustful' })
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/content.test.js` → FAIL

- [ ] **Step 3: Write the persona dialogue banks and implement `getOpponentLine`/`getCoachTip`** following the 8 coach-tip rules in the exact order given in the spec's Feedback section.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/content.test.js` → PASS

- [ ] **Step 5: Commit**

```bash
git add index.html test/content.test.js
git commit -m "Add opponent dialogue and coach tip content"
```

---

### Task 9: UI — screens, theme, and interaction

**Files:**
- Modify: `index.html` (CSS + DOM rendering/event-handling code, on top of the already-tested logic)

**Interfaces:**
- Consumes: every function from Tasks 1–8, plus the hand-state shape from Task 5.
- Produces: no new testable functions — this task is the DOM glue (screen components for Briefing, Set-the-line, Table, Debrief, title/final-score) and has no automated tests. Verification is manual.

- [ ] **Step 1: Build the Briefing screen** — persona, stakes, player's weights as percentages; "Begin" advances to Set-the-line.
- [ ] **Step 2: Build the Set-the-line screen** — slider from 30 to `computeMaxLine(level)`, default `Math.min(50, computeMaxLine(level))` (Review Focus item 4), explanatory copy, locks `W` on starting the hand.
- [ ] **Step 3: Build the Table screen** — one slider/stepper per term with live DV, opponent's latest counteroffer shown per term, the six line cards (greyed out with `isLineLegal`'s reason when illegal), the 4 tone buttons, the 2 expression buttons, "Play move"/"Accept their offer" (enabled only when a counteroffer exists)/"Walk away", the chat log (player line, opponent reply via `getOpponentLine`, coach tip via `getCoachTip` in a distinct style), the three animated meters (DV with `W` marked, Rel, Rep). When `isFinalOffer` is true, hide/disable the offer builder and "Play move" entirely (Review Focus item 5), leaving only Accept/Walk.
- [ ] **Step 4: Build the Debrief screen** — ending sentence, final package vs `W`/`minRel`, Rep change with reasons, turn-by-turn timeline, "points left on the table" (best accepted-at-the-end DV minus achieved DV), 2–3 generated tips, Retry/Next-level buttons.
- [ ] **Step 5: Build the title and final-score screens**, level unlock gating (level 2 after level 1 cleared, etc.), and the `localStorage` high-score read/write wrapped in try/catch.
- [ ] **Step 6: Apply the poker-table theme** (dark green felt, card-shaped panels, suit accents, chip-stack meters) and the responsive single-column layout under 700px.
- [ ] **Step 7: Manual verification in a real browser** (see the `run` skill if unsure how to open it): play each level to a Deal, a Fold, and a Walk-away at least once; confirm the console shows `runSelfTest` passing on load; confirm keyboard-only play works end to end; resize to a phone width and confirm single-column layout; confirm the final-offer turn truly blocks further offers.
- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "Add UI: screens, theme, and interaction wiring"
```

---

### Task 10: Final checks and delivery

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `node --test test/` → all PASS

- [ ] **Step 2: Confirm the single-file constraint**

Run: `grep -nE '(src=|href=)"https?://|<link |<script src=' index.html` → no matches (everything inline, no external refs).

- [ ] **Step 3: Confirm it works opened directly from disk** (not just via a local server) — open `index.html` via `file://` and repeat the Task 9 Step 7 playthrough.

- [ ] **Step 4: Write the final report to the user**: the complete `index.html` location, the short list of interpreted/changed rules (the Review Focus items plus anything else decided during implementation, e.g. the Task 7 self-test tuning), and the 2–3 `CONFIG` numbers most worth tuning after a first playtest.

- [ ] **Step 5: Commit** (if anything changed since Task 9's commit)

```bash
git add -A
git commit -m "Final verification pass"
```
