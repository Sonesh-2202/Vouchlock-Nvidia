# ProjectPilot — Design System & Visual Specification (V2: Paper on the Desk)

**Design Concept:**

> _"The Desk and the Paper: The application shell is the desk—a calm, deep warm graphite environment crafted for long, focused working sessions. Everything that represents an auditable document of record is paper—warm off-white, bound by crisp hairline rules and soft contact shadows, marked with indelible ink, and sealed with human verification stamps."_

---

## 1. Color System (The Desk vs. The Paper)

ProjectPilot V2 resolves the contrast between high-density operational work and authoritative delivery artifacts through two coordinated surfaces:

| Token           | Dark (The Desk)                                    | Light Theme | Semantic Role                                                              |
| :-------------- | :------------------------------------------------- | :---------- | :------------------------------------------------------------------------- |
| `--desk`        | `#14130F`                                          | `#EFEBE2`   | App canvas & background; quiet, low-contrast desk workspace.               |
| `--desk-raised` | `#1C1A16`                                          | `#F7F4EC`   | Left rail, secondary side panels, modal backdrops.                         |
| `--paper`       | `#F3EFE4`                                          | `#FBF9F3`   | Document of record canvas (Source Brief, Truthful Delivery Report, slips). |
| `--ink`         | `#ECE7DB` on desk / `#1B1A17` on paper             | `#1B1A17`   | High-contrast primary text, display numerals, ledger rows.                 |
| `--ink-muted`   | `#A39D90` on desk / `#6B675E` on paper             | `#6B675E`   | Secondary metadata, dates, monospace IDs, marginalia.                      |
| `--rule`        | `#2E2B25` on desk / `#D8D1C1` on paper             | `#D8D1C1`   | Crisp 1px hairlines, table borders, dashed gap markers.                    |
| `--proof`       | `#6FCF97` (`#7BD389`) on desk / `#17694F` on paper | `#17694F`   | Verified state mark, signature ink, primary actions, focus rings.          |
| `--stamp`       | `#E2674B`                                          | `#B3412B`   | Blocked status, destructive actions, stamp seal ink.                       |
| `--ochre`       | `#D9A441`                                          | `#B7791F`   | In-progress tasks and pending requirement reviews only.                    |

### Document-of-Record Paper Rules (`.paper-sheet`)

When rendering documents of record (Truthful Delivery Report, Source Brief, Evidence slips, Verification records, Terms, Privacy):

- The surface switches to `--paper` with scoped `--ink: var(--paper-ink)` and `--rule: var(--paper-rule)`.
- It carries a 1px solid rule and a soft, low-opacity contact shadow (`0 2px 8px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.08)`).
- On the landing page hero and marketing presentation, paper sheets rest at slight physical offsets (0.3° to 0.6° off-axis).
- Proven items feature solid rules and dark ink; unproven items reveal dashed gap slots with small "Add evidence" affordances.

### Contrast & Legibility Standards

- Desk text satisfies WCAG AA (≥ 4.5:1).
- Paper text achieves high contrast (≥ 11.5:1 on `#1B1A17` over `#F3EFE4`).
- Status is never color-alone: a proof mark, stamp seal, or explicit label is always present.
- Outlined neon/colored boxes are strictly prohibited. Status relies on fill steps, hairline rules, and typographic marks.

---

## 2. Typography, Fluid Scale & Hierarchy

Root font-size scales dynamically with viewport width to guarantee effortless readability across all displays from compact laptops to 2560px monitors:

```css
html {
  font-size: clamp(15px, 0.35vw + 13.5px, 18px);
}
```

### Typeface Roles

1. **Serif Display:** `Newsreader` (optical sizing enabled).
   - Used for the hero statement, page titles, report headline, and large display numerals.
   - Characterized by editorial authority, tight display tracking, and true italics reserved for single key emphasis words.
2. **Interface Sans:** `Instrument Sans`.
   - Used for UI actions, table headers, forms, navigation labels, and body reading text.
