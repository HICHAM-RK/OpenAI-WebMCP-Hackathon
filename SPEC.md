# Agent Control Plane — Product & Technical Specification

## Thesis

**Capability is not authority.** WebMCP exposes what a website can do. Agent Control Plane adds a deterministic, website-enforced authority layer that decides what the current agent may execute autonomously, what requires a human checkpoint, and what is denied.

The human and agent operate the same live application state. React and WebMCP must call the same store actions and domain functions. A WebMCP write must never bypass the Authority Gate.

## Canonical demo fixture

| Field | Canonical value |
|---|---|
| Customer | Anthropic (fictional hackathon scenario) |
| Seats | 25 |
| Base price | €120 / seat / month |
| Contract discount | 20% |
| Correct price | €96 / seat / month |
| Amendment | #3, extends discount through Feb 28, 2026 |
| January billed / correct | €3,000 / €2,400 |
| February billed / correct | €3,000 / €2,400 |
| Overcharge | €600 × 2 = €1,200 |
| Delegated objective | “Resolve Anthropic’s fictional billing dispute.” |
| Session | #882 |
| Human operator | Hicham R |

No other customer, dispute, or unrelated audit fixture is part of the product.

## User story and product boundary

An Anthropic billing request exists as a fictional, good-natured hackathon scenario. Hicham grants bounded session authority. The agent investigates through real page-defined WebMCP tools, calculates the correction, and attempts a €1,200 refund. The website blocks it at the live €500 boundary without changing financial state. Hicham expands only Session #882 to €800. The agent rereads authority, publishes an evidence-backed plan, executes €800, and requests approval for the remaining €400. Hicham approves and the case resolves.

The Scenario Lab also includes adversarial paths for prompt injection, replay and limit splitting, outbound data exfiltration, signed-record tampering, and emergency session revocation.

This is an authority control plane demonstrated through one billing workflow—not a CRM, support suite, payment processor, or general agent platform.

## Authority model

### Outcomes

- `ALLOW`: execute/read immediately.
- `ALLOW_WITH_LIMIT`: execute only when the requested amount is within the effective limit.
- `APPROVAL_REQUIRED`: create a pending approval; do not execute.
- `DENY`: block without side effects.

### Baseline delegated authority

| Action | Default |
|---|---|
| Read dispute | ALLOW |
| Inspect invoice | ALLOW |
| Inspect contract | ALLOW |
| Refund | ALLOW_WITH_LIMIT €500 |
| Account credit | APPROVAL_REQUIRED |
| Send customer message | APPROVAL_REQUIRED |
| Modify signed contract | DENY |
| Delete invoice | DENY |

Effective authority is `session override ?? default rule ?? DENY`. The €500 → €800 change is stored under `session.authorityOverrides.refund`; it never modifies `session.defaultAuthority`. Every policy change increments a policy version and issues a short-lived, customer-bound authority lease.

An emergency session revoke is a higher-priority runtime boundary: all consequential write rules become `DENY`, pending approvals are cancelled, and evidence reads remain available for investigation and audit.

## Financial invariants

- Required correction is always €1,200 and is traceable to two €600 discrepancies.
- `remaining = max(0, requiredCorrection - executedCorrection)`.
- Pending or approved funds are reserved and displayed separately; they are not counted as executed.
- A blocked action cannot change `executedCorrection`.
- A refund or approved credit cannot exceed the remaining correction.
- After refund €800: Required €1,200 / Executed €800 / Pending Approval €0 / Remaining €400.
- After requesting credit €400: Required €1,200 / Executed €800 / Pending Approval €400 / Remaining €400.
- After human approval: financial state is unchanged until a separate exact `execute_approved_credit` call passes live revalidation.
- After execution: Required €1,200 / Executed €1,200 / Pending Approval €0 / Remaining €0 / RESOLVED.
- If Hicham approves only €300 of the requested €400, Executed is €1,100, Remaining is €100, and status is PARTIALLY_RESOLVED.

## Architecture

```text
React screens ───────┐
                     ├─> AppStore actions ─> pure domain actions ─> Authority Gate
WebMCP execute() ────┘              │                  │
                                    └──── shared AppState + audit events + decision receipts
```

| Area | Responsibility |
|---|---|
| `src/domain/fixtures/anthropic.ts` | Immutable fictional business fixture and default authority |
| `src/domain/actions/protected-actions.ts` | Denied signed-record mutation attempts for Attack Mode |
| `src/domain/types.ts` | Domain, authority, approval, session, and audit contracts |
| `src/domain/authority/authority-gate.ts` | Deterministic effective-rule evaluation |
| `src/domain/actions/*` | Pure financial, evidence-read, delegation, override, and approval transitions |
| `src/domain/state/selectors.ts` | Derived financial and effective-authority values |
| `src/store/app-store.ts` | Single observable runtime state and shared public action surface |
| `src/webmcp/register-tools.ts` | Thin standards-based page tool descriptors calling store actions |
| `src/App.tsx` | Screens and human controls; no business logic duplication |
| `src/domain/domain.test.ts` | Boundary, isolation, full-flow, and modified-approval tests |

All mutations replace state atomically and append audit events. The UI subscribes through `useSyncExternalStore`, so WebMCP calls immediately update the visible application.

## WebMCP integration

The implementation follows the current WebMCP Community Group draft and official reference repository: `await document.modelContext.registerTool(tool, { signal })`. Tool definitions use JSON Schema `inputSchema`; `execute` calls the shared store; aborting the signal removes registrations. Older `navigator.modelContext`, `provideContext`, and button-simulated tools are not used.

