---
status: resolved
blocked-by: ['20']
---

# feat(organization): ownership is handed over in two acts, and the directory re-keys

## Outcome

The owner offers ownership from the account's card to an account whose password is set, and
can withdraw it; the offered member accepts from their you section with their password, and
the organization key becomes the one their vault derives: every certificate is re-issued and
every owner-signed row re-signed under it, a succession record signed by the old key over the
new lets every other machine pin the new key, and the roles swap. The way back with the account
is then the owner's password alone, founder or transferee, and the old owner is refused.

## Acceptance Criteria

Traces requirement 22 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 22
and 12. Reopened at review round one from ticket 17, whose offer half it keeps.

- [x] `store.rs`: `succession`, the tenth table, `(id, offered_member_id, offered_by,
      offered_at, old_verifying_key, new_verifying_key, accepted_at, signature)`, the offer
      signed by the current key and the completion by the old key over the new; reads and
      writes beside it; the nine-tables test becomes ten. `role::offer_ownership(session, store,
      member_id, password)` refuses a non-owner, an unset account, a removed account and self,
      seals the seed as ticket 17 does and writes the offer; `role::withdraw_offer` deletes it
      and clears the seal. `role::accept_ownership(session, store, held, password)` on the
      offered member's machine: derives the new key from their vault, unseals the old seed and
      refuses unless the key it derives is the one this machine pinned, re-issues every
      certificate under the new key with the same signing keys and ids, re-signs every row the
      old owner signed, writes the organization row's new verifying key, completes the
      succession signed by the old key over the new, swaps the roles (the old owner an
      administrator with a certificate), clears the seal, pins the new key in this machine's
      record and session, and pushes. `setup::connect_existing` derives the key from the
      password alone and reads no seal; `setup::owner_key_from` and its seal branch go.
      `organization_state_get` (and the session's read) on a machine whose pinned key no longer
      verifies the rows reads the succession, verifies the new key under the pinned one, pins it
      and re-reads; a machine that pinned neither refuses as today. Tests: the criterion's list,
      each by name.
      *Verified 2026-09-16 on the effort branch: `TABLES: [&str; 10]` with `succession`
      created on open like every table; `role::offer_ownership`, `withdraw_offer`,
      `accept_ownership`, `follow_succession`; `transfer_ownership` and `owner_key_of` gone;
      `setup::owner_key_from` one derivation with no seal branch; `cargo test --
      --test-threads=1`: `400 passed; 0 failed; 10 ignored`, with the eight named tests ok
      (the offer refused for an unset, removed, own and non-owner target; the acceptance
      re-keying with every row and certificate verifying; a second store following the
      succession; the new owner connecting a fresh machine by password alone; the founder
      refused as an administrator; a planted seal refused; the withdrawal clearing the offer
      and seal; two successions followed).*
- [x] `command.rs` and `lib.rs`: `member_offer_ownership(member_id, password)` and
      `member_withdraw_offer()` (owner), `ownership_accept(password) -> OrganizationState` (the
      offered member); `member_transfer_ownership` goes; `host.ts`, `tauri.ts`, `router.ts` and
      `query.ts` follow; `router.test.ts` pins them. The owner's own card offers `hand over
      ownership` opening the heavy surface ticket 17 built, reworded to say the other person
      accepts on their machine, and `withdraw the offer` while one stands; the you section, for
      the offered member, draws under its own legend one sentence naming the offer and an
      `accept ownership` act on a heavy form surface taking the password; `members.svelte.test.ts`
      and `area.svelte.test.ts` follow.
      *Verified: `member_offer_ownership`, `member_withdraw_offer`, `ownership_accept`
      registered in `lib.rs` and `member_transfer_ownership` gone; `router.test.ts` pins
      `member.offerOwnership`, `member.withdrawOffer`, `ownershipAccept`;
      `offer-ownership.svelte` is the renamed heavy surface; the you section draws the offer
      under its own legend with `accept ownership`; `pnpm test`: desktop `210 passed`.*
- [x] The organization context's *Chain* and *Authority* entries carry a dated correction
      saying the key is the current owner's derivation and how a succession is followed; the
      changeset's transfer paragraph is rewritten to the two acts.
      *Verified: the context's *Chain* and *Authority* entries carry 2026-09-16 corrections
      (37 added lines); the changeset's transfer paragraph is the two acts; `validate.mjs`:
      `275 artifacts checked, no failures`.*
- [x] Every string in both locales; `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test`
      pass.
      *Verified in the run's worktree: both locales, `i18n-types.ts` regenerated and folded
      in; `pnpm check` exit 0 (desktop `9309 FILES 0 ERRORS 0 WARNINGS`), `pnpm lint` exit 0,
      `pnpm test` exit 0; `cargo test`: `400 passed`.*

## Relevant areas

`apps/desktop/tauri/src/organization/{role,store,authority,session,setup,command,mod}.rs`,
`apps/desktop/tauri/src/lib.rs`, `apps/desktop/src/lib/platform/{host,tauri}.ts`,
`apps/desktop/src/lib/organization/{router,query}.ts`,
`apps/desktop/src/lib/organization/component/{members,transfer-ownership}.svelte` and a new
acceptance component, `apps/desktop/src/lib/settings/component/area.svelte`,
`apps/desktop/src/routes/settings/+page.svelte`, `apps/desktop/src/lib/i18n/{en,ar}/index.ts`,
`.aep/contexts/desktop/organization.md`, `.changeset/a-link-needs-its-code.md`, and the tests
beside each.

## Constraints

- **Read [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/plan]], *Ownership
  is handed over in two acts, and the directory re-keys*.**
- **The seal is opened only on a machine that already holds the old key by another route**,
  and the acceptance checks that before anything is rewritten.
- **Rows administrators signed are not re-signed**; their certificates are re-issued with the
  same ids so the rows stay valid. A design that re-signs them too is a return to plan.
- **[[rules/credentials]]**: the password goes in, facts come out; no key crosses.

## Notes

- *2026-09-16, at integration.* The plan spoke of re-signing every row the old owner signed
  directly; in this repository the owner signs through an ordinary certificate like every
  administrator, so re-issuing the certificates under the new key makes every existing row
  verify and the set to re-sign is the two swapped member rows. `accept_ownership` takes the
  machine's record by mutable reference, since pinning the new key is part of the act.
  `transfer-ownership.svelte` became `offer-ownership.svelte`. The child raised a mid-branch
  replica lacking the `succession` table; the table is in the schema applied on open with
  `CREATE TABLE IF NOT EXISTS`, so such a replica gains it at the next open.
