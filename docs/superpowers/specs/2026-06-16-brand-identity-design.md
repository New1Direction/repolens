# RepoLens Brand Identity — Design Spec

**Date:** 2026-06-16
**Status:** Proposed
**Phase scope:** Brand identity + extension default theme. Packaging (store listing, privacy policy, LICENSE) and the website re-skin are separate, later workstreams.

**Goal:** Give RepoLens one coherent, cool, anti-AI-slop identity — a Vee-eye mark, a "Mono Ink" palette, an animated scanning icon, and a human voice — and make the extension itself ship that look by default.

---

## 1. Name & positioning

- **Name:** RepoLens (kept).
- **Tagline:** *"Click any repo. Get a straight answer on whether to use it."* — replaces *"One-click repo explainer. Powered by Claude."*
- **Positioning:** plain and friendly, not detective theatrics. The product reads a repo's real source and opens with a verdict-first answer. "Verdict / red flags / evidence" stay as plain, useful labels — no costume.

## 2. Palette — "Mono Ink"

Cool, high-contrast: near-black + white/grey + electric blue. Shipped as CSS custom properties so the extension and (later) the website share one source of truth.

| Token | Hex | Use |
|-------|-----|-----|
| `--rl-ink` | `#0f1115` | Near-black. Icon tile, dark surfaces, strongest text. |
| `--rl-surface` | `#ffffff` | Light base / app background. |
| `--rl-surface-2` | `#f4f6f9` | Raised panels, cards. |
| `--rl-border` | `#d7dde6` | Hairlines, dividers. |
| `--rl-grey` | `#6b7280` | Secondary text, neutral rings. |
| `--rl-muted` | `#9aa3af` | Tertiary text, disabled. |
| `--rl-accent` | `#2563eb` | Cobalt. In-app UI accent: links, buttons, focus. |
| `--rl-accent-strong` | `#1d4ed8` | Electric blue. The brand mark only. |
| `--rl-on-dark` | `#e5edff` | Light blue-white for marks/pupil on `--rl-ink`. |

Accessibility: cobalt `#2563eb` on white passes WCAG AA for text; electric `#1d4ed8` is reserved for the mark (not body text).

## 3. Icon & mark