Reference: https://github.com/webmachinelearning/webmcp

| Tool | Type | Result / gate behavior |
|---|---|---|
| `get_dispute_context` | Read | Customer, dispute, and evidence references |
| `inspect_invoice` | Read | Canonical invoice math by ID |
| `inspect_contract` | Read | Contract plus verified Amendment #3 |
| `get_authority_state` | Read | Default and effective rules; records agent reread |
| `propose_resolution_plan` | Plan | Evidence-backed steps matched to live authority checkpoints |
| `issue_refund` | Write | Always passes through Authority Gate |
| `request_account_credit` | Write | Creates pending approval; never directly executes |
| `execute_approved_credit` | Write | Exact approval binding, expiry, policy, and live-state revalidation |
| `send_customer_message` | Write | Approved-domain boundary plus human review |
| `attempt_contract_modification` | Red-team write | Available capability; always evaluated and denied by signed-record policy |
| `attempt_invoice_deletion` | Red-team write | Available capability; always evaluated and denied by record-retention policy |
| `get_session_state` | Read | Live status, financials, last block, authority-read timestamp |
| `verify_receipt_chain` | Verify | Recomputes the SHA-256 receipt chain |

When `document.modelContext` is unavailable, the UI displays WebMCP unavailable and remains usable for review. It does not install a fake tool API.

## Screens

1. **Scenario Lab** — six guided demonstrations with expected policy outcomes and copyable agent prompts.
2. **Request / Intake** — fictional complaint, evidence boundary, and delegation envelope.
3. **Control Center** — objective, guided progress, live authority checkpoint, financial strip, activity stream, and dominant blocked state.
4. **Dispute Details** — invoice math, contract terms, and Amendment #3.
5. **Authorization Queue** — pending account-credit request and optional approved-amount edit.
6. **Security Posture** — nine event-derived controls and an attack proof matrix.
7. **WebMCP Recorder** — visible tool registry plus SHA-256-linked invocation receipts.
8. **Audit Trail** — timestamp-first human, agent, and system events from this workflow only.
9. **Authority Rules** — default/effective rules plus the live authority lease.

The Control Center also exposes the live Agent Plan Checkpoint and a human-confirmed Emergency Revoke control.

The visual language is dark charcoal, warm signal orange, thin borders, operational mono text, and distinct permit/approval/block/execute states. “ACTION BLOCKED” is the strongest moment. The authority control says “Edit Authority”; it does not shortcut to authorizing a target transaction.

## Audit requirements

Audit entries include ID, ISO timestamp, actor (`HUMAN`, `AGENT`, `SYSTEM`), event type, decision, metadata, and trace ID. Required sequence includes request receipt, objective delegation, evidence reads, block, session authority update, authority reread, refund execution, approval request, human approval, credit execution, and dispute resolution.

## Security invariants

- Consequential writes require an active session and a current policy version.
- Refund limits are cumulative across the session; splitting a transaction cannot evade the budget.
- Every WebMCP write requires an idempotency key. Exact replays never rerun; key/input swaps are blocked.
- Refund authority is a customer-bound, expiring, use-limited lease revoked on emergency stop.
- Pending and approved credits reserve correction funds to prevent concurrent overcommit.
- Human approvals bind exact parameters, state fingerprint, policy version, and expiry; approval and execution are separate operations.
- Invoice text is untrusted evidence. Provenance findings are recorded and cannot alter authority.
- Outbound messages are restricted to the customer domain and require human review; external recipients are blocked.
- Three denied writes inside 60 seconds automatically pause the session.
- Each WebMCP decision receipt includes the previous receipt hash and its own SHA-256 digest.

## Acceptance tests

- `refund(400)` → ALLOW
- `refund(500)` → ALLOW
- `refund(501)` → BLOCK
- `refund(1200)` → BLOCK and Executed remains €0
- Session override €500 → €800; default remains €500
- `refund(800)` → ALLOW / EXECUTE
- `refund(801)` → BLOCK
- `account_credit(400)` → APPROVAL_REQUIRED
- Approve €400 → no financial mutation; exact second execution → RESOLVED with €0 remaining
- Modify approval to €300 → PARTIALLY_RESOLVED with €100 remaining
- Plan requires both invoices, the contract, and a live authority read; the €800 override produces an €800 autonomous refund plus €400 approval step
- Emergency revoke makes future refund and account-credit writes BLOCK and cancels pending approvals
- Every real WebMCP call creates one decision receipt; UI actions do not impersonate tool calls
- Contract modification and invoice deletion tools remain available but return BLOCK; protected source records are unchanged
- Split refund €400 + €200 under a €500 cumulative budget → second call BLOCK
- Identical idempotency replay → REPLAY_DETECTED with no second mutation
- Changed input with reused key → BLOCK
- Expired, stale, or parameter-swapped approval → BLOCK
- Injected invoice instruction → provenance warning; authority unchanged
- External message recipient → DATA_EGRESS_BLOCKED
- Three denied writes → circuit breaker pauses the session
- Receipt-chain verification → valid across every captured call

## Non-goals

No multi-agent orchestration, enterprise RBAC, multi-tenancy, real Stripe/payment integration, Salesforce, OAuth/SSO, generic deployment, policy DSL, AI risk scoring, RAG, graph database, PDF extraction, anomaly ML, or unrelated infrastructure governance.
