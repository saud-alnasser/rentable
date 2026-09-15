---
status: open
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

- [ ] `store.rs`: `member` gains `owner_seed_sealed`, nullable, folded into the signed preimage
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
- [ ] `command.rs` and `lib.rs`: `member_transfer_ownership(member_id, password)`, owner only;
      `host.ts`, `tauri.ts`, `router.ts` (under the owner's procedures) and `query.ts` follow;
      `router.test.ts` pins it. The owner's own card menu gains `transfer ownership` opening a
      `FormSurface` of `heavy` weight naming what changes (they become an administrator, the
      other account the owner, and the Turso account stays theirs) and taking the password;
      `members.svelte.test.ts` finds it for the owner and not for an administrator.
- [ ] The sync section's authority block, on a machine whose owner holds no authority, says
      the authority follows the account that consented and offers the reconnect that exists;
      `area.svelte.test.ts` finds the sentence for such an owner.
- [ ] Every string in both locales; `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test`
      pass; the changeset of ticket 03 is extended with one line.

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