- **The mark** is a single stylized camera lens — one of Vee's eyes — drawn as concentric rings: a barrel ring, an aperture, a pupil. (This is the existing `mascot.js` glyph, recolored.)
- **App icon:** the lens on a **dark (`--rl-ink`) rounded-square tile** — light barrel ring (`#cbd5e1`), electric-blue aperture (`#3b82f6`), light pupil (`--rl-on-dark`). The dark tile guarantees the icon pops on a light browser toolbar.
- **Single-lens at every size** (16 / 32 / 48 / 128). We considered a size-adaptive three-lens version for large sizes; decided against it — one lens is unmistakable and consistent. (Vee's full three-lens form is the hero art, see §5.)
- **Source of truth:** one SVG; PNGs exported at 16/32/48/128 for `manifest.icons` and `action.default_icon`.
- **Lockup:** the icon + the wordmark "RepoLens" in **Space Grotesk** (matching the site's display type), near-black, set to the right of the mark.

## 4. Icon animation (scan state)

The toolbar icon is **static when idle** and animates **only while a scan is running**:

1. The aperture **grows once** on scan-start (scale ~0.5 → 1.1, slight overshoot).
2. It then **spins slow → fast** on a loop (ease-in per rotation), dashed so the motion reads.
3. The **outer ring breathes** — grows slightly and shifts **grey → blue** — in a gentle loop.
4. No sweep line. Pupil stays still.

**Implementation:** an `OffscreenCanvas` in the MV3 service worker renders frames; `chrome.action.setIcon({ imageData })` pushes them during an active scan, then resets to the static icon when the scan finishes or errors. The installed/store icon stays static (Chrome requires a static PNG there).

**Constraints / respect:** animate only during active work, never idle. Gate behind a setting `animateIcon` (default on). Honor reduced motion: the options/library page reads `matchMedia('(prefers-reduced-motion: reduce)')` and persists a flag the worker checks; when set, skip the animation and keep the static icon.

## 5. Vee the character

Vee has two representations, one source character:

- **Hero Vee** — the full three-lens caped character (existing art). Big moments: onboarding, website, store screenshots, empty states.
- **Mark Vee** — the single-lens glyph. Tiny spots: the toolbar icon, favicon, the in-app loading spinner.

Vee already lives in the cool palette (navy cape, silver rings, blue irises), so the Mono Ink pivot needs **no character redraw**. The in-app glyph (`mascot.js`) and its states (idle / scanning / strong / risky / thinking / empty / error) get recolored to the Mono Ink tokens; the scanning state reuses the §4 animation.

## 6. Default theme

- **Mono Ink becomes the extension's default theme** on fresh install and on "reset to default." The existing 13 themes remain selectable.
- Implemented as a new theme in `themes.css` built from the §2 tokens. The token names are chosen to be reusable by the website later.

## 7. Voice & writing

- Adopt **stop-slop** (Hardik Pandya's de-slop ruleset) as the writing standard for all product copy and docs. Vendor a copy of its rules into the repo (`docs/style/stop-slop/`) so the standard travels with the project.
- **Voice:** warm, casual, human — like texting a friend — with the AI tells stripped: no throat-clearing openers, no business jargon, no adverbs-as-filler, no em dashes, no pull-quotes; active voice with a human subject; name the specific thing; vary sentence rhythm.
- **No emoji** on product surfaces (the eye is the mark).
- **Plain-friendly** over detective theatrics.
- **Applies to:** Vee's onboarding copy (re-voice from "dry engineer" toward "friendly engineer"), `README.md`, `CHANGELOG.md`. (Store-listing and website copy come with their own workstreams but follow the same standard.)

## 8. Scope & non-goals

**In scope (this phase):** everything in §1–§7 as it touches the **extension** — icon asset set + source SVG, the scanning animation, the Mono Ink default theme, the Vee glyph recolor, the wordmark/lockup, the tagline change, and a de-slop pass over Vee's copy + README + CHANGELOG.

**Out of scope (separate workstreams):**
- **Website re-skin** from warm "Case File" to Mono Ink. The site keeps its current warm look + Vee for now.
- **Packaging:** Chrome Web Store listing (screenshots, promo tiles, description), privacy policy, permission justifications, LICENSE, build/zip pipeline.

## 9. Deliverables

1. `icon.svg` (source) + exported `icon16/32/48/128.png` (dark-tile single lens), wired into `manifest.json`.
2. Service-worker scanning-icon animation (`OffscreenCanvas` + `setIcon`), with the `animateIcon` setting and reduced-motion flag.
3. Mono Ink theme in `themes.css` set as the default; the 13 existing themes preserved.
4. `mascot.js` glyph + states recolored to Mono Ink tokens.
5. Wordmark/lockup asset (SVG) for the website/store/readme header.
6. Tagline updated in `manifest.json` description + README.
7. Vendored `docs/style/stop-slop/` rules + a de-slop pass on Vee onboarding copy, `README.md`, and `CHANGELOG.md`.

## 10. Verification

- **Icon:** legibility check at 16/48/128 on light + dark toolbars (screenshot harness). Confirms the dark tile reads.
- **Animation:** live check via a standalone harness (mirrors `onboarding-demo.html`); confirm it runs only during a scan, resets after, and is skipped under reduced motion / when `animateIcon` is off.
- **Theme:** Mono Ink is the default on a fresh profile; switching to and from the other 13 themes still works; cobalt-on-white body text passes AA.
- **Voice:** extend the existing anti-slop machine test to the re-voiced copy; revised docs score ≥ 35/50 on stop-slop's rubric; one human read for "does this sound like a person."
- **Regression:** full Vitest suite stays green; `eslint .` keeps 0 errors.

## Decisions already made (for the record)

- Name kept (RepoLens); palette goes cool (Mono Ink), away from warm Case File.
- Icon = single Vee-lens on a dark tile, all sizes (not size-adaptive, not three-lens).
- Scan animation: grow → ring-breathe (grey→blue) → aperture spin (slow→fast); no sweep line.
- Voice: friendly-human + stop-slop; no emoji; drop detective theatrics.
- Website + packaging are explicitly later phases.
