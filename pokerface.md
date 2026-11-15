# Build prompt: Poker Face prototype

Build a playable browser prototype of **Poker Face**, a single-player negotiation game for entrepreneurs. The player negotiates three deals against scripted opponents and has to balance getting good terms against keeping the relationship intact. The central question of every hand: *hold the line, or fold to save the deal?*

This is a course prototype used to test whether the game loop is fun and teaches negotiation. Correct, readable game logic matters more than visual polish.

## Technical constraints

- Deliver **one file, `index.html`**, with all HTML, CSS and JavaScript inline. No build step, no frameworks, no external libraries, fonts, images or network requests. It will be hosted on GitHub Pages and must also work when opened directly from disk.
- The opponents are **rule-based, not a live AI model**. A static page cannot hold an API key safely. Keep all opponent dialogue behind one function, `getOpponentLine(context)`, and all coach text behind `getCoachTip(context)`, so a real model can replace them later.
- Put every number in this document in a single `CONFIG` object at the top of the script so the values are easy to tune.
- Keep game state in one plain object. Use `localStorage` only for the high score, wrapped in try/catch.
- Must be usable on a phone (single column under 700px) and by keyboard.
- Use emoji and CSS for all visuals. Theme: a poker table. Dark green felt, card-shaped panels, the four suits ♠ ♥ ♦ ♣ as accents, chip stacks for the three scores.

## Game structure

Three levels, played in order. Level 2 unlocks when level 1 is cleared, level 3 when level 2 is cleared. A failed level can be retried immediately.

Each level runs through these screens:

1. **Briefing.** Who you are, who the opponent is, what is on the table, and how much each term matters to you (your weights, shown as percentages).
2. **Set your line.** The player picks their walk-away point `W` with a slider.
3. **The table.** Turn-based negotiation.
4. **Debrief.** Outcome, scores and feedback.

After level 3 (or at any point from the menu) show a final score screen with the high score.

## The three stacks

All three are numbers from 0 to 100 and are always visible at the table as chip stacks or meters.

- **Deal value (DV):** how good the offer currently on the table is for the player. Mark the player's line `W` on this meter.
- **Relationship (Rel):** how this opponent feels about the player. Changes every turn.
- **Reputation (Rep):** carries across levels. Starts at 50. Only changes at the end of a level.

## Terms and value

Each level has a list of terms. Each term has a list of options ordered from **best for the player (index 0)** to **worst for the player (last index)**. The opponent's preferences are the exact reverse on every term.

For a term with `n` options and chosen index `i`:

- player position `p = 1 − i / (n − 1)`
- opponent position `q = i / (n − 1)`

