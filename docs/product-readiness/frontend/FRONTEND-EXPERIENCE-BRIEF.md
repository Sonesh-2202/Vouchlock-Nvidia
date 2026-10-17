# ProjectPilot frontend experience and build brief

**Audience:** AI design/frontend implementation agent  
**Product:** ProjectPilot  
**Repo:** `ProjectPilot/`  
**Audit snapshot:** 11 October 2026 at revision `f31bd56`.
**Read first:** `ProjectPilot-Brief/01-product-brief.md`, `ProjectPilot-Brief/13-ProjectPilot_Master_Anti_Vibecoding_Development_Prompt.md`, `ProjectPilot-Brief/Anti AI Looking Web Prompt.txt`, and `docs/product-readiness/01-implementation-status.md`.

## Assignment

Design and implement a distinctive, modern, polished Vouchlock web interface that helps a person move from a project brief to an agreed plan and visible delivery evidence. Work in the existing web app and existing design direction constraints. This is a frontend workstream: inspect the real React routes, API client, contracts, and current behavior before changing anything. Do not rewrite the backend, database, or architecture as part of this assignment.

The app already has login, workspace/project/task pages, board/list views, task creation/status changes, plan draft review/accept, progress summary, comments, and JSON export. The recent traceability slice also added real API/schema support and a project UI for manual requirements, task links, URL/note evidence, explicit verification, and a record-based delivery report. Do not build a duplicate of those features. Verify the existing behaviors and refine them. The remaining product seams are the full source-brief record/version flow, AI proposal extraction/review, stronger live-DB/API E2E proof, and final UI/accessibility polish. Do not imply the AI provider works: current API configuration still falls back to deterministic mock output.

## User and product outcome

Primary first users are student teams and small business teams of 2–10; also support solo work. Their job is: “Given a real brief and deadline, help us agree what must be delivered, divide the work, and know what still needs proof.”

ProjectPilot should feel like a focused workbench for turning uncertainty into traceable execution. It is not a generic kanban tool, AI chat wrapper, marketing landing page, or enterprise admin console.

## Design character

Create a calm, editorial, precise interface with a little warmth and a distinct point of view. Use a restrained chalk/paper background, dark ink text, quiet stone dividers, and one deliberate accent such as deep forest/teal or oxidized copper. Keep status colors semantic and sparse. Aim for 3–5 core colors. Use a readable modern sans for UI and, if it strengthens the identity, one characterful serif for a few large editorial headings only. Define CSS tokens and a consistent 8px spacing scale; use modest radii and fine borders instead of nested cards and heavy shadows.

The product should feel fast and grounded: strong hierarchy, useful density, aligned tables/lists, short transitions, clear focus rings, compact contextual metadata, and legible status labels. The visual language should come from the source-to-delivery workflow: source references, requirement rows, ownership, evidence links, and unresolved items should be visually easy to scan.

## Anti-vibecoding rules

Follow both anti-vibe reference documents. Do not introduce:

- Purple/black neon startup themes, rainbow accents, giant gradients, glow orbs, blurred mesh backgrounds, dot grids, or liquid glass panels.
- Repeated bento boxes, repetitive three-card feature rows, identical cards nested in cards, generic AI landing page sections, fake dashboard metrics, or decorative charts.
- Sparkles or emojis as interface icons, random Lucide-in-a-pastel-box decoration, floating arrows, fake terminal panels, fake logos/testimonials, fabricated activity, or unsupported productivity/AI claims.
- Placeholder buttons, dead links, controls that only toggle local state while implying persisted success, or fake loading delays.

Use one consistent icon approach (existing icons if already installed, otherwise restrained inline SVGs/CSS). Every interactive element must have a real outcome and accessible name. Avoid decorative motion; respect `prefers-reduced-motion`.

## Information architecture

Use a stable application shell that makes the next action and current project obvious:

- **Primary navigation:** Home/workspaces, recent projects, and account/workspace controls. Keep navigation compact on wide screens and use a deliberate mobile drawer or bottom navigation where it improves access.
- **Workspace home:** workspace identity, recent/active projects, simple project creation, and useful empty state. Avoid ungrounded KPI tiles or invented activity.
- **Project workbench:** project identity and brief summary at top; clear sections for Overview, Requirements, Work, Activity, and Delivery. The last three future sections can be enabled only when real data contracts exist; otherwise provide no deceptive fake interaction.
- **Task work:** board and list views with status, task title, owner, due date, priority, and useful filters where fields are actually supported. Task details should make comments and history discoverable.
- **AI plan review:** show the draft as a proposal, distinguish assumptions/risks from saved facts, allow edits supported by current contracts, and require explicit acceptance. Make errors and retry understandable.
- **Account/workspace administration:** membership, role, invite, export, and destructive actions should be clear, scoped, and confirmed appropriately.

## Signature screen concept

