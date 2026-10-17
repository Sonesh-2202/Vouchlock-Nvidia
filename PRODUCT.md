# Vouchlock — Product Definition

## 1. Core Purpose & Promise

Vouchlock is a project delivery and traceability suite for teams that need to prove what they shipped. Its signature feature is the **Truthful Delivery Report**:

- Project briefs are parsed into explicit, reviewed requirements.
- Requirements are linked directly to execution tasks.
- Execution tasks are backed by verifiable proof artifacts (code commits, pull requests, test logs, deployment URLs, signed approvals).
- A named person explicitly verifies each requirement with date and rationale.
- The delivery report reflects objective truth: verified versus unverified claims, missing proof links, and active blockers.

Vouchlock replaces superficial progress bars and unverified checklists with auditable accountability.

---

## 2. Target Audience & Mental Model

- **Audience:** Engineering leads, agency founders, technical project managers, compliance auditors, and university teams delivering milestone projects.
- **Usage Scene:** A focused, high-density work environment where users spend hours reviewing briefs, linking tasks, reviewing evidence, and generating client deliverables.
- **Mental Model:** An authoritative accounting ledger. Green means **proven**. Everything unproven is visibly quieter and exposes the exact missing link in the chain.

---

## 3. Core Entities & Workflows

1. **Source Briefs (`project_brief_revisions`):** Exact, versioned source text preserving author and timestamp without silently mutating existing requirements.
2. **Requirements (`requirements`):** Canonical statements of functional, non-functional, constraint, or deliverable obligations.
3. **Execution Tasks (`tasks`):** Work items organized in kanban and list views, explicitly linked to one or more requirements.
4. **Evidence / Proof of Delivery (`evidence`):** Verifiable URLs or notes demonstrating requirement fulfillment.
5. **Explicit Verification (`verifications`):** Immutable historical log of named verifiers asserting verified, rejected, or unverified states.
6. **Truthful Delivery Report:** Audit matrix calculating percent verified, proof coverage, and unlinked gaps.

---

## 4. What Vouchlock Will Never Do

- It will **never** infer requirement verification from a completed task.
- It will **never** invent assignees, due dates, evidence, or verification sign-offs.
- It will **never** present AI suggestions as canonical project truth without explicit human review and acceptance.
- It will **never** hide delivery gaps behind inflated progress bars or rounded summary percentages.
- It will **never** lock users into proprietary AI providers or require API keys for manual project tracking.

---

## 5. Surfaces and Visual Architecture (V2: Paper on the Desk)

1. **Public Landing Page (`/`):** An editorial, narrative introduction to traceable delivery featuring a live ledger excerpt, a pinned scroll explanation ("How a claim becomes proof"), and a sample Truthful Delivery Report.
2. **The Desk (App Shell):** Deep warm graphite canvas (`#14130F` dark, `#EFEBE2` light) designed for hours of focused execution, with collapsible rail, command palette, and master-detail split views.
3. **The Paper (Documents of Record):** Authoritative warm off-white sheets (`#F3EFE4` / `#FBF9F3`) with dark ink typography, subtle physical edge rules, and signed verification stamps for Source Briefs, Delivery Reports, Evidence slips, and Legal specifications.
