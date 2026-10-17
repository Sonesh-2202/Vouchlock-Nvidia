# ProjectPilot Design Audit — Initial State

**Audit Date:** 11 October 2026  
**Auditor:** Senior Product Designer & Senior Frontend Engineer  
**Methodology:** Comprehensive visual inspection across Desktop (1440px), Tablet (768px), and Mobile (375px) viewports with recorded browser interaction sessions.

---

## 1. Executive Summary: The "Vibe-Coded" Baseline

ProjectPilot's initial UI exhibits the classic hallmarks of AI-generated web interfaces ("vibe-coded slop"):
- **Generic Dark Aesthetic:** Pure blue-black background (`#0A0B11`) with vibrant coral-to-violet linear gradients on primary buttons, tabs, and headers.
- **Card-Wall Architecture:** Nearly every visual element is the exact same dark rounded rectangle with uniform padding and generic hairline borders. No sense of editorial hierarchy or ledger structure.
- **Narrow-Column Trapping:** Layouts are squeezed into an arbitrary centered container (`max-width: 1200px`), leaving vast expanses of dead space on wide desktop displays, while lacking a considered navigation shell (no left rail, no global search).
- **Broken Kanban Composition:** The task board wraps columns into irregular rows instead of presenting a true 5-column horizontal board.
- **Invisible Core Value Proposition:** The signature feature—**proof of delivery and traceability chain**—is rendered as another generic list of cards rather than an authoritative ledger of verifiable claims and signed receipts.

---

## 2. Concrete "AI Tells" by Screen

### 2.1 Sign In (`/login`)
- **Centered Floating Box:** Squeezed into an unanchored centered box with huge dead margins.
- **Gradient Primary Button:** `linear-gradient(135deg, var(--color-accent), #a855f7)` on sign-in and register buttons.
- **Unnatural Copy:** "Try Interactive Demo (Instant Preview)" instead of quiet, professional copy ("Explore with demo data").
- **Mobile Regression (375px):** Card margins touch viewport boundaries without safe gutters.
- **Missing Brand Substance:** No statement of purpose, no live product excerpt, and missing Terms of Service and Privacy Policy links.

### 2.2 Organization Dashboard (`/` & `/workspaces/:id`)
- **Card Walls:** Projects and members are displayed as two stacks of uniform dark cards with no summary briefing metrics.
- **Unsystematic Badge Palette:** Bright competing pill badges (green, yellow, purple, blue) without cohesive semantic hierarchy.
- **Header Action Collision:** Mobile (375px) causes header action buttons to wrap awkwardly without touch target ergonomics.
- **Absence of Shell:** Lacks an organization switcher, navigation rail, and deep-linkable drawer for creating projects or inviting team members.

### 2.3 Project Workbench (`/projects/:id`)
- **Header Actions:** Generic buttons without custom icons; lack of a persistent one-line delivery truth readout ("5 of 8 requirements verified, 1 task blocked").
- **Kanban Board:** Columns wrap into a disjointed 3+2 vertical grid rather than an intentional 5-column horizontal board with drag-and-drop feedback and accessible keyboard moves.
- **AI Summary Callout:** Uses an emoji glyph (`📊`) and generic card framing instead of an authoritative, collapsible ledger margin note.
- **Requirements & Traceability Tab:** Rendered as standard card blocks rather than an expandable **ledger row** visibly revealing the full chain: `Requirement -> Tasks -> Proof Evidence -> Stamped Verification`.
- **Truthful Delivery Report Tab:** Lacks document typography, optical hierarchy, missing proof gap callouts, and print stylesheet (`@media print`).

---

## 3. Heuristic & Impeccable Critique Findings

| Category | Finding | Remedy in Redesign |
| :--- | :--- | :--- |
| **Typography** | Generic system font sans-serif stack (`Inter`), low-contrast 11-12px micro-labels. | **Newsreader** (characterful serif) for display headings & statistics; **Instrument Sans** for clean UI text; **JetBrains Mono** for IDs, dates, metrics. |
| **Color & Theme** | Default dark gradient only; no light theme; neon purple accents. | **Ledger palette**: `--paper` (#F5F2EB), `--surface` (#FBF9F4), `--ink` (#1B1A17), `--rule` (#DDD7CA), `--proof` (#0F5C4D forest green). Light theme default; warm dark theme. |
| **Layout & Shell** | Centered single-column layout without navigation rail or command palette. | Persistent 240px collapsible Left Rail, top breadcrumb bar, command palette (`Cmd/Ctrl+K`), right-side 480px sliding drawer. |
| **Data Integrity** | Inconsistent demo seed data with mock junk strings. | Domain-accurate projects (Campus Mobile App MVP, Autonomous Fleet Telemetry, Patient Portal SOC2) with realistic requirements and evidence artifacts. |
| **Accessibility** | Color-only status indicators, no visible `:focus-visible` rings, no keyboard kanban moves. | WCAG 2.1 AA compliant contrast (≥4.5:1), custom focus rings, keyboard moves with live-region announcements. |
