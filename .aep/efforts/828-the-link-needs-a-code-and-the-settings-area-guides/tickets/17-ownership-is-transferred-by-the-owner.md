---
status: resolved
blocked-by: ['15']
---

# feat(organization): ownership is transferred by the owner

## Outcome

From an account's card the owner names it owner, with their own password. The organization's
signing key is unchanged and nothing is re-signed: its seed is sealed into the new owner's
vault, the roles swap, and the way back with the account opens the key from the seal where
there is one. The Turso authority stays with the account that consented, and the sync section
on the new owner's machine says so and offers the reconnect.

## Acceptance Criteria

Traces requirement 22 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 22
and 12.

- [x] `store.rs`: `member` gains `owner_seed_sealed`, nullable, folded into the signed preimage
      only where present, so a row without it hashes exactly as before (a test verifies a row
      written before the column, and one written with it). `role::transfer_ownership(session,
      store, member_id, password)` is the owner's alone: re-opens the owner's vault with the
      password (a wrong one refuses before anything is written), obtains the seed (derived for
      the founder, unsealed from `owner_seed_sealed` for a transferee), seals it to the new
      owner's public key into their row, writes the new owner's row `owner` and the old owner's
      `administrator` with a certificate, signs both, and pushes. Everything that derives the
      owner's key from the vault (the sign-in's owner path, `setup::connect_existing`) reads the
      seal first and derives only where there is none. Tests: the transfer swaps the roles;
      every row still verifies against the unchanged key; the new owner connects a fresh machine
      with the account through `connect_existing` by the sealed seed; the old owner is an
      administrator who can no longer transfer; an administrator is refused; a wrong password is
      refused with nothing written.
      *Verified 2026-09-16 on the effort branch: `member.owner_seed_sealed BLOB` nullable and
      last; `authority::MemberAuthority` appends it with a length prefix only where present;
      `setup::owner_key_from` is the one seed read, used by `connect_existing`,
      `role::change_role` and `invite::write_account`; `role::transfer_ownership` at
      `role.rs:106`; `cargo test -- --test-threads=1`: `393 passed; 0 failed; 10 ignored`,
      with the preimage-before-the-column, the preimage-with-the-seal, the byte-exact vector,
      the swap with every row verifying, the old owner and an administrator refused, the
      certificate for the new owner, and the fresh machine connecting by the sealed seed all
      ok.*
- [x] `command.rs` and `lib.rs`: `member_transfer_ownership(member_id, password)`, owner only;
      `host.ts`, `tauri.ts`, `router.ts` (under the owner's procedures) and `query.ts` follow;
      `router.test.ts` pins it. The owner's own card menu gains `transfer ownership` opening a
      `FormSurface` of `heavy` weight naming what changes (they become an administrator, the
      other account the owner, and the Turso account stays theirs) and taking the password;
      `members.svelte.test.ts` finds it for the owner and not for an administrator.
      *Verified: `member_transfer_ownership` registered in `lib.rs`;
      `member.transferOwnership` pinned in `router.test.ts` (`pass 16`);
      `transfer-ownership.svelte` is a heavy form surface; `members.svelte.test.ts` and
      `area.svelte.test.ts`: `50 passed`, with the owner card offering the owner the transfer
      alone, none for an administrator, the surface naming what changes and taking the
      password, and a refusal marking it.*
- [x] The sync section's authority block, on a machine whose owner holds no authority, says
      the authority follows the account that consented and offers the reconnect that exists;
      `area.svelte.test.ts` finds the sentence for such an owner.
      *Verified: `an owner holding no authority is told the authority follows the account that
      consented` and its absence for an owner who holds it, in the same run; the context's
      *Authority* entry carries the dated correction and names `setup::owner_key_from`.*
- [x] Every string in both locales; `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test`
      pass; the changeset of ticket 03 is extended with one line.
      *Verified in the run's worktree: both locales, Arabic written, `i18n-types.ts`
      regenerated after the merge with 16 and folded in; `validate.mjs`: `266 artifacts
      checked, no failures`; `pnpm check` exit 0 (desktop `9307 FILES 0 ERRORS 0 WARNINGS`),
      `pnpm lint` exit 0, `pnpm test` exit 0 (desktop `206 passed`); `cargo test`: `393
      passed`; the changeset carries the transfer's line.*

## Relevant areas

`apps/desktop/tauri/src/organization/{role,store,session,setup,vault,authority,command}.rs`,
`apps/desktop/tauri/src/lib.rs`, `apps/desktop/src/lib/platform/{host,tauri}.ts`,
`apps/desktop/src/lib/organization/{router,query}.ts`,
`apps/desktop/src/lib/organization/component/{members,reconnect-authority}.svelte`,
`apps/desktop/src/lib/settings/component/area.svelte`, `apps/desktop/src/lib/i18n/{en,ar}/index.ts`,
`.aep/contexts/desktop/organization.md` (the *Authority* entry), and the tests beside each.

## Constraints

- **Read [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/plan]], *Ownership
  is transferred*, and its risk on the signed preimage.**
- **The key does not change**; a design that re-signs the directory is a return to plan.
- **[[rules/credentials]]**: the seed is unsealed in Rust and held in the session as the
  founder's is; nothing crosses.
- **The Turso account does not move** (spec, *Out of Scope*).

## Notes

- *2026-09-16, at integration.* The entry sits on the owner's own card, the account named on
  the surface (requirement 19 and criterion 19; requirement 22's "from an account's card" is
  read with them). The context's *Authority* entry carries the correction and states, in the
  same block, that the *Chain* entry's "derived from the owner's secret and stored nowhere" now
  holds for a founder alone. `invite::unset_password` already refuses an owner's row, which is
  what keeps a transferee's seal from being orphaned by a reset. The transfer surface reads
  "hand over ownership", two plain lines on what changes and what does not, a chooser, the
  password, and "hand it over".
- *Return to plan, 2026-09-16, at review round one.* The correctness axis found that a
  transferee's way back rested on the seal read out of the database it judges (a member with a
  full-access grant could replace it and re-sign the directory), that a transfer to an unset
  account orphaned the organization, and that the founder still connected afterwards. The human
  chose to reopen the design rather than record the limit. Requirement 22 is rewritten: the
  handover is two acts, the new owner's password becomes the key, and a succession record lets
  every machine follow. Ticket 22 builds it on top of this ticket's offer half; the seal stays
  as the offer's carrier and is opened only on a machine that already holds the old key.
