# RepoLens site — "look nice" pass

**Date:** 2026-06-14
**Status:** Approved, in build
**Goal:** Elevate the v3.0 site from "clean" to "designed" — new mascot-tied palette, a GSAP motion layer, a morphing theme toggle, depth/atmosphere, and a display typeface.

## 1. Palette → Inspector (blue + amber)

Tie the brand to the new mascot (blue inspector, orange-rimmed lens). Complementary
colors don't gradient cleanly, so:

- **Blue→cyan stays the gradient** (headline, health number, glows): `--accent #3b82f6`,
  `--accent-2 #2563eb`, `--accent-3 #38bdf8`; `--grad` blue→cyan.
- **Amber is the signature spot color**: new `--warm #f59e0b` / `--warm-2 #fb923c`. Used
  sparingly and intentionally — the **primary CTA becomes amber** (pops against blue/dark),
  plus the Vee lens rim, key highlights, the verdict active-tab underline.
- Midnight bg warms to blue-black `#0a0e1a`; latte keeps cream.
- All in `global.css` tokens → cascades to marketing + docs (fd vars updated).
- Default named palette renamed `aurora`→`inspector` (blue+amber); terminal/nord/claude
  stay as alternate accents. Update `PaletteSwatches` + the anti-FOUC script.

## 2. Motion layer (GSAP + ScrollTrigger)

- `npm i gsap` (ScrollTrigger is free in GSAP 3.13+). **Dynamically imported** off the
  critical path inside one client component, `SiteMotion`, mounted on the home page.
- `gsap.matchMedia('(prefers-reduced-motion: no-preference)')` gates ALL motion.
- **Hero entrance** — stagger `.kicker → .hero-mascot → .hero-title → .hero-sub → .hero-cta`.
- **Scroll reveal** — ScrollTrigger batch on `.reveal` sections (fade-up); replaces the CSS
  reveal. **Bento** `.feat` tiles stagger in.
- **Delights** — verdict health number counts up to 88; fit chip pops.
- Safety: use `gsap.from` (no CSS pre-hide), so if JS fails, content is visible. Remove the
  CSS `.reveal` keyframe animation (GSAP owns reveal now); `.reveal` becomes a marker class.

## 3. Morphing theme toggle

Rebuild `ThemeToggle` as a single SVG that **morphs sun⇄moon** (rays retract, a mask circle
slides to carve the crescent) via CSS transitions driven by the resolved theme — no icon swap.
Reduced-motion: instant state, no tween.

## 4. Depth & atmosphere

- Subtle **grain overlay** (inline SVG `feTurbulence`, ~3–5% opacity, fixed) on `.site-root`.
- Refined multi-layer shadows + slightly stronger surface separation on cards/stage.

## 5. Typography

- `next/font/google` **Space Grotesk** (self-hosted at build, works with `output: export`),
  exposed as `--font-display`, weights 500–700.
- Applied to display headings only (`hero-title`, `section-title`, `final-cta-title`, stat
  numbers); body stays the system stack.

## Constraints / verification

- ESLint now runs during build — new components must pass (hooks deps, a11y).
- Static export must stay green; both themes screenshotted; reduced-motion verified.
- Keep landing JS within budget (GSAP dynamic-imported; not in the initial critical bundle).
- Build on a branch; ship as a PR.