Make the project workbench the visual center of the product. On desktop, use a narrow navigation rail/sidebar, a generous main work area, and an optional right context column for the project goal, deadline, blockers, or review notes. Keep the main column dominant. Do not force a three-column layout when content needs width. On mobile, collapse navigation and move context into an accessible drawer/accordion; keep project name, status, and primary action visible.

For a future requirements view, use a clean editorial list/table with columns such as requirement, source, status, owner, linked work, and evidence. Highlight unlinked/unverified items with text and state, not color alone. This should look like structured project records, not a generic card grid.

## Screen and component requirements

Build or refine the following against actual existing capabilities:

1. **Authentication:** preserve the actual sign-in/current-user flow; improve any missing registration, recovery, or error path only where backend support exists.
2. **Workspace home:** list/create workspaces; responsive navigation and clear empty/loading/error states.
3. **Project detail:** existing overview, task board/list, milestone/context, create/status task actions, plan draft review, progress summary, export, and navigation. Add source brief/revision and proposal review screens only as their real API contracts land. Respect actual permissions/errors returned by API.
4. **Task detail:** clear task metadata, status, comments, and useful return path.
5. **Workspace detail:** members, roles/invitations, projects, and export as supported by API; no fake administration controls.
6. **Traceability refinement:** verify and refine the existing Requirements and Delivery Report tabs. Make provenance from full brief revisions and generated proposals visible as those records are added. Clearly label provider/mock mode and never present the deterministic mock as live AI.

Reusable patterns should include buttons, text inputs, selects, form validation, breadcrumbs, tabs, status labels, confirmation dialog, inline alerts, toasts if present, skeletons, empty/no-results, permission-denied, and retryable error states. Prefer contextual inline actions over modal-on-everything. Dialogs must work by keyboard and on small screens.

## Interaction and content rules

- Use plain, concrete labels: “Create project,” “Review plan,” “Accept plan,” “Export project.”
- Distinguish generated proposal, user-edited draft, and accepted/saved record.
- Never claim an operation succeeded until the API confirms it; preserve unsaved user input on recoverable failure.
- Confirm destructive actions with a description of what will be removed and whether restoration exists.
- Do not invent deadlines, assigned owners, verified requirements, workspace activity, customer counts, or AI confidence.
- A completed task must never look equivalent to a verified requirement.
- Keep demo data visibly labeled and separate from a signed-in user's real data.
- Use consistent date formatting and handle missing data gracefully.

## Responsive and accessibility bar

- Design for 320px mobile through wide desktop; no horizontal page overflow.
- Use semantic landmarks, heading order, labels, table/list semantics, keyboard-operable menus/dialogs, visible `:focus-visible`, and accessible names for icon-only controls.
- Target comfortable touch areas around 44px; do not rely on hover.
- Maintain WCAG AA contrast for text and states; never convey status with color alone.
- Respect reduced motion and browser zoom; dialogs and drawers must remain scrollable and dismissible.
- Test at narrow mobile, tablet, laptop, and wide desktop sizes if browser tooling is available; report what was actually inspected.

## Implementation constraints and workflow

1. Inspect the repository, `apps/web/package.json`, routes, API client, contracts, current styles, and status brief. Reuse React/Vite/router and installed dependencies unless a clear need is documented.
2. Give a short design/implementation plan tied to the actual app.
3. Implement cohesive slices in the existing app; keep components understandable and avoid giant monolithic JSX files.
4. Connect controls to existing API behavior. If an API capability is missing, document the exact needed endpoint/data contract for the core agent; do not create a fake local production implementation.
5. Preserve the demo boundary, auth behavior, API errors, and existing working functionality.
6. Run only the relevant checks requested by the project/user and report actual results. For UI work, visually inspect if available and list routes and viewports actually checked.
7. Do not claim complete frontend/product readiness until the real source-to-report flow has been browser-verified at desktop/mobile and backend persistence/permissions are verified against a running database.

## Acceptance checklist

- [ ] Visual identity is distinct, restrained, and consistent with anti-vibecoding constraints.
- [ ] Existing real workflows remain connected and all visible controls have a meaningful behavior.
- [ ] No fake data or local-only state is presented as production persistence.
- [ ] User understands where they are, what is saved, what is only a proposal, and what action comes next.
- [ ] Empty, loading, error, validation, permission, and success states are designed.
- [ ] Workbench, board/list, forms, and navigation work at mobile and desktop widths.
- [ ] Keyboard, focus, labels, contrast, reduced motion, and touch targets are addressed.
- [ ] Existing requirement/evidence/verification/report views work with authoritative API data; source-brief/proposal seams are identified accurately.
- [ ] Final handoff lists changed files, real verification, screens/viewports inspected, and remaining backend dependencies.

## Expected handoff

Return a concise summary of implemented screens and design choices, files changed, checks actually run, visual review performed, and backend contracts/features still needed. Keep a short separate note for the core agent listing each frontend dependency: source brief persistence/intake, requirements CRUD/review/source references, requirement-task relation, evidence records, verification history, report/export format, and any permission/ownership fields.