Each side has its own weights per term (each side's weights sum to 1). The player sees their own weights. The opponent's weights are hidden.

- `DV = 100 × Σ (playerWeight × p)`
- `OV = 100 × Σ (opponentWeight × q)` (the opponent's value, hidden)

Because the two sides weight the terms differently, the player can gain by giving away what they care about less and asking for what they care about more. This is the main thing the game teaches.

## Levels

### Level 1: Salary talk ♣

You are a founder hiring your first key engineer, **Maya** (friendly, enthusiastic about the company).

| Term | Options, player-best to player-worst | Player weight | Maya weight |
|---|---|---|---|
| Salary | €60k to €90k in €2.5k steps (13 options) | 0.70 | 0.40 |
| Equity | 0.5% to 3.0% in 0.25% steps (11 options) | 0.30 | 0.60 |

Maya: opening aspiration `A0 = 80`, reservation `Ro = 45`, concession per turn `c = 5`, max turns 8, minimum relationship to clear `minRel = 40`, bluff detection 0.20. Starting Rel = 55.

### Level 2: Co-founder split ♦

You are the CEO splitting the company with your technical co-founder, **Jonas** (proud, sensitive, wants recognition). You will work with him for years.

| Term | Options, player-best to player-worst | Player weight | Jonas weight |
|---|---|---|---|
| Your equity share | 70%, 65%, 60%, 55%, 50%, 45%, 40% | 0.50 | 0.30 |
| Final say | You decide / You decide, Jonas can veto tech / Joint, an advisor breaks ties / Equal votes, no tie-break | 0.35 | 0.25 |
| Jonas's role | VP Engineering / CTO / CTO with a board seat | 0.15 | 0.45 |

Jonas: `A0 = 85`, `Ro = 50`, `c = 4`, max turns 8, `minRel = 60`, bluff detection 0.50. Starting Rel = `50 + 0.4 × (Rep − 50)`.

### Level 3: Merger ♠

A larger rival wants to merge with your startup. You negotiate with its CEO, **Victoria** (tough, well prepared, respects firmness). She opens by commenting on your reputation.

| Term | Options, player-best to player-worst | Player weight | Victoria weight |
|---|---|---|---|
| Valuation of your company | €12M, €11M, €10M, €9M, €8M | 0.30 | 0.35 |
| Payment | 100% cash / 75% cash / 50-50 / 75% stock / 100% stock | 0.10 | 0.25 |
| Your role after the merger | CEO / Co-CEO / COO / Advisor for one year / Exit | 0.15 | 0.25 |
| Job guarantee for your team | 24, 18, 12, 6, 0 months | 0.30 | 0.05 |
| Brand | Your brand stays / Co-branded / Their brand only | 0.15 | 0.10 |

Victoria: `A0 = 90`, `Ro = 55`, `c = 4`, max turns 10, `minRel = 45`, bluff detection 0.70. Starting Rel = `45 + 0.4 × (Rep − 50)`.

Her opening line depends on Rep: 65 or more is respectful, 35 to 64 is neutral, below 35 is distrustful.

## Setting the line

Before the first turn the player sets `W`, the lowest DV they will accept, with a slider from 30 up to `maxLine`, default 50.

Compute `maxLine` at level load by enumerating every possible package: find the highest DV among packages with `OV ≥ Ro − 5`, subtract 5, and cap at 70. Explain to the player that a higher line earns a bigger bonus but is harder to hit.

`W` cannot be changed once the hand starts.

## One turn

Each turn the player builds a move from four parts, then presses **Play move**.

**1. Offer.** One slider or stepper per term. Show the live DV of the offer as the player adjusts it. Next to each term show the opponent's latest counteroffer, if there is one.

**2. Line.** One of six tactic cards. Each card shows a sentence the player says, written for that level. Cards that are not legal for the current offer are greyed out with the reason.

| Line | When it is legal | Effect |
|---|---|---|
| **Anchor** | Turn 1 only | If offer DV is 75 to 90: pressure +4, Rel −2. If DV is above 90: Rel −10, no pressure (insulting). If DV is below 75: no effect, coach says the anchor was weak. |
| **Ask a question** | Any turn; at most once per term in the level | Offer is locked to the previous offer. Rel +4 (Victoria: +1). Reveals the opponent's most important term not yet revealed, shown in an Intel panel. |
| **Trade** | Turn 2 onward; compared with your previous offer, at least one term moves toward the opponent and at least one moves toward you | Rel +3. The opponent adds 5 to OV when deciding whether to accept this turn. |
| **Hold firm** | Turn 2 onward; offer identical to your previous offer | Pressure +2. Rel: Maya −1, Jonas −3, Victoria 0. On the third Hold firm in a row and every one after, an extra Rel −5. |
| **Concede** | Turn 2 onward; at least one term moves toward the opponent and none toward you | Rel +2. If the previous turn was also Concede, the opponent's time concession is skipped this turn. |
| **Pressure** ("I have another option") | Turn 2 onward; any legal offer | A bluff. Chance of being caught = the persona's bluff detection, +0.15 if Rep is below 40, +0.20 for each earlier Pressure in this level. Not caught: pressure +8. Caught: Rel −15, pressure −5, and the bluff is recorded. |

From turn 2 onward, an offer that only moves terms toward the player is not allowed (you cannot take back what you already offered).

**3. Tone.**

| Tone | Rel: Maya | Rel: Jonas | Rel: Victoria | Pressure |
|---|---|---|---|---|
| Warm | +3 | +2 | −1 | 0 |
| Neutral | +1 | 0 | 0 | 0 |
| Firm | −1 | −3 | +2 | +1 |
| Hard | −6 | −8 | −4 | +3 |

**4. Expression.**

- **Open:** Rel +1. But if your offer's DV is 15 or more above your line `W`, the opponent can see you have room, and their time concession is skipped this turn.
- **Poker face:** no effect. From the fourth poker-face turn in a row, Rel −2 each turn (hard to trust).

Two more buttons are always present: **Accept their offer** (enabled when the opponent has a counteroffer on the table) and **Walk away**.

## How the opponent decides

Per level the opponent tracks `timeSteps` (starts at 0) and `pressure` (starts at 0).

Resolve each turn in this order:

1. Apply the Rel changes from line, tone and expression. Clamp Rel to 0–100.
2. Apply pressure changes from line and tone.
3. If Rel is 15 or below, the opponent walks out. The level is failed.
4. Add 1 to `timeSteps`, unless a rule above says the time concession is skipped this turn.
5. Compute the acceptance threshold:
   - `A = max(Ro, A0 − c × timeSteps − pressure)`
   - `Aeff = max(Ro − 5, A − 0.15 × (Rel − 50))`

   A good relationship makes the opponent more flexible. A bad one makes them tougher.
6. If `OV(player's offer) + tradeBonus ≥ Aeff`, the opponent accepts. The deal is the player's offer.
7. Otherwise the opponent counters. Enumerate all packages. Let `target = Aeff + 3`, but never higher than the OV of their previous counteroffer (they do not take things back). Among packages with `OV ≥ target`, pick the one with the smallest total number of option steps away from the player's offer. Break ties by highest DV.
8. Show the reaction (see Feedback).
9. On the final turn, the counteroffer is marked as a final offer. The player can then only accept it or walk away.

If the player picks Ask a question on turn 1, there is no player offer yet. Skip step 6, and the opponent opens with the package closest to `OV = A0`.

## How a hand ends

| Ending | Condition | Result |
|---|---|---|
| **Deal** | Agreed package has `DV ≥ W`, and final `Rel ≥ minRel` | Level cleared |
| **Won the deal, lost the relationship** | `DV ≥ W` but `Rel < minRel` | Level failed |
| **Fold** | The player accepts a package with `DV < W`. Ask for confirmation first: "This is below your line. Fold to save the deal?" On confirming, Rel +10. | Cleared if `Rel ≥ minRel + 10` after the bonus, otherwise failed. No line bonus. |
| **Walk away** | The player leaves | Level failed |
| **Opponent walks** | Rel reaches 15 or below | Level failed |

## Reputation

Updated once when a level ends. Apply every row that matches, then clamp to 0–100.

| Event | Rep change |
|---|---|
| Cleared with final Rel of 70 or more | +10 |
| Cleared with final Rel below 70 | +5 |
| Cleared by folding | +3 instead of the two rows above |
| Final Rel below 40, any ending | −10 |
| Each bluff that was caught | −10 |
| Walked away with Rel of 50 or more | +5 |
| Walked away with Rel below 50 | −5 |

A retry of a failed level starts from the Rep the player had before that attempt.

## Score

- Cleared level: `5 × DV + 3 × Rel + 2 × W`. If the level was cleared by folding, leave out the `2 × W` term.
- Failed level: 0.
- Final score: sum of the three level scores, plus `5 × Rep`.

Store the best final score in `localStorage` and show it on the title and final screens.

## Feedback

**Immediate, after every move:**

- The opponent's face, body language and words. Choose the bucket from the total Rel change this turn:

  | Rel change | Face | Body language caption |
  |---|---|---|
  | +4 or more | 😄 | leans in, nodding |
  | +1 to +3 | 🙂 | relaxed, open posture |
  | 0 | 😐 | still, hard to read |
  | −1 to −4 | 😒 | arms crossed |
  | −5 or less | 😠 | leans back, looks away |

  Write at least three spoken lines per persona per bucket, in that persona's voice, plus special lines for: opening, accepting, countering, final offer, catching a bluff, walking out, and Victoria's three reputation-based openers.
- The Rel meter animates and shows the change (for example "−3").
- One coach tip. Use the first rule that matches:
  1. Bluff caught: explain the cost to trust and reputation.
  2. Second Concede in a row: "You gave something up and got nothing back. Try a Trade."
  3. Open expression blocked the opponent's concession: "They could see you had room. Consider a poker face."
  4. Anchor too high or too weak.
  5. Hard tone with Maya or Jonas, or Warm tone with Victoria: this person responds badly to that tone.
  6. Turn 3 or later and no question asked yet: "You still don't know what they care about."
  7. A successful Trade: name the term the player gave and the term they got.
  8. Otherwise, a short neutral observation.

Show the conversation as a chat log: the player's line, the opponent's reply, and the coach tip in a different style.

**Cumulative, on the debrief screen:**

- The ending and whether the level was cleared, in one sentence.
- The final package, DV against `W`, Rel against `minRel`, the Rep change with reasons, and the level score.
- A turn-by-turn timeline: line, tone, expression, Rel change.
- "Points left on the table": the best DV among packages the opponent would have accepted at the end, minus the DV the player got.
- Two or three tips for next time, built from the hand's statistics: number of unreturned concessions, questions asked, trades made, bluffs caught, turns spent holding firm.
- Buttons: **Retry** and, if cleared, **Next level**.

## Checks to build in

Add a `runSelfTest()` function that runs on load and logs to the console. For each level it should confirm:

- weights sum to 1 for both sides;
- at least one package has `OV ≥ Ro` and `DV ≥ 50`;
- `maxLine` is at least 40;
- a simulated player who offers the package closest to `OV = Ro` every turn with Neutral tone gets a deal before the turn limit.

If any check fails, say which one, and adjust the level's numbers in `CONFIG` until all pass. Tell me what you changed.

## When you are done

Give me the complete `index.html`, a short list of any rules you had to interpret or change, and the two or three numbers in `CONFIG` most worth tuning after a first playtest.
