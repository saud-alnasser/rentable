---
status: resolved
blocked-by: [11]
---

# feat(desktop): payments carry a direction

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part three, *Data model and migration*).

## Outcome

Payments carry a direction, received or refund, added by migration 0006 with every existing row reading received; nothing a user sees changes yet.

## Acceptance Criteria

Traces requirement 25.

- [x] Schema, `PaymentSchema` and `serializePayment` carry `direction`; `0006_*.sql` generated and hand-finished.
- [x] The Rust lease seeds gain `SEEDED_AT_SIX` with every payment carried as received.
- [x] Every existing test passes; a migration test finds existing payments read as received.

## Relevant areas

- `apps/desktop/src/lib/platform/database/schema.ts`
- `packages/workspace-migrations/`
- `apps/desktop/tauri/src/organization/lease/apply.rs`
- `apps/desktop/src/lib/payment/serialize.ts`

## Constraints

- [[rules/migrations]] and [[references/drizzle-kit]]: additive only, no `PRAGMA foreign_keys`.
- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.

## Notes

No changeset: nothing a user can observe changes until ticket 22.
