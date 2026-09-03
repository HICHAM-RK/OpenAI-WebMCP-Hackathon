# Agent Control Plane

Hackathon-ready WebMCP prototype built around one thesis: **capability is not authority.**

The app demonstrates a website-enforced authority layer using Anthropic as a clearly fictional, good-natured hackathon customer. React and thirteen real page-defined WebMCP tools operate the same live store and domain actions. Six Scenario Lab runs cover safe resolution, prompt injection, replay and limit splitting, data exfiltration, signed-record tampering, and emergency revocation.

Judge-facing controls make the invisible agent boundary tangible:

- **WebMCP Flight Recorder** captures real tool calls as authority decision receipts with inputs, evidence, policy source, and financial before/after state.
- **Agent Plan Checkpoint** exposes the plan the agent derived from evidence and live authority before money moves.
- **Emergency Revoke** lets the human stop all consequential actions and cancel pending approvals at any moment.
- **Attack Mode** proves that available contract and invoice tools still cannot mutate protected records without authority.
- **Guided Scenario Lab** explains the flow as Evidence → Agent intent → Authority Gate → Human control → Proof.
- **Security Posture** derives nine live control claims from session state, audit events, and SHA-256-linked receipts.
- **Replay and budget controls** require idempotency keys and enforce cumulative—not per-call—limits.
- **Bound approvals** reserve funds, expire, bind exact parameters and policy version, then revalidate on a separate execution call.
- **Provenance and egress controls** contain instructions hidden in evidence and block messages to unapproved recipients; humans can explicitly approve or reject each queued customer message.
- **Automatic circuit breaker** pauses a session after three denied writes in 60 seconds.

## Run

```bash
npm install
npm run dev
```

Use a browser with current `document.modelContext` WebMCP support to exercise page tools. Other browsers still render the complete human interface and display **WEBMCP UNAVAILABLE** without installing a fake API.

## Verify

```bash
npm test
npm run build
```

## Artifacts

- [SPEC.md](./SPEC.md) — complete product and technical contract
- [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md) — completed phases and release gates
- [DEMO_SCRIPT.md](./DEMO_SCRIPT.md) — timed canonical demo and recovery cues

The project intentionally contains no real payment or email integration: all writes and deliveries are simulated inside the security lab.
