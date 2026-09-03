# Agent Control Plane — Implementation Checklist

## Phase 1 — Deterministic domain foundation

- [x] Define the fictional Anthropic customer, invoices, contract, Amendment #3, dispute, and Session #882.
- [x] Define authority, approval, audit, financial, and session types.
- [x] Implement default-plus-session-override rule resolution.
- [x] Implement deterministic `ALLOW`, `ALLOW_WITH_LIMIT`, `APPROVAL_REQUIRED`, and `DENY` evaluation.
- [x] Make invalid/non-positive amounts fail safely.
- [x] Prevent execution beyond the remaining correction.

**Gate:** `npm test` proves 400/500 allow, 501/1200 block, 800 after override allows, and 801 blocks.

## Phase 2 — Shared state and reusable actions

- [x] Create one observable `AppStore` with reset and subscription support.
- [x] Implement delegation, evidence reads, live authority reread, refund, credit request, override, and approval actions.
- [x] Route both UI and WebMCP through the same store action surface.
- [x] Keep React components free of duplicated authority and financial mutation logic.
- [x] Preserve global/default €500 authority when Session #882 becomes €800.
- [x] Derive Required, Executed, Pending Approval, and Remaining via selectors.

**Gate:** Full-flow test resolves exactly €1,200; modified-credit test leaves exactly €100.

## Phase 3 — Audit engine

- [x] Seed only the fictional Anthropic request-received event.
- [x] Record human delegation and session override.
- [x] Record agent evidence reads and explicit authority reread.
- [x] Record block without execution.
- [x] Record refund execution, approval request, approval, credit execution, and resolution.
- [x] Include timestamp, actor, decision, metadata, and trace ID.

**Gate:** Canonical test asserts every critical event type exists.

## Phase 4 — Real WebMCP

- [x] Verify the current official API uses `document.modelContext.registerTool`.
- [x] Register asynchronously with JSON Schema inputs and AbortSignal cleanup.
- [x] Feature-detect unsupported browsers without creating a fake fallback API.
- [x] Register thirteen focused tools, including bound credit execution, outbound-message control, receipt verification, and protected-record attacks.
- [x] Record each real WebMCP invocation as an authority decision receipt.
- [x] Route `issue_refund` through the Authority Gate.
- [x] Make `request_account_credit` approval-only.

**Gate:** Browser reports all thirteen page-defined tools. Live calls prove cumulative budgets, replay defense, approval binding, recipient control, and immutable signed records.

## Phase 5 — Product UI

- [x] Build Request / Intake with pre-agent customer complaint.
- [x] Build Control Center with Session #882, agent-online state, metrics, and activity stream.
- [x] Make ACTION BLOCKED the strongest visual moment.
- [x] Build Edit Authority modal that edits session scope only.
- [x] Build invoice and contract evidence details.
- [x] Build Authorization Queue with editable approved amount.
- [x] Build first-class Audit Trail.
- [x] Build WebMCP Flight Recorder with inspectable decision receipts.
- [x] Build Agent Plan Checkpoint with step and approval status.
- [x] Build human-confirmed Emergency Revoke with write blocking and approval cancellation.
- [x] Build Scenario Lab with guided Resolution, Attack, and Emergency Stop runs.
- [x] Add an always-visible Evidence → Intent → Gate → Human → Proof progress rail.
- [x] Build default-versus-session Authority Rules comparison.
- [x] Add responsive desktop, compact-sidebar, and mobile layouts.
- [x] Add deterministic demo reset.
- [x] Build six guided security scenarios and a visible tool registry.
- [x] Build event-derived Security Posture with an attack proof matrix.

**Gate:** Production build succeeds and browser QA confirms intake, blocked, overridden, pending approval, and resolved states render from shared live state.

## Phase 6 — Security hardening

- [x] Enforce session lifecycle on every consequential write.
- [x] Enforce cumulative refund budgets and short-lived authority leases.
- [x] Require idempotency keys and prevent exact replay plus key/input swaps.
- [x] Reserve pending/approved funds to prevent parallel overcommit.
- [x] Bind approvals to exact inputs, state fingerprints, policy versions, and expiry.
- [x] Separate human approval from execution and revalidate live state on execution.
- [x] Mark injected invoice text as untrusted provenance that cannot grant authority.
- [x] Block unapproved recipients and require review for allowed-domain messages.
- [x] Pause sessions automatically after three denied writes in 60 seconds.
- [x] Link WebMCP receipts with SHA-256 and expose integrity verification.
- [x] Cover all controls with 16 deterministic tests.

## Phase 7 — Demo hardening

- [x] Write a timed <3-minute demo script.
- [x] Keep agent tools to thirteen meaningful capabilities.
- [x] Keep human controls to delegation, authority edit, and approval.
- [ ] Run the exact demo ten consecutive times in the target challenge browser.
- [ ] Confirm target browser/build exposes the current `document.modelContext` API.
- [ ] Deploy to public HTTPS hosting.
- [ ] Record the final demo video.

**Release gate:** ten clean runs, zero stale session state after reset, all financial totals exact, and complete audit sequence visible.
