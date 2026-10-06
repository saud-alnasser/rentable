---
status: open
---

# docs(desktop): the rules name what the effort added

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]]. Raised by review round 1 (2026-10-07).

## Outcome

The interface, frontend and component rules say what is now true of undo, the refund control, the locked-row note and the voucher, and no source comment describes the code before this effort.

## Acceptance Criteria

Traces requirements 1, 12, 25 and 29.

- [ ] [[rules/interface]] *Undo* says a workspace switch, a sign-out, the wall and a change of organization forget the stack, and that undo and redo stand down under a cover as well as in a text field.
- [ ] [[rules/interface]] *Create* and [[contexts/desktop/components]] record the record refund control on the ledger's balance footer as the one create drawn outside the bar, and why; [[rules/interface]] *Guidance* records the terminated contract's locked-row note as the one standing explanation of a refusal, and why (spec requirement 25).
- [ ] [[rules/frontend]] *i18n* lists the voucher among the text handed to a tenant in the language chosen for it; the module comment in `tauri/src/database/corrupt.rs` no longer lists `Database::is_replica_ready` among reads it does not describe truly.

## Relevant areas

- `.aep/rules/{interface,frontend}.md`
- `.aep/contexts/desktop/components.md`
- `apps/desktop/tauri/src/database/corrupt.rs` (comment only)

## Constraints

- Nothing a user observes changes; no changeset.
- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
