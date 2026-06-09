# Per-Part Model Routing — Implementation Plan

> TDD, bite-sized, frequent commits. Code/contracts live in the spec:
> `docs/superpowers/specs/2026-06-09-per-part-model-routing-design.md`.

**Goal:** Route each of 8 scan parts to a specific provider+model (or Default → smart fallback), with automatic fallback to the chain. Plus model-picker polish (Opus 4.8 + ★ recommended).

---

## Task 1: `routing.js` — pure attempt-plan builder
**Files:** Create `routing.js`; Test `tests/routing.test.js`.
Exports per spec §2.2: `CHAIN`, `DEFAULT_MODELS`, `isConnected`, `modelFor`, `buildAttemptPlan`.
- [ ] Tests: absent/`'default'` routing → chain order only (connected providers); override w/ connected provider → override first then chain, de-duped; override identical to a chain entry → no dupe; override provider not connected → ignored; nothing connected → `[]`; garbled value (no `:`) → treated as default.
- [ ] `npx vitest run tests/routing.test.js` → PASS. Commit.

## Task 2: `models.js` — catalog + parts
**Files:** Create `models.js`; Test `tests/models.test.js`.
Exports per spec §3: `PARTS`, `CATALOG`.
- [ ] Tests: each `CATALOG` provider has exactly one `recommended` model; all `PARTS` ids unique; every catalog model value is a non-empty string.
- [ ] Run → PASS. Commit.

## Task 3: `background.js` — plan executor + part ids
**Files:** Modify `background.js`.
- [ ] Import `buildAttemptPlan` from `./routing.js`.
- [ ] Replace `callAIInner` body with the plan executor (spec §2.3) + a `dispatch(provider, model, keys, prompt)` map and `PROVIDER_LABEL`. The 5 `callX` functions stay unchanged.
- [ ] `callAI(keys, prompt, part)` + throttle wrapper thread `part` through to `callAIInner`.
- [ ] Each `run*` passes its part id (`core`/`deepdive`/`lens`/`sktpg`/`versus`/`synergies`/`combinator`/`retag`) and adds `'partRouting'` to its `chrome.storage.local.get([...])`; `runAnalysis` includes `partRouting` in the object passed to `callAI`.
- [ ] `node --check background.js`; `npx vitest run` (full suite stays green — no-routing path == today). Commit.

## Task 4: `options.html` — polish + section container
**Files:** Modify `options.html`.
- [ ] Anthropic `claude-opus-4-7` → `claude-opus-4-8` (label "Claude Opus 4.8 — max quality"); OpenRouter `anthropic/claude-opus-4-7` → `anthropic/claude-opus-4-8`.
- [ ] Add ★ to the recommended option label in each per-provider dropdown (Sonnet 4.6, Gemini 2.5 Pro, Hermes 4 405B, Grok 4.3 ×2) per `CATALOG`.
- [ ] Add an empty `<div id="part-models">` inside a new "Models per scan part" section (populated by JS).
- [ ] Commit (with Task 5).

## Task 5: `options.js` — build per-part selects + persist
**Files:** Modify `options.js`.
- [ ] Import `PARTS`, `CATALOG` from `./models.js`.
- [ ] Render one labeled `<select>` per `PARTS` entry into `#part-models`: first option `Default (smart fallback)` value `default`; then an `<optgroup>` per provider, options value `'<provider>:<model>'`, label `★ …` when recommended.
- [ ] Load `partRouting` from storage → set each select. On change, write the full `partRouting` map back to `chrome.storage.local`.
- [ ] Add a one-line hint: picks fall back to the chain if that provider errors / isn't connected.
- [ ] `node --check options.js`; `npx vitest run` → green. Commit.

## Task 6: Final verification
- [ ] `node --check` all touched JS; full suite green; routing/models coverage solid.
- [ ] Quick manual trace: `buildAttemptPlan` with a sample `partRouting` returns the expected order.
- [ ] Commit any cleanup.

## Self-review
- No-routing path identical to today (regression-safe).
- Every routed part falls back to the chain; no dead ends.
- `routing.js`/`models.js` pure + unit-tested.
