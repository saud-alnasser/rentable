---
status: resolved
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

- [x] `useRevokeInvitation`, `invitation.revoke` in `router.ts`, the revoke in `tauri.ts` and
      `host.ts`, and the `invitation_revoke` command with its `lib.rs` line are removed; the Rust
      `invite::revoke` stays only if something in the shipping surface calls it, otherwise it
      goes with its tests. `PendingInvitation` and `MemberFacts.pending` leave `host.ts` and
      whatever mirrors them, and the Rust side stops answering them if nothing reads them.
      `invite::invitation_link`, read by tests alone, goes with those tests, and
      `invitation.sealed_secret`'s docstring says the column holds the issuer's copy for no
      reader yet. `router.test.ts` pins the procedures without `invitation.revoke`.
      *Verified 2026-09-16 on the effort branch: `grep` over `apps/desktop/src` and
      `apps/desktop/tauri/src` for `invitation_revoke`, `useRevokeInvitation`,
      `PendingInvitation` and `invitation_link` prints nothing; `invite::revoke_invitation`
      went with its tests since nothing shipping called it; two join and invite tests were
      reworked to reach the same state without the revoke, keeping the `Revoked` refusal's
      coverage; `invitation.sealed_secret` stays as a column with a docstring saying it has no
      reader yet; `router.test.ts` pins the procedures without `invitation.revoke`. At
      integration the unread `organization.dashboard.revoked` key was removed from both
      locales and `organization.join.replaced` rewritten to send the person to whoever keeps
      the accounts.*
- [x] `apps/desktop/src/lib/i18n/tests/` gains a test that walks every leaf of the Arabic
      locale and fails on a string whose letters are Latin outside a fixed allowance (product
      and brand names such as rentable and turso, placeholders in braces, punctuation and
      digits), and the same walk over the English locale fails on an Arabic letter; both pass.
      *Verified: `apps/desktop/src/lib/i18n/tests/script.test.ts` with three tests, the Arabic
      and English sweeps and one proving the detector bites; `node --import tsx --test
      src/lib/i18n/tests/*.test.ts`: `tests 18, pass 18, fail 0`; the allowance is
      `app.turso.tech`, `rentable`, `turso`, `developer`, `csv` and the phone mask, each with
      its sentence; no real slip in either locale.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass; no changeset line, since
      nothing a person sees changes.
      *Verified in the run's worktree: `pnpm check` exit 0 (desktop `9308 FILES 0 ERRORS 0
      WARNINGS`), `pnpm lint` exit 0, `pnpm test` exit 0 (desktop `206 passed`); `cargo test
      -- --test-threads=1`: `391 passed; 0 failed; 10 ignored`; no changeset line.*

## Relevant areas

`apps/desktop/tauri/src/organization/{invite,command}.rs`, `apps/desktop/tauri/src/lib.rs`,
`apps/desktop/src/lib/platform/{host,tauri}.ts`, `apps/desktop/src/lib/organization/{router,query}.ts`,
`apps/desktop/src/lib/i18n/tests/`, and the tests beside each.

## Constraints

- **Nothing under a signature changes**; a column stays even where its reader goes.
- **A removal is a removal**: no key, procedure or function is left renamed or commented out.

## Notes

- *2026-09-16, at integration.* Three stale sentences in source found by ticket 19 were folded
  in: the connect screen's docstring (two kinds of link, no organization link), the members
  section's docstring (why the account form is mounted in the shell), and
  `layout.signIn.disconnectDescription` in both locales, which named the organization's link.
  Two the child raised were closed at integration: the unread `organization.dashboard.revoked`
  key removed, and `organization.join.replaced` rewritten in both locales, since it sent the
  person to a you section act that ticket 14 retired. The `disconnectDescription` change is a
  correction of a false sentence rather than a new capability; no changeset line.
