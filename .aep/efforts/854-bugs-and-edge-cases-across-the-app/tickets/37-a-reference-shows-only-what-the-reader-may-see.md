---
status: resolved
---

# fix(desktop): a contract's reference and an import's collisions show only what they should

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]]. Raised by review round 2 (2026-10-07).

## Outcome

A contract read never hands a member a tenant's national id they may not view, an import's refusal lists every collision it found, and the payment modules say one thing about who owns the terminated lock.

## Acceptance Criteria

Traces requirements 6, 7 and 30, and criterion 30.

- [x] `contract.get` returns `reference` in its fallback spelling (`<national id> @ <start day>`) only to a member who may view tenants, as the receipt gates the national id (effort 838, requirement 10); a reader without it gets no reference and the ledger export's Contract cell falls back to the contract's name; a router test covers both readers.
- [x] The import dialogs (`transfer/component/import-dialog.svelte`, `directory-import-dialog.svelte`) key their collision lists so two collisions on one unit both render; a component test with two clashing pairs on one unit sees both.
- [x] `payment/transfer.ts` asks the payment module's rule for the terminated lock rather than restating it, or its comment agrees with `payment/payment.ts`'s header; the comment in `payment/payment.ts` naming `ensureContractIsNotTerminated` names what `payments.delete` calls now.

## Relevant areas

- `apps/desktop/src/lib/contract/router.ts`
- `apps/desktop/src/lib/transfer/component/{import-dialog,directory-import-dialog}.svelte`
- `apps/desktop/src/lib/payment/{transfer.ts,payment.ts}`

## Constraints

- A changeset only where a user observes something no entry of this effort already says; otherwise say so in Notes ([[references/changesets]]).
- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
