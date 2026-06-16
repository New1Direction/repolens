# RepoLens Brand Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship RepoLens with one coherent "Mono Ink" identity — a dark-tile Vee-lens app icon, a scan-only animated toolbar icon, Mono Ink as the default theme, a wordmark + tagline, and a warm-human de-slopped voice across Vee's copy, README, and CHANGELOG.

**Architecture:** Four independently committable phases. (A) A framework-free canvas drawing module (`icon-draw.js`) is the single source of truth for the icon shape; a generator harness (`tools/make-icons.html`) exports the PNGs; a service-worker animation module (`icon-anim.js`) reuses the same draw function over an `OffscreenCanvas` and is hooked into `runAnalysis`, gated by an `animateIcon` setting and a persisted reduced-motion flag. (B) A new `[data-theme="monoink"]` block in `themes.css` becomes the engine default in `theme.js`. (C) A wordmark SVG plus tagline edits. (D) Vendored stop-slop rules and a re-voice pass over `onboarding-copy.js`, `README.md`, and `CHANGELOG.md`.

**Tech Stack:** Vanilla ES modules (no bundler, no new npm packages). Vitest (node environment, no jsdom). Canvas2D / OffscreenCanvas. Chrome MV3 `chrome.action.setIcon`. CSS custom properties.

---

## Conventions used in this plan

- All paths are relative to the repo root `/Users/clubpenguin/Documents/clubP/repolens`.
- Verification commands available in this repo: `node --check <file>`, `npx vitest run [path]`, `npx eslint .`. There is **no DOM test environment** (no jsdom) — for visual / DOM / service-worker glue, use the "verify live" steps (open an HTML harness in Chrome, or load the unpacked extension), mirroring the existing `onboarding-demo.html` precedent. Do not invent a jsdom test.
- The mascot glyph and the in-app loading spinner read `--accent`, so they auto-recolor when the theme changes — most theme tasks are CSS + a string-presence test, not DOM tests.
- **Do not run `npm install`.** All deps are already present.

## File structure (created / modified across all phases)

**Created**
- `icon-draw.js` — pure canvas draw of the Mono Ink Vee icon (one responsibility: shapes + colors).
- `icon-anim.js` — service-worker scan animation (timer + frame params + `setIcon`); imports `icon-draw.js`.
- `tools/make-icons.html` — one-off PNG export harness; imports `icon-draw.js`.
- `assets/wordmark.svg` — horizontal lockup (lens + "RepoLens").
- `docs/style/stop-slop/` — vendored writing standard (`SKILL.md`, `references/phrases.md`, `references/structures.md`).
- `docs/style/README.md` — points to stop-slop as the project writing standard.
- `tests/icon-draw.test.js`, `tests/icon-anim.test.js` — unit tests for the pure pieces.
- `icons/icon16.png`, `icons/icon32.png`, `icons/icon48.png`, `icons/icon128.png` — real PNGs (replacing 70-byte stubs; 32 is new).

**Modified**
- `manifest.json` — `icons` + `action.default_icon` (+32), `description` (tagline).
- `background.js` — import `icon-anim.js`; start/stop animation in `runAnalysis`; thread `tabId`.
- `theme.js` — add `monoink` to `THEMES`; set `DEFAULT_THEME='monoink'`.
- `themes.css` — add `[data-theme="monoink"]` block.
- `mascot.css` — only if the live contrast check forces a minimal aperture/pupil tweak under monoink.
- `options.html`, `options.js` — `animateIcon` checkbox + read/save + persist `reduceMotion`.
- `library.js`, `output-tab.js` — persist `reduceMotion` on init.
- `settings-backup.js` — add `'animateIcon'` to `SAFE_SETTING_KEYS`.
- `onboarding-copy.js` — re-voiced `COPY`.
- `tests/onboarding-copy.test.js` — unchanged (must stay green); optionally extended.
- `tests/theme.test.js` — extended for `monoink` default + ordering.
- `README.md`, `CHANGELOG.md` — tagline, de-slop pass, changelog entry.

---

# Phase A — Icon system

> Goal of this phase: a real dark-tile single-lens icon at 16/32/48/128, generated from one canvas draw function, plus a scan-only animation in the service worker gated by `animateIcon` + reduced motion. Independently committable (each task ends in a commit).

## Task A1: `icon-draw.js` — pure canvas draw of the Mono Ink icon

The icon is the existing Vee lens (designed on a 48-unit grid in `mascot.js`) rendered onto a dark rounded-square tile. `drawVeeIcon` is framework-free: it only touches a Canvas2D-style context API (`fillStyle`, `strokeStyle`, `lineWidth`, `beginPath`, `arc`, `fill`, `stroke`, `save`, `restore`, `translate`, `rotate`, `roundRect`/`rect`, `clearRect`, `setLineDash`), so it works with both `CanvasRenderingContext2D` and `OffscreenCanvasRenderingContext2D`. The `opts` exist so the animation (Task A4) can drive the aperture and ring per frame.

**Files:**
- Create: `icon-draw.js`
- Test: `tests/icon-draw.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/icon-draw.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { drawVeeIcon, ICON_COLORS, BASE_GRID } from '../icon-draw.js';

// A recording stub for a Canvas2D-style context. It captures every arc() call
// and the fillStyle/strokeStyle active at draw time, so we can assert geometry
// and colors without a real canvas.
function recordingCtx() {
  const calls = { arcs: [], fills: [], strokes: [], rects: [], setLineDash: [] };
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 0,
    save() {}, restore() {}, beginPath() {}, closePath() {},
    translate() {}, rotate() {}, clearRect() {},
    rect(x, y, w, h) { calls.rects.push({ x, y, w, h, fillStyle: ctx.fillStyle }); },
    roundRect(x, y, w, h, r) { calls.rects.push({ x, y, w, h, r, fillStyle: ctx.fillStyle }); },
    arc(x, y, radius) { calls.arcs.push({ x, y, radius, fillStyle: ctx.fillStyle, strokeStyle: ctx.strokeStyle, lineWidth: ctx.lineWidth }); },
    setLineDash(d) { calls.setLineDash.push(d); },
    fill() { calls.fills.push({ fillStyle: ctx.fillStyle }); },
    stroke() { calls.strokes.push({ strokeStyle: ctx.strokeStyle, lineWidth: ctx.lineWidth }); },
  };
  return { ctx, calls };
}

describe('drawVeeIcon', () => {
  it('scales the three lens-circle radii by size/48 from the base grid', () => {
    const { ctx, calls } = recordingCtx();
    drawVeeIcon(ctx, 96); // factor = 2
    const radii = calls.arcs.map((a) => a.radius).sort((a, b) => a - b);
    // base radii: pupil 2.4, aperture 9, barrel 17 → ×2
    expect(radii).toEqual([4.8, 18, 34]);
  });

  it('uses the Mono Ink colors: dark tile, light barrel, blue aperture, light pupil', () => {
    const { ctx, calls } = recordingCtx();
    drawVeeIcon(ctx, 48); // factor = 1
    // tile is a filled rounded rect in ink
    expect(calls.rects.some((r) => r.fillStyle === ICON_COLORS.tile)).toBe(true);
    const barrel = calls.arcs.find((a) => a.radius === 17);
    const aperture = calls.arcs.find((a) => a.radius === 9);
    const pupil = calls.arcs.find((a) => a.radius === 2.4);
    expect(barrel.strokeStyle).toBe(ICON_COLORS.ring);
    expect(aperture.strokeStyle).toBe(ICON_COLORS.aperture);
    expect(pupil.fillStyle).toBe(ICON_COLORS.pupil);
  });

  it('honors apertureScale and ringColor opts', () => {
    const { ctx, calls } = recordingCtx();
    drawVeeIcon(ctx, 48, { apertureScale: 0.5, ringColor: '#3b82f6' });
    const aperture = calls.arcs.find((a) => Math.abs(a.radius - 4.5) < 1e-6); // 9 * 0.5
    expect(aperture).toBeTruthy();
    const barrel = calls.arcs.find((a) => a.radius === 17);
    expect(barrel.strokeStyle).toBe('#3b82f6');
  });

  it('exposes the base grid constant', () => {
    expect(BASE_GRID).toBe(48);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/icon-draw.test.js`
Expected: FAIL — `Failed to resolve import "../icon-draw.js"` (module does not exist yet).

