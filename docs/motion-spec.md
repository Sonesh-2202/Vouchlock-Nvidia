# ProjectPilot V2 — Motion Specification

This document details the complete motion and interaction choreography for ProjectPilot V2, adhering to the "Paper on the Desk" design ethos, the Emil Kowalski animation vocabulary, and the GSAP/Lenis performance guidelines.

---

## 1. Engine & Architectural Foundations

- **Choreography Engine:** GSAP (core + ScrollTrigger + Flip) integrated via scoped context and unified RAF ticker.
- **Smooth Scroll Engine:** Lenis (`lerp: 0.1`, `smoothWheel: true`, `syncTouch: false`).
- **Unified Clock:**
  ```ts
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  ```
- **Inner Scroller Isolation:** All modal drawers, dialogs, command palettes, kanban boards, and overflow tables carry `data-lenis-prevent` and `overscroll-behavior: contain`. Modal opening executes `pauseSmoothScroll()` (`lenis.stop()`); modal closing executes `resumeSmoothScroll()` (`lenis.start()`).
- **Session-Aware Entrances:** Data screens run entrance choreography on **first view only** per session (`sessionStorage.getItem('pp_entered_view_*')`). Repeat navigation within the same session renders immediately without delay.
- **Accessibility:** `@media (prefers-reduced-motion: reduce)` and `gsap.matchMedia('(prefers-reduced-motion: reduce)')` disable all positional translation, pinning, scrubbing, and digit rolls, falling back to clean instant transitions or brief opacity changes.

---

## 2. Motion Tokens

| Token | CSS Variable | Value | Usage |
|---|---|---|---|
| **Instant** | `--t-instant` | `90ms` | Button active press scale, toggle switches |
| **Fast** | `--t-fast` | `150ms` | Hover states, tab indicator slide, focus rings |
| **Base** | `--t-base` | `220ms` | Drawer reveal, modal scale, ledger row expand |
| **Slow** | `--t-slow` | `320ms` | Verification stamp drop & settle, kanban card settle |
| **Hero Orchestration**| `--t-hero` | `700ms – 1100ms` | Landing page hero line reveal, report sheet entrance |
| **Ease Out (Default)**| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entrances, drawers, menus, dialogs |
| **Ease Out Quart** | `--ease-out-quart`| `cubic-bezier(0.25, 1, 0.5, 1)` | Numeric counters, long scroll-linked reveals |
| **Ease In Out** | `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)`| Shared element moves, cross-layout slides |
| **Spring Settle** | `--spring-settle`| `elastic.out(1, 0.6)` / spring | Stamp landing, kanban card release |

---

## 3. Signature Animations Registry

| # | Animation | Trigger | Target Element(s) | Duration & Easing | Purpose | Reduced-Motion Behavior |
|---|---|---|---|---|---|---|
| **1** | **Verification Stamp** | Requirement marked verified | Verifier paper slip + notched stamp seal + ink ring + state badge | `320ms`<br>`elastic.out(1.1, 0.5)` | Tactile confirmation of audit commitment; gives physical weight to human verification | Instant badge swap + `150ms` opacity fade; no scale or ring expansion |
| **2** | **Traceability Chain Draw** | Expanding requirement ledger row | Row height (`0fr -> 1fr`) + SVG vertical line (`stroke-dashoffset`) + 4 node pills | Row: `220ms` ease-out<br>Line: `400ms`<br>Nodes: `60ms` stagger | Reveals causal link from Brief -> Requirement -> Tasks -> Evidence -> Verification | Instant height expand; static solid/dashed connector lines without stroke animation |
| **3** | **Numbers That Count** | First in view on Dashboard & Report | KPI display figures (`.kpi-number`, `.briefing-stat`) | `800ms`<br>`--ease-out-quart` | Celebrates milestone completion and emphasizes quantitative delivery metrics | Displays final formatted integer immediately without counting |
| **4** | **Shared Tab Indicator** | User clicks tab in Project Workbench | Tab indicator pill (`layoutId`-style sliding bar) | `180ms`<br>`--ease-out` | Guides eye smoothly across active contextual views (Brief, Requirements, Tasks, Report) | Instant position switch on active tab |
| **5** | **Kanban Physics** | Card drag / "Move to" menu action | Task card container + drop target column | Drag: `scale 1.02, tilt 1deg`<br>Drop: `200ms` settle | Conveys tactile spatial placement of execution tasks; prevents jarring snaps | Instant column relocation without scale or rotation |
| **6** | **Drawer & Dialog Reveal** | Clicking task row / Cmd+K | Drawer slide + scrim backdrop + palette scale (`0.97 -> 1`) | Open: `220ms` ease-out<br>Close: `160ms` ease-in | Focuses attention on isolated editing without disorienting workspace context | `100ms` opacity fade only; no spatial slide or scale |
| **7** | **Sticky Condensing Header**| Scrolling Project Workbench past 48px | Serif project title + goal text + tab container | Transform/opacity only via scroll threshold | Reclaims vertical screen estate for dense ledger examination on long pages | Title shrinks immediately without interpolated scale transition |
| **8** | **Delivery Report Assembly**| Opening Report tab / scrolling report | Paper sheet (`.paper-sheet`) + ledger rows + SVG signature | Sheet: `400ms`<br>Rows: `40ms` stagger<br>Sig: `600ms` draw | Makes Truthful Delivery Report feel like a formal, authoritative document of record | Paper sheet renders static; signature appears pre-signed |
| **9** | **Landing Page Pinned Stage**| Scroll through "How a claim becomes proof" | 4-step stage: Requirement -> Task -> Evidence -> Verified | Pinned desktop scrub (`1.5x` viewport height) | Demonstrates core product philosophy in an interactive editorial sequence | Stacked vertical steps without pinning or scrub locks |
| **10**| **Micro-Interactions** | Button click, link hover, form focus | Buttons (`scale 0.97`), link underlines (width `0 -> 100%`) | `90ms – 150ms`<br>`--ease-out` | Delivers responsive physical feedback to user intent across every control | Instant hover color swap; no scale translation |

---

## 4. Verification Stamp Motion Curve Details

The signature moment of ProjectPilot is the **Verification Stamp**. It transforms an unverified claim into an immutable record of delivery.

1. **Phase 1: Verifier Slip Insertion (0ms – 120ms):**
   - The paper slip enters with `y: -6px -> 0px` and `opacity: 0 -> 1`.
2. **Phase 2: Stamp Mark Impact (100ms – 320ms):**
   - Stamp icon scales `1.28 -> 1.0` with a `-2.4deg` rotation settle (`cubic-bezier(0.2, 1.4, 0.4, 1)`).
3. **Phase 3: Ink Echo Expansion (200ms – 450ms):**
   - A delicate concentric ring (`border: 1px solid var(--proof)`) expands `scale(1) -> scale(1.6)` with `opacity: 0.6 -> 0`.
4. **Phase 4: Digit Roll (250ms – 600ms):**
   - The project counter (*"4 of 9 requirements proven"*) rolls to the next integer.

---

## 5. Performance Budget & Verification Standards

- **Layout Shifts (CLS):** `0.00`. Zero geometric width/height animations; all expands use CSS Grid `0fr -> 1fr` or GSAP Flip transforms.
- **Frame Rate:** 60fps locked on 4x CPU throttling in Chrome DevTools.
- **GPU Acceleration:** Only `transform`, `opacity`, and SVG `stroke-dashoffset` / `clip-path` are animated.
- **Teardown & Cleanup:** All GSAP timelines and ScrollTriggers are bound to React lifecycles via `useGSAP` or explicit `ctx.revert()` calls. Zero memory leaks on unmount.