3. **Monospace Data:** `JetBrains Mono` / `Geist Mono` (tabular numerals enabled).
   - Used for requirement identifiers (`REQ-001`), hash digests, dates, and quantitative counters.

### Type Scale (Fluid REM)

- `meta / caption`: `0.8125rem` (never below 12px effective).
- `table / UI`: `0.9375rem`.
- `body`: `1.0rem` (15–17px effective across desktop screens).
- `lead / subline`: `1.125rem`.
- `section title`: `1.5rem`.
- `page title`: `2.25rem`.
- `display numerals`: `3.5rem` to `5.0rem`.
- `hero headline`: `clamp(2.75rem, 5vw + 1rem, 5.5rem)`.

---

## 3. Motion System & Smooth Scroll (GSAP + Lenis)

ProjectPilot V2 employs a bespoke motion engine engineered to eliminate template-like uniform fade-ups in favor of narrative physical interaction:

### Architecture

- **Smooth Scroll:** Lenis handles document scrolling across public marketing, report documents, briefs, and policy pages (`lerp: 0.1`, `smoothWheel: true`).
- **Inner Scroller Isolation:** Inner overflow containers (Kanban columns, ledger tables, command palette, drawers) carry `data-lenis-prevent`. Lenis is paused while modals/drawers are open.
- **Choreography Clock:** GSAP ticker synchronizes Lenis RAF updates to guarantee zero jank and zero scroll lag.
- **Session-Aware Entrances:** Data screens run entrance choreography on **first view only** per session (`sessionStorage`); repeat visits within the same session render immediately.
- **Reduced Motion:** Full branch via `prefers-reduced-motion: reduce` and `gsap.matchMedia()`. All translational movement is removed; states resolve instantly.

### Signature Moments

1. **Verification Stamp:** Notched square seal drops with elastic settle (`scale 1.25 -> 1`, `-2°` tilt), expanding ink ring, and slot-style digit roll.
2. **Traceability Chain Draw:** Ledger expansion reveals vertical SVG connector line (`stroke-dashoffset`) linking Requirement -> Tasks -> Evidence -> Verification.
3. **Counting Numerals:** KPI numbers count up smoothly once on first view (`700ms–900ms` ease-out).
4. **Shared Tab Indicator:** Sliding bottom rule bridges active tabs.
5. **Kanban Physics:** Dragging lifts card (`scale 1.02`, soft shadow, `1°` tilt); neighbors reflow via Flip; drop settles with a gentle spring.
6. **Delivery Report Assembly:** Paper sheet rises into place; verdict reveals; signature block physically signs itself with an SVG stroke path.

---

## 4. Layout Architecture & Screen Real Estate

- **App Shell:** Collapsible left rail (248px expanded, 64px collapsed, persisted in storage); top bar with breadcrumbs, command trigger, theme toggle, and user monogram.
- **Dashboard Briefing:** Opens with a giant headline (_"3 of 9 requirements proven. 1 blocked."_), followed by a 4-column metric strip, a wide project register, and a prose-like "Needs Attention" list.
- **Master-Detail Project Workbench (>= 1280px):**
  - Left pane (42%): Ledger table of requirements/tasks with filter toolbar.
  - Right pane (58%): Sticky paper detail sheet displaying the selected item's end-to-end traceability chain.
- **Source Brief:** 68ch reading column on paper canvas with margin rail for revision marginalia.
- **Print Stylesheet:** Comprehensive `@media print` rules stripping UI chrome, eliminating animations, and producing clean paginated delivery certificates.

---

## 5. Prohibitions & Anti-Slop Rules

- **No Gradients:** No linear or radial color gradients anywhere.
- **No Glows or Neon AI Backdrops:** No purple glows, aurora blurs, or mint outlines.
- **No Emojis:** All communication uses precise custom SVG marks.
- **No Default Lucide Icons:** Custom stroke-aligned SVG icon suite on a 20px grid.
- **No Uniform Fades:** Every section reveal is tailored to its content (rules extending, paper sliding, lines drawing).
- **No Fake Metrics or Testimonials:** Authentic data flows and traceable delivery only.