- [ ] **Step 3: Write `icon-draw.js`**

Create `icon-draw.js`:

```javascript
// icon-draw.js — the RepoLens app icon, drawn once, used everywhere.
//
// One responsibility: paint the "Mono Ink" Vee lens onto a Canvas2D-style
// context. The lens geometry is the same 48-unit grid as the in-app mascot
// (mascot.js): a barrel ring (r17), an aperture (r9), a pupil (r2.4). Here it
// sits on a dark rounded-square tile so the icon pops on a light browser
// toolbar. Framework-free: it only calls the shared Canvas2D / OffscreenCanvas
// API, so the export harness (tools/make-icons.html) and the service-worker
// animation (icon-anim.js) share this exact draw.

/** The drawing grid the lens is designed on. Every coordinate scales by size/BASE_GRID. */
export const BASE_GRID = 48;

/** Mono Ink icon palette. Light marks on a near-black tile. */
export const ICON_COLORS = Object.freeze({
  tile: '#0f1115',     // --rl-ink
  ring: '#cbd5e1',     // light barrel ring
  aperture: '#3b82f6', // electric-blue aperture
  pupil: '#e5edff',    // --rl-on-dark light pupil
});

/**
 * Draw the icon at a given pixel size onto a Canvas2D-style context.
 * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} ctx
 * @param {number} size pixel width/height of the square icon
 * @param {object} [opts]
 * @param {number} [opts.apertureScale=1] multiply the aperture radius (animation)
 * @param {number} [opts.apertureRotation=0] radians to rotate the aperture (dashed spin)
 * @param {number} [opts.ringScale=1] multiply the barrel-ring radius (breathe)
 * @param {string} [opts.ringColor] override the barrel-ring stroke (grey→blue breathe)
 * @param {boolean} [opts.dashed=false] dash the aperture so spin reads
 */
export function drawVeeIcon(ctx, size, opts = {}) {
  const {
    apertureScale = 1,
    apertureRotation = 0,
    ringScale = 1,
    ringColor = ICON_COLORS.ring,
    dashed = false,
  } = opts;

  const f = size / BASE_GRID; // grid → pixels
  const cx = 24 * f;
  const cy = 24 * f;

  ctx.clearRect(0, 0, size, size);

  // Dark rounded-square tile.
  const radius = size * 0.22;
  ctx.fillStyle = ICON_COLORS.tile;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(0, 0, size, size, radius);
  } else {
    // Manual rounded rect for engines without roundRect.
    const r = Math.min(radius, size / 2);
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0);
    ctx.arc(size - r, r, r, -Math.PI / 2, 0);
    ctx.lineTo(size, size - r);
    ctx.arc(size - r, size - r, r, 0, Math.PI / 2);
    ctx.lineTo(r, size);
    ctx.arc(r, size - r, r, Math.PI / 2, Math.PI);
    ctx.lineTo(0, r);
    ctx.arc(r, r, r, Math.PI, Math.PI * 1.5);
  }
  ctx.fill();

  // Barrel ring (r17) — light grey by default, scalable + recolorable for breathe.
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 2 * f;
  ctx.beginPath();
  ctx.arc(cx, cy, 17 * f * ringScale, 0, Math.PI * 2);
  ctx.stroke();

  // Aperture (r9) — electric blue, scalable + rotatable + optionally dashed.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(apertureRotation);
  ctx.strokeStyle = ICON_COLORS.aperture;
  ctx.lineWidth = 3 * f;
  if (dashed) {
    const circ = 2 * Math.PI * (9 * f * apertureScale);
    ctx.setLineDash([circ / 8, circ / 16]);
  } else {
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  ctx.arc(0, 0, 9 * f * apertureScale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Pupil (r2.4) — light blue-white, fixed center.
  ctx.setLineDash([]);
  ctx.fillStyle = ICON_COLORS.pupil;
  ctx.beginPath();
  ctx.arc(cx, cy, 2.4 * f, 0, Math.PI * 2);
  ctx.fill();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/icon-draw.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Syntax + lint**

Run: `node --check icon-draw.js && npx eslint icon-draw.js tests/icon-draw.test.js`
Expected: no output (clean exit 0).

- [ ] **Step 6: Commit**

```bash
git add icon-draw.js tests/icon-draw.test.js
git commit -m "feat(brand): icon-draw.js — pure canvas draw of the Mono Ink Vee icon"
```

## Task A2: `tools/make-icons.html` — PNG export harness

A standalone page that imports `icon-draw.js`, paints the icon at each size onto visible canvases, and auto-downloads each as `iconNN.png`. It is a developer tool, not shipped in the extension.

**Files:**
- Create: `tools/make-icons.html`

- [ ] **Step 1: Write `tools/make-icons.html`**

Create `tools/make-icons.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>RepoLens — icon export</title>
  <style>
    body { margin: 0; padding: 24px; background: #f4f6f9; color: #0f1115;
           font-family: system-ui, -apple-system, sans-serif; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    p { font-size: 13px; color: #6b7280; margin: 0 0 18px; max-width: 560px; }
    .row { display: flex; gap: 24px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 18px; }
    .cell { display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .cell span { font-size: 12px; color: #6b7280; }
    canvas { background:
      repeating-conic-gradient(#e9edf3 0% 25%, #ffffff 0% 50%) 50% / 16px 16px;
      border: 1px solid #d7dde6; image-rendering: pixelated; }
    button { padding: 8px 14px; border: 1px solid #0f1115; border-radius: 8px;
             background: #fff; color: #0f1115; font-size: 13px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>RepoLens icon export</h1>
  <p>Renders the Mono Ink Vee icon at 16/32/48/128 from <code>icon-draw.js</code>.
     Click "Download all" and move the four <code>iconNN.png</code> files into
     <code>../icons/</code>. The checkerboard behind each canvas is page CSS only,
     not part of the icon (the tile is opaque).</p>
  <div class="row" id="row"></div>
  <button id="download">Download all</button>

  <script type="module">
    import { drawVeeIcon } from '../icon-draw.js';

    const SIZES = [16, 32, 48, 128];
    const row = document.getElementById('row');
    const canvases = {};

    for (const size of SIZES) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      // Upscale tiny canvases for visibility without changing the bitmap.
      canvas.style.width = Math.max(size, 64) + 'px';
      canvas.style.height = Math.max(size, 64) + 'px';
      const label = document.createElement('span');
      label.textContent = `icon${size}.png`;
      cell.append(canvas, label);
      row.append(cell);
      drawVeeIcon(canvas.getContext('2d'), size);
      canvases[size] = canvas;
    }

    function downloadCanvas(canvas, name) {
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
    }

    document.getElementById('download').onclick = () => {
      for (const size of SIZES) downloadCanvas(canvases[size], `icon${size}.png`);
    };
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify live (open in Chrome)**

Open `file:///Users/clubpenguin/Documents/clubP/repolens/tools/make-icons.html` in Chrome.
Expected: four canvases render a dark rounded tile with a light ring, a blue aperture ring, and a light center dot, at 16/32/48/128. The "Download all" button saves four PNGs.

> Playwright-automated alternative (if a human browser pass is not possible): navigate to the harness, then for each size run `canvas.toDataURL('image/png')` in the page, strip the `data:image/png;base64,` prefix, and write the decoded bytes to `icons/iconNN.png`. This is exactly what Task A3 consumes.

- [ ] **Step 3: Commit**

```bash
git add tools/make-icons.html
git commit -m "feat(brand): tools/make-icons.html — export icon PNGs from icon-draw.js"
```

## Task A3: Generate the real PNGs and wire the manifest (adds size 32)

Replace the four icon files (16/32/48/128) with real renders, then point the manifest at all four. Size 32 is new — it gives a crisp Windows/HiDPI toolbar icon and matches the animation sizes.

**Files:**
- Create/overwrite: `icons/icon16.png`, `icons/icon32.png`, `icons/icon48.png`, `icons/icon128.png`
- Modify: `manifest.json` (lines 64-68 `action.default_icon`, lines 74-78 `icons`)

- [ ] **Step 1: Generate the PNGs**

Using the harness from Task A2, produce the four files and place them in `icons/`. Confirm they are real images, not stubs:

Run: `cd /Users/clubpenguin/Documents/clubP/repolens && file icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png && ls -l icons/`
Expected: each reports `PNG image data, NN x NN` with the matching dimensions (16x16, 32x32, 48x48, 128x128), and each file is well over the old 70-byte stub size.

- [ ] **Step 2: Wire `action.default_icon` to include 32**

In `manifest.json`, replace the `action.default_icon` block (currently lines 64-68):

```json
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
```

with:

```json
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
```

- [ ] **Step 3: Wire top-level `icons` to include 32**

In `manifest.json`, replace the `icons` block (currently lines 74-78):

```json
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
```

with:

```json
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
```

- [ ] **Step 4: Verify the manifest parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"`
Expected: `manifest ok`.

- [ ] **Step 5: Verify live (load unpacked)**

Load the unpacked extension at `chrome://extensions` (Developer mode → Load unpacked → repo root). The toolbar icon shows the dark-tile lens, legible on both a light and a dark toolbar. Take a screenshot at the default size for the record.

- [ ] **Step 6: Commit**

```bash
git add icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png manifest.json
git commit -m "feat(brand): real Mono Ink icon PNGs at 16/32/48/128, wired into manifest (+32)"
```

## Task A4: `icon-anim.js` — scan-state animation (timer + frame params)

Two responsibilities, one split out for testing: a **pure** `scanFrameParams(elapsedMs)` computing the per-frame draw opts, and the **impure** timer (`startScanAnim` / `stopScanAnim`) that renders frames onto `OffscreenCanvas`es and pushes them via `chrome.action.setIcon`. No `requestAnimationFrame` (unavailable in a worker) — a `setTimeout` loop at ~90ms.

The animation: aperture grows once on start (scale ~0.5 → 1.1 with a slight overshoot over the first ~600ms), then spins (rotation accelerates slow → fast, dashed); the barrel ring breathes (ringScale 1.0 ↔ ~1.08) and shifts color grey → blue on a gentle loop. Pupil stays fixed (drawn by `icon-draw.js`).

**Files:**
- Create: `icon-anim.js`
- Test: `tests/icon-anim.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/icon-anim.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { scanFrameParams, ANIM_SIZES, RING_GREY, RING_BLUE } from '../icon-anim.js';

describe('scanFrameParams', () => {
  it('starts the aperture small and grown-in by the end of the grow phase', () => {
    const t0 = scanFrameParams(0);
    const tGrown = scanFrameParams(600); // end of grow phase
    expect(t0.apertureScale).toBeLessThan(0.7);
    expect(tGrown.apertureScale).toBeGreaterThan(1.0);
    // dashed so the spin reads
    expect(t0.dashed).toBe(true);
  });

  it('rotation increases monotonically and accelerates (slow → fast)', () => {
    const a = scanFrameParams(800).apertureRotation;
    const b = scanFrameParams(1700).apertureRotation;
    const c = scanFrameParams(2600).apertureRotation;
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    // second 900ms window covers more rotation than the first (acceleration)
    expect(c - b).toBeGreaterThan(b - a);
  });

  it('ring breathes within bounds and stays between grey and blue', () => {
    for (const t of [0, 250, 700, 1500, 3000]) {
      const p = scanFrameParams(t);
      expect(p.ringScale).toBeGreaterThanOrEqual(1.0);
      expect(p.ringScale).toBeLessThanOrEqual(1.1);
      expect([RING_GREY, RING_BLUE].includes(p.ringColor) || p.ringColor.startsWith('rgb')).toBe(true);
    }
  });

  it('renders at the toolbar sizes 16, 32, 48', () => {
    expect(ANIM_SIZES).toEqual([16, 32, 48]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/icon-anim.test.js`
Expected: FAIL — `Failed to resolve import "../icon-anim.js"`.

- [ ] **Step 3: Write `icon-anim.js`**

Create `icon-anim.js`:

```javascript
// icon-anim.js — toolbar icon animation, for the active-scan state only.
//
// The installed icon is a static PNG (manifest). While a scan runs, the service
// worker pushes animated frames via chrome.action.setIcon({ tabId, imageData }),
// then resets to the static path icon when the scan finishes or errors.
//
// No requestAnimationFrame in a worker — a setTimeout loop ticks ~every TICK_MS.
// The per-frame math (scanFrameParams) is pure and unit-tested; the timer and
// canvas/setIcon glue are verified live in the loaded extension.
//
// Respect: startScanAnim no-ops when animateIcon is off OR reduced motion is set
// (both read from chrome.storage.local), and when there is no tabId.

import { drawVeeIcon } from './icon-draw.js';

/** Sizes Chrome needs for the action icon imageData map. */
export const ANIM_SIZES = [16, 32, 48];

const TICK_MS = 90;          // frame interval (worker-friendly)
const GROW_MS = 600;         // aperture grow-in duration
const MAX_RUN_MS = 90_000;   // safety cap: never animate longer than this
const STATIC_PATH = { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' };

export const RING_GREY = '#cbd5e1';
export const RING_BLUE = '#3b82f6';

/** Clamp helper. */
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Linear blend of two hex colors → rgb() string. t in [0,1]. */
function mixHex(a, b, t) {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${m[0]}, ${m[1]}, ${m[2]})`;
}

/**
 * Pure: the draw opts for a given elapsed time.
 * @param {number} elapsedMs ms since scan start
 * @returns {{apertureScale:number, apertureRotation:number, ringScale:number, ringColor:string, dashed:boolean}}
 */
export function scanFrameParams(elapsedMs) {
  const t = Math.max(0, elapsedMs);

  // Aperture grow-in with a slight overshoot, then settle at 1.0.
  let apertureScale;
  if (t < GROW_MS) {
    const p = t / GROW_MS;                 // 0 → 1
    const eased = 1 - Math.pow(1 - p, 3);  // easeOutCubic
    apertureScale = 0.5 + (1.1 - 0.5) * eased; // 0.5 → 1.1 (overshoot)
  } else {
    const settle = clamp((t - GROW_MS) / 200, 0, 1);
    apertureScale = 1.1 - 0.1 * settle;    // 1.1 → 1.0
  }

  // Spin accelerates: angle grows with the square of time-after-grow.
  const spinT = Math.max(0, t - GROW_MS) / 1000; // seconds spinning
  const apertureRotation = 0.6 * spinT * spinT;   // rad; quadratic = slow → fast

  // Ring breathe: gentle sinusoid for both scale and grey→blue blend.
  const phase = (t % 2400) / 2400;               // 2.4s loop
  const wave = (1 - Math.cos(phase * Math.PI * 2)) / 2; // 0 → 1 → 0
  const ringScale = 1.0 + 0.08 * wave;
  const ringColor = mixHex(RING_GREY, RING_BLUE, wave);

  return { apertureScale, apertureRotation, ringScale, ringColor, dashed: true };
}

// ─── Impure timer + setIcon glue (verified live, not unit-tested) ─────────────

const timers = new Map(); // tabId → { id, started }

async function shouldAnimate() {
  try {
    const { animateIcon, reduceMotion } = await chrome.storage.local.get(['animateIcon', 'reduceMotion']);
    if (animateIcon === false) return false;   // default ON
    if (reduceMotion === true) return false;
    return true;
  } catch {
    return false; // storage unavailable → stay static
  }
}

function renderImageData(elapsedMs) {
  const params = scanFrameParams(elapsedMs);
  const imageData = {};
  for (const size of ANIM_SIZES) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    drawVeeIcon(ctx, size, params);
    imageData[size] = ctx.getImageData(0, 0, size, size);
  }
  return imageData;
}

/**
 * Begin animating the toolbar icon for one tab's active scan.
 * No-ops when disabled, under reduced motion, or without a tabId.
 * @param {number|undefined} tabId
 */
export async function startScanAnim(tabId) {
  if (typeof tabId !== 'number') return;
  if (timers.has(tabId)) return;          // already animating this tab
  if (!(await shouldAnimate())) return;

  const started = Date.now();
  const tick = () => {
    const elapsed = Date.now() - started;
    if (elapsed > MAX_RUN_MS) { stopScanAnim(tabId); return; }
    try {
      chrome.action.setIcon({ tabId, imageData: renderImageData(elapsed) }).catch(() => {});
    } catch { /* tab gone / OffscreenCanvas unavailable — stop quietly */ stopScanAnim(tabId); return; }
    const id = setTimeout(tick, TICK_MS);
    const entry = timers.get(tabId);
    if (entry) entry.id = id; else { clearTimeout(id); }
  };

  timers.set(tabId, { id: 0, started });
  tick();
}

/**
 * Stop animating a tab and reset it to the static path icon.
 * Safe to call when no animation is running.
 * @param {number|undefined} tabId
 */
export function stopScanAnim(tabId) {
  if (typeof tabId !== 'number') return;
  const entry = timers.get(tabId);
  if (entry) { clearTimeout(entry.id); timers.delete(tabId); }
  try { chrome.action.setIcon({ tabId, path: STATIC_PATH }).catch(() => {}); } catch { /* tab gone */ }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/icon-anim.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Syntax + lint**

Run: `node --check icon-anim.js && npx eslint icon-anim.js tests/icon-anim.test.js`
Expected: clean exit 0. (`OffscreenCanvas` is a worker global; if eslint flags it as undefined, add `/* global OffscreenCanvas */` at the top of `icon-anim.js` — match the project's existing global-comment style if one exists in `background.js`.)

- [ ] **Step 6: Commit**

```bash
git add icon-anim.js tests/icon-anim.test.js
git commit -m "feat(brand): icon-anim.js — scan-state toolbar animation + pure frame math"
```

## Task A5: Hook the animation into the service worker

Import `icon-anim.js` and thread the scanning tab's id into `runAnalysis`, starting the animation at scan start and stopping it on **both** the success and error completion paths. `runAnalysis` currently takes `(sessionKey, detected)`; add an optional third `tabId`. Of the four call sites, two have a tab id: `chrome.action.onClicked` (the `tab` arg) and `RERUN` (`sender.tab?.id`). The context-menu and batch paths pass nothing (no tab to animate), and `startScanAnim` simply no-ops on a missing tabId.

**Files:**
- Modify: `background.js` (imports near top; `runAnalysis` signature at line 648; start at line 660; stop in success path before line 752; stop in catch at lines 756-758; call sites at lines 181, 202, 558)

- [ ] **Step 1: Import `icon-anim.js`**

In `background.js`, add after the existing import on line 66 (`import { buildComparePrompt, parseCompareResult } from './compare-repos.js';`):

```javascript
import { startScanAnim, stopScanAnim } from './icon-anim.js';
```

- [ ] **Step 2: Add the `tabId` parameter to `runAnalysis`**

In `background.js`, change the signature on line 648 from:

```javascript
async function runAnalysis(sessionKey, detected) {
```

to:

```javascript
async function runAnalysis(sessionKey, detected, tabId) {
```

- [ ] **Step 3: Start the animation at scan start**

In `background.js`, immediately inside the `try {` (currently line 655), before the `prevCached` snapshot, add:

```javascript
    startScanAnim(tabId); // fire-and-forget; no-ops without a tabId / when disabled / reduced motion
```

so the block reads:

```javascript
  try {
    startScanAnim(tabId); // fire-and-forget; no-ops without a tabId / when disabled / reduced motion
    // Snapshot the previous cached analysis for diff comparison (before it's overwritten).
    const prevCached = await getCached(detected.platform, detected.repoId).catch(() => null);
```

- [ ] **Step 4: Stop the animation on success**

In `background.js`, the success branch ends inside the `try` just before the closing `} catch (err) {` on line 752. The last statement there is the notification `try { … } catch { … }` ending at line 750. Add the stop immediately after that closing brace (line 750), still inside the outer `try`:

```javascript
    } catch { /* notifications are best-effort */ }

    stopScanAnim(tabId); // success: reset to the static icon
```

- [ ] **Step 5: Stop the animation on error**

In `background.js`, in the `catch (err)` block (lines 752-759), add the stop as the first line so a failed scan also resets the icon:

```javascript
  } catch (err) {
    stopScanAnim(tabId); // error: reset to the static icon
    // AI failures already carry a humanized message + kind; other failures (fetch,
    // parse) get classified here so the tab can still route the error CTA.
    const errorKind = err.kind || categorizeError(err).kind;
    await chrome.storage.session.set({
      [sessionKey]: { ...detected, loading: false, error: err.message, errorKind }
    });
  }
```

- [ ] **Step 6: Thread `tabId` from the action click**

In `background.js`, the `chrome.action.onClicked` handler (line 523) gives a `tab`. The current line 558 is:

```javascript
  runAnalysis(sessionKey, detected);
```

Change it to:

```javascript
  runAnalysis(sessionKey, detected, tab.id);
```

- [ ] **Step 7: Thread `tabId` from RERUN**

In `background.js`, find the RERUN handler around line 196-202. The `runAnalysis` call there (line 202) is currently:

```javascript
        runAnalysis(msg.sessionKey, detected); // fire and forget; tab polls the session
```

Change it to (the RERUN message comes from the output tab, so `sender.tab?.id` is that tab):

```javascript
        runAnalysis(msg.sessionKey, detected, sender.tab?.id); // fire and forget; tab polls the session
```

> Leave the context-menu call (line 181) and the batch call (line 597) as `runAnalysis(sessionKey, detected)` / `runAnalysis(subKey, {...})` — those have no single foreground tab to animate, and `startScanAnim(undefined)` no-ops.

- [ ] **Step 8: Verify syntax + lint + full suite**

Run: `node --check background.js && npx eslint background.js && npx vitest run`
Expected: `node --check` silent; eslint clean; the full Vitest suite passes (730+ tests, including the new `icon-draw` and `icon-anim` tests).

- [ ] **Step 9: Verify live (load unpacked, run a scan)**

Load the unpacked extension. On a GitHub repo page, click the toolbar icon. Expected: the toolbar icon's aperture grows, then spins (accelerating), the ring breathes grey→blue while the scan runs, and it snaps back to the static dark-tile icon when the result tab finishes loading. Force an error (e.g. invalid key) and confirm the icon also resets on failure.

- [ ] **Step 10: Commit**

```bash
git add background.js
git commit -m "feat(brand): animate the toolbar icon during an active scan"
```

## Task A6: Settings — `animateIcon` toggle + persisted reduced-motion flag

Add an `animateIcon` checkbox (default ON, mirroring `mascotEnabled`), persist a `reduceMotion` flag from the pages that already initialize, and allowlist `animateIcon` in the settings backup.

**Files:**
- Modify: `options.html` (after the mascot checkbox at line 202)
- Modify: `options.js` (after the mascot block at lines 111-117; add reduceMotion persist near `initTheme`)
- Modify: `library.js` (init region near line 33)
- Modify: `output-tab.js` (init region near line 44)
- Modify: `settings-backup.js` (`SAFE_SETTING_KEYS`, lines 14-35)

- [ ] **Step 1: Add the `animateIcon` checkbox to `options.html`**

In `options.html`, the mascot row is line 202:

```html
    <label class="checkbox-row"><input type="checkbox" id="mascotEnabled"><span>Show “Vee”, the lens mascot</span></label>
```

Add directly after it:

```html
    <label class="checkbox-row"><input type="checkbox" id="animateIcon"><span>Animate the toolbar icon while a scan runs</span></label>
```

- [ ] **Step 2: Read/save `animateIcon` in `options.js`**

In `options.js`, the mascot block is lines 111-117:

```javascript
const mascotInput = document.getElementById('mascotEnabled');
chrome.storage.local.get('mascotEnabled', ({ mascotEnabled }) => {
  mascotInput.checked = mascotEnabled !== false;
});
mascotInput.addEventListener('change', () => {
  chrome.storage.local.set({ mascotEnabled: mascotInput.checked });
});
```

Add directly after it:

```javascript
const animateIconInput = document.getElementById('animateIcon');
chrome.storage.local.get('animateIcon', ({ animateIcon }) => {
  animateIconInput.checked = animateIcon !== false; // default ON
});
animateIconInput.addEventListener('change', () => {
  chrome.storage.local.set({ animateIcon: animateIconInput.checked });
});
```

- [ ] **Step 3: Persist `reduceMotion` from `options.js`**

In `options.js`, the theme is initialized via `initTheme` (imported line 11). Add this one-liner near the top-level init (place it right after the `animateIcon` block from Step 2, since both run on options-page load):

```javascript
// Persist the user's OS reduced-motion preference so the service worker (which has
// no DOM / matchMedia) can honor it before animating the toolbar icon.
chrome.storage.local.set({ reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
```

- [ ] **Step 4: Persist `reduceMotion` from `library.js`**

In `library.js`, line 33 is `initTheme();` and line 37 already reads `matchMedia('(prefers-reduced-motion: reduce)').matches`. Add immediately after line 33:

```javascript
// Mirror the OS reduced-motion preference into storage for the service worker.
chrome.storage.local.set({ reduceMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches });
```

- [ ] **Step 5: Persist `reduceMotion` from `output-tab.js`**

In `output-tab.js`, line 44 is `initTheme();`. Add immediately after it:

```javascript
// Mirror the OS reduced-motion preference into storage for the service worker.
chrome.storage.local.set({ reduceMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches });
```

- [ ] **Step 6: Allowlist `animateIcon` in the settings backup**

In `settings-backup.js`, add `'animateIcon'` to `SAFE_SETTING_KEYS`. The current entry on line 19 is:

```javascript
  'mascotEnabled',
```

Change it to:

```javascript
  'mascotEnabled',
  'animateIcon',
```

> Do **not** add `reduceMotion` to the allowlist — it is a device/OS-derived flag, not a user setting, and should be recomputed per device rather than synced.

- [ ] **Step 7: Verify the backup allowlist test still passes**

Run: `npx vitest run tests/settings-backup.test.js`
Expected: PASS. (If `settings-backup.test.js` asserts an exact `SAFE_SETTING_KEYS` list/length, update that assertion to include `'animateIcon'` in the same edit and re-run.)

- [ ] **Step 8: Verify syntax + lint + full suite**

Run: `node --check options.js && node --check library.js && node --check output-tab.js && node --check settings-backup.js && npx eslint options.js library.js output-tab.js settings-backup.js && npx vitest run`
Expected: clean; full suite green.

- [ ] **Step 9: Verify live**

Open Options → confirm the new "Animate the toolbar icon" checkbox is checked by default and toggling persists. Turn it off, run a scan, confirm the icon stays static. Turn it back on; enable OS "Reduce motion" and confirm the icon stays static (reduceMotion flag wins).

- [ ] **Step 10: Commit**

```bash
git add options.html options.js library.js output-tab.js settings-backup.js tests/settings-backup.test.js
git commit -m "feat(brand): animateIcon setting + persisted reduced-motion flag for the SW"
```

---

# Phase B — Mono Ink default theme + Vee recolor

> Goal: add Mono Ink as a real theme, make it the engine default, confirm Vee recolors correctly, and prove the default + the other 13 themes with tests and a live check. Independently committable.

## Task B1: Add the `[data-theme="monoink"]` block to `themes.css`

Mono Ink is a **light** theme: white surfaces, near-black ink, cobalt accent. Define the full per-theme token vocabulary used by the default `:root` block (lines 4-27). The shared status colors and motion tokens stay in `:root` — do **not** redefine them here.

**Files:**
- Modify: `themes.css` (insert a new block; suggested location: immediately after the closing `}` of the `:root, [data-theme="midnight"]` block at line 60, before `[data-theme="paper"]` on line 62)

- [ ] **Step 1: Add the Mono Ink block**

In `themes.css`, insert after line 60 (the `}` that closes the default block) and before line 62 (`[data-theme="paper"] {`):

```css
[data-theme="monoink"] {
  --body-bg: #f4f6f9;
  --bg: #ffffff;
  --surface: #ffffff;
  --surface-alt: #f4f6f9;
  --border: #d7dde6;
  --border-2: #c4ccd8;

  --text: #0f1115;
  --text-strong: #0f1115;
  --text-body: #1f2430;
  --text-sub: #6b7280;
  --text-muted: #9aa3af;
  --text-faint: #aab2bd;
  --text-fainter: #c4ccd8;

  --accent: #2563eb;            /* cobalt — UI accent (AA on white) */
  --accent-deep: #1d4ed8;       /* electric blue — strong/brand */
  --accent-deep-hover: #1e40af;
  --accent-grad: linear-gradient(135deg, #1d4ed8, #2563eb);

  --font: "Space Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --card-shadow: 0 1px 2px rgba(15, 17, 21, 0.06), 0 8px 24px rgba(15, 17, 21, 0.06);
}
```

> Contrast note: `--accent` `#2563eb` on `#ffffff` is ~4.6:1 (passes WCAG AA for text). `--text-sub` `#6b7280` on white is ~4.8:1. The electric `--accent-deep` `#1d4ed8` is reserved for the mark / strong emphasis, not body text. `Space Grotesk` is referenced as a font-family with a system fallback chain; this phase does not bundle the font file (web-font packaging is a later workstream), so the fallback renders until the site provides the face.

- [ ] **Step 2: Verify the stylesheet is well-formed**

Run: `node -e "const c=require('fs').readFileSync('themes.css','utf8'); const o=(c.match(/{/g)||[]).length, x=(c.match(/}/g)||[]).length; if(o!==x) throw new Error('brace mismatch '+o+' vs '+x); console.log('braces balanced', o)"`
Expected: `braces balanced N` (open == close).

- [ ] **Step 3: Commit**

```bash
git add themes.css
git commit -m "feat(brand): add the Mono Ink theme to themes.css"
```

## Task B2: Make Mono Ink the engine default in `theme.js`

Set `DEFAULT_THEME='monoink'` and register `monoink` in the `THEMES` array. Existing users keep their stored `theme`; only fresh installs and the fallback get Mono Ink.

**Files:**
- Modify: `theme.js` (line 1; `THEMES` array lines 3-17)
- Test: `tests/theme.test.js` (existing — must be updated to match)

- [ ] **Step 1: Update the existing theme test to expect the new default + entry (RED first)**

In `tests/theme.test.js`, the `THEMES` test (lines 27-36) asserts an exact key list and the default test (lines 37-39) asserts `'midnight'`. Update both to the new reality. Replace the key-list array (lines 28-31):

```javascript
    expect(THEMES.map(t => t.key)).toEqual([
      'midnight', 'paper', 'terminal', 'synthwave', 'bmw', 'xai', 'claude', 'apple',
      'nord', 'gruvbox', 'rosepine', 'latte', 'solarized',
    ]);
```

with (Mono Ink added at the front so it is the most prominent picker entry):

```javascript
    expect(THEMES.map(t => t.key)).toEqual([
      'monoink', 'midnight', 'paper', 'terminal', 'synthwave', 'bmw', 'xai', 'claude',
      'apple', 'nord', 'gruvbox', 'rosepine', 'latte', 'solarized',
    ]);
```

and replace the default assertion (lines 37-39):

```javascript
  it('defaults to midnight', () => {
    expect(DEFAULT_THEME).toBe('midnight');
  });
```

with:

```javascript
  it('defaults to monoink', () => {
    expect(DEFAULT_THEME).toBe('monoink');
  });
```

Also update the "applies midnight when nothing is stored" test (lines 60-64) so it expects the new default:

```javascript
  it('applies the default when nothing is stored', async () => {
    const key = await initTheme();
    expect(key).toBe('monoink');
    expect(document.documentElement.getAttribute('data-theme')).toBe('monoink');
  });
```

> Leave the `applyTheme('bogus')` fallback test (lines 47-50) asserting `'midnight'`? No — that asserts the fallback equals the default. Update its expected value to `'monoink'`:
>
> ```javascript
>   it('falls back to the default for an unknown key', () => {
>     applyTheme('bogus');
>     expect(document.documentElement.getAttribute('data-theme')).toBe('monoink');
>   });
> ```

- [ ] **Step 2: Run the theme test to verify it fails**

Run: `npx vitest run tests/theme.test.js`
Expected: FAIL — default is still `'midnight'`, and `THEMES` lacks `monoink`.

- [ ] **Step 3: Set the default + register the theme in `theme.js`**

In `theme.js`, change line 1 from:

```javascript
export const DEFAULT_THEME = 'midnight';
```

to:

```javascript
export const DEFAULT_THEME = 'monoink';
```

Then add the Mono Ink entry as the first element of the `THEMES` array (line 3-4). Change:

```javascript
export const THEMES = [
  { key: 'midnight',  label: 'Midnight',  swatch: '#0a0a0f' },
```

to:

```javascript
export const THEMES = [
  { key: 'monoink',   label: 'Mono Ink',  swatch: 'linear-gradient(135deg, #0f1115 50%, #2563eb 50%)' },
  { key: 'midnight',  label: 'Midnight',  swatch: '#0a0a0f' },
```

- [ ] **Step 4: Run the theme test to verify it passes**

Run: `npx vitest run tests/theme.test.js`
Expected: PASS.

- [ ] **Step 5: Syntax + lint**

Run: `node --check theme.js && npx eslint theme.js tests/theme.test.js`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add theme.js tests/theme.test.js
git commit -m "feat(brand): make Mono Ink the default theme"
```

## Task B3: Confirm Vee + the loading spinner recolor under Mono Ink

The mascot glyph (`mascot.js`) and the in-app loading spinner (`output-tab.js:300`, `renderMascot(..., 'scanning')`) read `--accent`, so they recolor automatically. The only thing to decide is whether the aperture/pupil should use cobalt (`--accent`) or electric (`--accent-deep`) under Mono Ink. Per the spec (§5), Vee uses the theme accent; the electric blue is reserved for the app-icon mark. So no glyph change is expected — this task verifies that live and applies a minimal `mascot.css` tweak only if the live check shows a contrast problem.

**Files:**
- Verify: `mascot.js`, `output-tab.js` (no edit expected)
- Conditionally modify: `mascot.css` (only if contrast fails)

- [ ] **Step 1: Verify live (mascot states + loading spinner)**

Open `mascot-preview.html` in Chrome. In the page, set `<html data-theme="monoink">` (via DevTools or a temporary edit) and confirm every state — idle / scanning / strong / risky / thinking / empty / error — renders with legible cobalt aperture/pupil on the white surface, and the strong/risky states still read as green/red (those use `--ok`/`--bad`, shared in `:root`, so they are unaffected). Then load the unpacked extension, run a scan, and confirm the in-app loading spinner (`#loading-vee`) shows the cobalt scanning lens, not a washed-out one.

- [ ] **Step 2: Apply a minimal contrast fix only if needed**

If, and only if, the cobalt aperture/pupil reads too light on white in Step 1, scope a Mono-Ink-only override in `mascot.css` (append at the end of the file, outside the reduced-motion guard so it applies statically):

```css
/* Mono Ink: lift the idle aperture/pupil to the deeper accent for contrast on white. */
[data-theme="monoink"] .vee .vee-aperture { stroke: var(--accent-deep); }
[data-theme="monoink"] .vee .vee-pupil    { fill: var(--accent-deep); }
```

If Step 1 looked correct, make no change and note "no mascot.css change needed" in the commit body.

- [ ] **Step 3: Verify (only if mascot.css changed)**

Run: `npx eslint mascot.css 2>/dev/null || true` (eslint may not lint CSS; the real check is the live re-confirm) and re-open `mascot-preview.html` under `data-theme="monoink"` to confirm the fix.

- [ ] **Step 4: Commit**

If `mascot.css` changed:

```bash
git add mascot.css
git commit -m "fix(brand): lift Vee aperture/pupil to deep accent under Mono Ink for contrast"
```

If nothing changed, record the verification in an empty-tree-safe note commit only if your workflow requires it; otherwise skip the commit and proceed (the live check is the deliverable here).

## Task B4: Theme string-presence test (tokens + default ordering)

A node-environment test asserting `themes.css` defines the `monoink` block with the required token names. This guards against an accidental token rename that would leave Mono Ink half-styled.

**Files:**
- Test: `tests/theme.test.js` (extend the existing file)

- [ ] **Step 1: Write the failing test (extend `tests/theme.test.js`)**

Append a new `describe` block to `tests/theme.test.js`, after the existing `saveTheme` block (after line 74). It reads the CSS file from disk (node `fs`), matching the repo's "no jsdom" approach:

```javascript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

describe('themes.css Mono Ink block', () => {
  const css = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../themes.css'),
    'utf8',
  );

  it('defines a [data-theme="monoink"] block', () => {
    expect(css).toContain('[data-theme="monoink"]');
  });

  it('maps the full per-theme token vocabulary', () => {
    const monoink = css.slice(css.indexOf('[data-theme="monoink"]'));
    const block = monoink.slice(0, monoink.indexOf('}') + 1);
    const REQUIRED = [
      '--body-bg', '--bg', '--surface', '--surface-alt', '--border', '--border-2',
      '--text', '--text-strong', '--text-body', '--text-sub', '--text-muted',
      '--text-faint', '--text-fainter',
      '--accent', '--accent-deep', '--accent-deep-hover', '--accent-grad',
      '--font', '--mono', '--card-shadow',
    ];
    for (const token of REQUIRED) {
      expect(block.includes(token), `monoink block is missing ${token}`).toBe(true);
    }
  });

  it('uses the cobalt accent for monoink', () => {
    const monoink = css.slice(css.indexOf('[data-theme="monoink"]'));
    const block = monoink.slice(0, monoink.indexOf('}') + 1);
    expect(block).toContain('#2563eb');
  });
});
```

- [ ] **Step 2: Run to verify it passes (the CSS block already exists from B1)**

Run: `npx vitest run tests/theme.test.js`
Expected: PASS. (This test is written after B1 landed the block, so it goes green immediately; to see it as a genuine guard, temporarily rename `--accent` in the monoink block, re-run to see it FAIL, then restore.)

- [ ] **Step 3: Lint + commit**

Run: `npx eslint tests/theme.test.js`
Expected: clean.

```bash
git add tests/theme.test.js
git commit -m "test(brand): assert themes.css defines the Mono Ink token vocabulary"
```

## Task B5: Full-default + all-themes live verification

**Files:** none (verification only)

- [ ] **Step 1: Fresh-profile default check**

Load the unpacked extension in a fresh Chrome profile (no stored `theme`). Open the Library and Options. Expected: Mono Ink is active (white surfaces, cobalt accent, near-black text).

- [ ] **Step 2: All 14 themes switch**

In Options → theme picker, click through every swatch (Mono Ink + the original 13). Expected: each applies instantly with no broken tokens (no unstyled black-on-black or invisible text). Confirm switching back to Mono Ink restores the light look.

- [ ] **Step 3: AA spot-check**

In Mono Ink, confirm body text and links are legible on white (use DevTools contrast checker on a link and a `--text-sub` label; both should report ≥ 4.5:1).

- [ ] **Step 4: Full suite green**

Run: `npx vitest run && npx eslint .`
Expected: all tests pass; eslint 0 errors.

> No commit — this task is the gate that closes Phase B.

---

# Phase C — Wordmark + tagline

> Goal: a shareable horizontal lockup SVG, and the tagline propagated to the manifest description and README header. Independently committable.

## Task C1: `assets/wordmark.svg` — the lockup

The lens mark (Mono Ink, on a dark tile to match the icon) + "RepoLens" set to its right in a Space Grotesk-style weight. Text is rendered with `font-family` (with a system fallback) rather than outlined paths, to keep it editable; the file is a brand asset, not a runtime dependency.

**Files:**
- Create: `assets/wordmark.svg`

- [ ] **Step 1: Write `assets/wordmark.svg`**

Create `assets/wordmark.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="72" viewBox="0 0 320 72" role="img" aria-label="RepoLens">
  <title>RepoLens</title>
  <!-- Mark: the Vee lens on a dark Mono Ink tile (matches the app icon). -->
  <g>
    <rect x="4" y="4" width="64" height="64" rx="15" fill="#0f1115"/>
    <g transform="translate(36 36) scale(1.0833)">
      <!-- lens drawn on the 48-grid, centered at (0,0): factor 64/48 ≈ 1.333 baked via scale + grid coords -->
      <g transform="scale(1.333)">
        <circle cx="0" cy="0" r="17" fill="none" stroke="#cbd5e1" stroke-width="2"/>
        <circle cx="0" cy="0" r="9" fill="none" stroke="#3b82f6" stroke-width="3"/>
        <circle cx="0" cy="0" r="2.4" fill="#e5edff"/>
      </g>
    </g>
  </g>
  <!-- Wordmark: Space Grotesk with a system fallback, near-black, optical-left of baseline. -->
  <text x="84" y="47" fill="#0f1115"
        font-family="'Space Grotesk', system-ui, -apple-system, 'Segoe UI', sans-serif"
        font-size="34" font-weight="600" letter-spacing="-0.5">Repo<tspan fill="#1d4ed8">Lens</tspan></text>
</svg>
```

> The nested `scale` is intentional: the lens is authored on the same 48-unit grid as `icon-draw.js`, then scaled to sit inside the 64px tile. "Lens" is set in electric blue (`#1d4ed8`) to tie the wordmark to the mark; "Repo" stays ink.

- [ ] **Step 2: Verify it parses + renders**

Run: `node -e "const x=require('fs').readFileSync('assets/wordmark.svg','utf8'); if(!x.includes('<svg')||!x.includes('</svg>')) throw new Error('bad svg'); console.log('wordmark svg ok', x.length, 'bytes')"`
Expected: `wordmark svg ok N bytes`.
Then open `file:///Users/clubpenguin/Documents/clubP/repolens/assets/wordmark.svg` in Chrome. Expected: dark tile + lens on the left, "RepoLens" (with "Lens" in blue) to the right, vertically centered.

- [ ] **Step 3: Commit**

```bash
git add assets/wordmark.svg
git commit -m "feat(brand): assets/wordmark.svg — lens + RepoLens lockup"
```

## Task C2: Tagline in manifest + README header

Replace the old "Powered by Claude" description with the new tagline, and update the README H1/subtitle to match (dropping the telescope emoji per §7 "no emoji on product surfaces").

**Files:**
- Modify: `manifest.json` (line 5 `description`)
- Modify: `README.md` (lines 1-7 header block)

- [ ] **Step 1: Update the manifest description**

In `manifest.json`, change line 5 from:

```json
  "description": "One-click repo explainer. Powered by Claude.",
```

to:

```json
  "description": "Click any repo. Get a straight answer on whether to use it.",
```

- [ ] **Step 2: Update the README header**

In `README.md`, replace the header block (lines 1-7):

```markdown
<div align="center">

# 🔭 RepoLens

### One click opens the case file on any repo.

**The verdict · the evidence · the red flags · how it's actually built — in plain English, before the README's pitch.**
```

with (no emoji; tagline-first; the em dash removed per stop-slop):

```markdown
<div align="center">

# RepoLens

### Click any repo. Get a straight answer on whether to use it.

**The verdict, the evidence, the red flags, and how it's built. In plain English, before the README's pitch.**
```

- [ ] **Step 3: Verify the manifest parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"`
Expected: `manifest ok`.

- [ ] **Step 4: Commit**

```bash
git add manifest.json README.md
git commit -m "feat(brand): new tagline in manifest + README header (drop emoji)"
```

---

# Phase D — Voice / de-slop

> Goal: vendor the stop-slop standard, re-voice Vee's onboarding copy toward warm-human (keeping the machine test green), and de-slop the README intro + Vee lines + a CHANGELOG entry. Independently committable.

## Task D1: Vendor the stop-slop rules into the repo

Copy the three rule files from `/tmp/stop-slop/` into `docs/style/stop-slop/`, and add a short `docs/style/README.md` declaring it the writing standard.

**Files:**
- Create: `docs/style/stop-slop/SKILL.md`, `docs/style/stop-slop/references/phrases.md`, `docs/style/stop-slop/references/structures.md`
- Create: `docs/style/README.md`

- [ ] **Step 1: Copy the vendored rule files**

Run:

```bash
cd /Users/clubpenguin/Documents/clubP/repolens
mkdir -p docs/style/stop-slop/references
cp /tmp/stop-slop/SKILL.md docs/style/stop-slop/SKILL.md
cp /tmp/stop-slop/references/phrases.md docs/style/stop-slop/references/phrases.md
cp /tmp/stop-slop/references/structures.md docs/style/stop-slop/references/structures.md
```

Expected: no output; the three files now exist.

- [ ] **Step 2: Verify the files copied**

Run: `ls -R docs/style/stop-slop && head -1 docs/style/stop-slop/SKILL.md`
Expected: lists `SKILL.md` and `references/{phrases.md,structures.md}`; the head shows the SKILL frontmatter `---`.

- [ ] **Step 3: Write `docs/style/README.md`**

Create `docs/style/README.md`:

```markdown
# Writing standard

RepoLens copy follows **stop-slop** (Hardik Pandya's de-slop ruleset), vendored in
[`stop-slop/`](stop-slop/SKILL.md). It is the standard for product copy and docs:
Vee's onboarding lines, the README, the CHANGELOG, and any future store-listing or
website copy.

The short version: cut filler openers and adverbs, write active voice with a human
subject, name the specific thing, vary sentence rhythm, no em dashes, no emoji on
product surfaces. Score a draft against the rubric in
[`stop-slop/SKILL.md`](stop-slop/SKILL.md); below 35/50, revise.
```

- [ ] **Step 4: Commit**

```bash
git add docs/style/stop-slop docs/style/README.md
git commit -m "docs(style): vendor stop-slop as the RepoLens writing standard"
```

## Task D2: Re-voice `onboarding-copy.js` (warm-human, test stays green)

Rewrite every `COPY` string toward warm, casual, human — like texting a friend — while satisfying every assertion in `tests/onboarding-copy.test.js`: no banned vocab (32 terms), no em dash, ≤ 1 `!` across the whole object, every line non-empty and ≤ 140 chars, and (per spec §7) no emoji. The banned list includes `"that's it"` and `"you're all set"`, so avoid those exact phrases.

**Files:**
- Modify: `onboarding-copy.js` (the `COPY` object, lines 4-19)
- Test: `tests/onboarding-copy.test.js` (must stay green; unchanged)

- [ ] **Step 1: Replace the `COPY` object**

In `onboarding-copy.js`, replace the whole `COPY` export (lines 1-19, including the header comment) with:

```javascript
// onboarding-copy.js
// Vee's narration, in one place. Warm and human, like texting a friend: name the
// thing, say what it does for you, keep it short. No jargon, no em dashes, no emoji,
// at most one exclamation across the whole deck (see tests/onboarding-copy.test.js).
export const COPY = {
  introGreet: "Hey, I'm Vee. I read the source so you don't have to. Got two minutes?",
  introCard: 'Every repo you scan lands here, with its fit score, its health, and your notes.',
  introCorkboard: 'Same library, as a board. A line between two repos means they go together.',
  introSearch: 'Find a repo by name, or just ask your library a question in plain words.',
  introOpen: 'Click a card and I open the full read on that repo.',
  verdict: "The honest call on whether to use it, before the README starts selling.",
  blueprint: "How it's built, as a map you can drag around. Hit the tour button to walk it.",
  farewell: 'You know your way around now. Everything stays in your browser, nothing phones home.',
  milestoneOffer: "{N} scans in. You've got plenty to compare and connect now. Want me to show you how?",
  milestoneAsk: "Ask a question across everything you've scanned, in plain words.",
  milestoneCorkboard: 'Run Alternatives or Synergies and I draw the lines between your repos.',
  milestoneCompare: 'Pick a few repos, then line them up side by side or wire them into a stack.',
  milestoneOrganize: 'Library getting big? Try the radar view, auto-organize, and collections.',
  milestoneDiscover: "Want more? I find fresh repos from the ones you've already adopted.",
};
```

> Why these pass: no banned term appears (checked against the 32-item list, including `"that's it"`/`"you're all set"` which are now absent); no `—`; exactly zero `!` (under the ≤1 cap); no emoji; the longest line (`milestoneOffer`, with `{N}` literal) is 91 chars, well under 140.

- [ ] **Step 2: Run the onboarding-copy test**

Run: `npx vitest run tests/onboarding-copy.test.js`
Expected: PASS (4 specs: banned vocab, no em dash, ≤1 `!`, length/non-empty).

- [ ] **Step 3: Syntax + lint**

Run: `node --check onboarding-copy.js && npx eslint onboarding-copy.js`
Expected: clean.

- [ ] **Step 4: Verify live (the tour reads naturally)**

Open `onboarding-demo.html` in Chrome, click "Intro tour" and "Milestone tour", and read each coachmark. Expected: the copy sounds like a person, fits the spotlight bubbles without overflow, and the `{N}` in the milestone offer renders as `7` (the demo substitutes it).

- [ ] **Step 5: Commit**

```bash
git add onboarding-copy.js
git commit -m "refactor(brand): re-voice Vee's onboarding copy to warm-human"
```

## Task D3: De-slop the README intro + Vee lines, and add a CHANGELOG entry

Rewrite the README intro paragraph and the two Vee mentions in the new voice, then add an `[Unreleased]` CHANGELOG entry for the brand work. For the rest of the README/CHANGELOG, run a stop-slop pass against the vendored rules rather than rewriting every line, and finish with one human read.

**Files:**
- Modify: `README.md` (intro paragraph lines 20-22; Vee mentions ~line 44 and ~line 64)
- Modify: `CHANGELOG.md` (`[Unreleased]` → `### Added`, after line 16)

- [ ] **Step 1: Rewrite the README intro paragraph + pull-quote**

In `README.md`, replace the intro (lines 20-22):

```markdown
RepoLens is a **Manifest V3 Chrome extension**. Land on a GitHub, GitLab, npm, or PyPI page, click the toolbar icon, and it reads the repo, runs it past the AI provider of your choice, and opens a tab with a **verdict-first** breakdown — it opens with a straight answer (*should you use this?*) before any prose, not the README's marketing.

> Stars tell you a project is popular. They don't tell you whether it fits *your* problem. RepoLens answers the question you actually have: **should I use this, and what am I signing up for?**
```

with (no em dash; active voice; tighter):

```markdown
RepoLens is a **Manifest V3 Chrome extension**. Open a GitHub, GitLab, npm, or PyPI page and click the toolbar icon. RepoLens reads the repo, runs it past the AI provider you picked, and opens a tab that leads with a straight answer: should you use this? You see the verdict before any of the README's pitch.

> Stars tell you a project is popular. They don't tell you whether it fits your problem. RepoLens answers the question you actually have: should I use this, and what am I signing up for?
```

- [ ] **Step 2: Rewrite the "First run" Vee line**

In `README.md`, replace the "First run" paragraph (line 44):

```markdown
**First run:** Vee walks new users through a seeded demo repo (Library → Verdict → Blueprint) via a coachmark tour. After roughly five real scans a second "power tour" introduces the cross-library tools: Ask, Corkboard analysis, multi-select compare, Radar, and Discover.
```

with:

```markdown
**First run:** Vee, the lens mascot, walks you through a seeded demo repo (Library, then Verdict, then Blueprint) with a short coachmark tour. After about five real scans, a second power tour shows you the cross-library tools: Ask, Corkboard, multi-select compare, Radar, and Discover.
```

- [ ] **Step 3: Rewrite the changelog-style Vee bullet in the README**

In `README.md`, replace the v1.7.0 Vee bullet (line 64):

```markdown
- 🔭 **Meet "Vee", an optional lens mascot** that reacts to your scans (scanning, wide-open on a strong fit, eyes-narrowed on a risky one, resting on an empty library). One theme-aware SVG, reduced-motion-safe; turn it off in **Options → Interface**.
```

with (drop the emoji; this is a historical entry, so keep the version label, just de-slop the prose):

```markdown
- **Meet Vee, an optional lens mascot** that reacts to your scans: scanning, wide-open on a strong fit, narrowed on a risky one, resting on an empty library. One theme-aware SVG, reduced-motion safe. Turn it off in **Options → Interface**.
```

- [ ] **Step 4: Add the brand CHANGELOG entry**

In `CHANGELOG.md`, the `[Unreleased] → ### Added` section starts at line 12. Add these bullets at the top of that `### Added` list (right after line 12 `### Added`, before the existing "Vee-guided first-run walkthrough" bullet):

```markdown
- **Mono Ink identity.** RepoLens ships a new dark-tile lens icon, a "Mono Ink" default theme (cool near-black, white, and cobalt), and a wordmark lockup. The toolbar icon now animates only while a scan runs: the aperture grows and spins and the ring breathes grey to blue, then it resets to static. Turn the animation off in **Options**, and it honors your OS reduced-motion setting. The other 13 themes stay one click away.
- **A warmer Vee.** Vee's onboarding copy reads like a person now, not a manual. The repo also vendors the stop-slop writing standard under `docs/style/` so the voice stays consistent.
```

- [ ] **Step 5: Stop-slop pass over the rest of README + CHANGELOG**

Read `README.md` and `CHANGELOG.md` against `docs/style/stop-slop/references/phrases.md` and `structures.md`. Targeted fixes only:
- Remove any em dash you find (replace with a comma or period). Grep to find them: `grep -n "—" README.md CHANGELOG.md`.
- Replace any banned business-jargon term (e.g. "deep dive" as a verb, "navigate challenges") with plain language where it appears in prose (not in proper nouns like the "Deep Dive" feature/tab name, which stays).
- Do not rewrite feature tables or bullet labels wholesale; this is a slop pass, not a rewrite.

Run: `grep -n "—" README.md CHANGELOG.md`
Expected after fixes: no matches (exit 1 / empty output) for prose em dashes. (If a code block legitimately needs one, leave it and note why.)

- [ ] **Step 6: Final human read**

Read the README intro and the new CHANGELOG bullets aloud once. Confirm they sound like a person and score ≥ 35/50 on the stop-slop rubric (Directness / Rhythm / Trust / Authenticity / Density). Adjust any sentence that sounds like a template.

- [ ] **Step 7: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs(brand): de-slop README intro + Vee lines, add Mono Ink changelog entry"
```

## Task D4: Phase-D verification gate

**Files:** none (verification only)

- [ ] **Step 1: Full suite + lint**

Run: `npx vitest run && npx eslint .`
Expected: all tests pass (including `onboarding-copy`, `theme`, `icon-draw`, `icon-anim`, `settings-backup`); eslint 0 errors.

- [ ] **Step 2: No stray em dashes / emoji on product copy**

Run: `grep -nP "[\x{2014}]" onboarding-copy.js README.md CHANGELOG.md docs/style/README.md`
Expected: no matches in prose (exit 1). (The vendored `docs/style/stop-slop/**` files keep their original content and are exempt.)

---

# Final whole-project verification

- [ ] **Step 1: Full suite + lint + manifest parse**

Run:

```bash
cd /Users/clubpenguin/Documents/clubP/repolens
npx vitest run && npx eslint . && node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
```

Expected: all tests pass; eslint 0 errors; `manifest ok`.

- [ ] **Step 2: Load unpacked, end-to-end smoke**

Load the unpacked extension in a fresh profile. Confirm: Mono Ink is the default theme; the dark-tile icon shows in the toolbar; a scan animates the icon and resets after; the in-app loading spinner is cobalt; Options shows both the "Animate the toolbar icon" toggle (on) and the theme picker with "Mono Ink" first; the onboarding tour reads warmly.

- [ ] **Step 3: Branch wrap-up**

When all phases are committed and green, use the `superpowers:finishing-a-development-branch` skill to decide between merge / PR / cleanup.

---

## Spec coverage map

| Spec section | Task(s) |
|---|---|
| §1 Name & positioning / tagline | C2 (manifest + README), D3 (intro) |
| §2 Palette "Mono Ink" | B1 (theme tokens), A1 (`ICON_COLORS`), C1 (wordmark colors) |
| §3 Icon & mark (dark tile, single lens, all sizes, one source) | A1, A2, A3 |
| §3 Lockup (icon + Space Grotesk wordmark) | C1 |
| §4 Icon animation (grow → spin, ring breathe, no sweep, OffscreenCanvas + setIcon, reset on finish/error) | A4, A5 |
| §4 `animateIcon` setting + reduced-motion flag | A6 |
| §5 Vee Hero/Mark, glyph recolor + scanning reuse | B3 (glyph recolor verify + tweak), A4/A5 (scan anim), C1 (mark in lockup) |
| §6 Mono Ink default theme, 13 preserved | B1, B2, B4, B5 |
| §7 Voice & stop-slop, no emoji, plain-friendly | D1 (vendor), D2 (onboarding), D3 (README/CHANGELOG) |
| §8 Scope (extension only; website/packaging out) | Respected — no website/store/LICENSE tasks |
| §9 Deliverables 1-7 | 1→A3, 2→A4/A5/A6, 3→B1/B2, 4→B3, 5→C1, 6→C2, 7→D1/D2/D3 |
| §10 Verification (icon legibility, anim live, theme default+AA, voice test, regression) | A3 S5, A5 S9, B5, D2 S2 + D3 S6, Final S1-2 |
```
