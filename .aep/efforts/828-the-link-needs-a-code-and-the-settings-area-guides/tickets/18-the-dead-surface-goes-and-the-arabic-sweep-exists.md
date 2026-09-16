---
status: open
---

# chore(organization): the dead surface goes and the Arabic sweep exists

## Outcome

Nothing the branch left with no caller ships: the revoke command, procedure and hook, the
pending invitation shape on the web side, and the issuer-copy reader that only tests read are
gone. A locale test sweeps every Arabic key for an English string, which criterion 12 asks for
and no test did.

## Acceptance Criteria

Traces requirement 12 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criterion 12.
Cut by converge round one
([[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/evidence/research/converge-round-one]],
sections A (criterion 12) and D).

- [ ] `useRevokeInvitation`, `invitation.revoke` in `router.ts`, the revoke in `tauri.ts` and
      `host.ts`, and the `invitation_revoke` command with its `lib.rs` line are removed; the Rust
      `invite::revoke` stays only if something in the shipping surface calls it, otherwise it
      goes with its tests. `PendingInvitation` and `MemberFacts.pending` leave `host.ts` and
      whatever mirrors them, and the Rust side stops answering them if nothing reads them.
      `invite::invitation_link`, read by tests alone, goes with those tests, and
      `invitation.sealed_secret`'s docstring says the column holds the issuer's copy for no
      reader yet. `router.test.ts` pins the procedures without `invitation.revoke`.
- [ ] `apps/desktop/src/lib/i18n/tests/` gains a test that walks every leaf of the Arabic
      locale and fails on a string whose letters are Latin outside a fixed allowance (product
      and brand names such as rentable and turso, placeholders in braces, punctuation and
      digits), and the same walk over the English locale fails on an Arabic letter; both pass.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass; no changeset line, since
      nothing a person sees changes.

## Relevant areas

`apps/desktop/tauri/src/organization/{invite,command}.rs`, `apps/desktop/tauri/src/lib.rs`,
`apps/desktop/src/lib/platform/{host,tauri}.ts`, `apps/desktop/src/lib/organization/{router,query}.ts`,
`apps/desktop/src/lib/i18n/tests/`, and the tests beside each.

## Constraints

- **Nothing under a signature changes**; a column stays even where its reader goes.
- **A removal is a removal**: no key, procedure or function is left renamed or commented out.

## Notes
