---
status: resolved
blocked-by: ['03', '06', '10']
---

# feat(organization): the invitation link is confirmed by a code

## Outcome

Inviting and resetting produce a link and a six-character code that lapses ninety seconds
after it is made; the issuer makes a fresh one from the pending row; the person opening the
link types the code beside the password they choose, and a wrong, lapsed or missing code opens
nothing, by name. The code is a key half: the vault's password is sealed under the link's
secret and the code together, so the link alone opens nothing.

## Acceptance Criteria

Traces requirement 23 of [[efforts/826-the-organization-and-the-way-in-are-rethought/spec]],
and its criterion 23.

- [x] `invite::issue` draws the vault password, a 32-byte link secret and a six-character code
      from the 32-symbol alphabet the plan names; the link's invitation half carries the link
      secret; the `invitation` row gains `code_seal BLOB` and `code_expires_at INTEGER`
      outside its signature, `code_seal` being the vault password sealed under the key
      `derive_member_key(code, salt = the first 16 bytes of the link secret, SHIPPING_KDF)`
      with the invitation id and the expiry as AAD; `sealed_secret` seals the password and
      the link secret together; consuming clears `code_seal`; `forget::OldShape` gains a
      variant for an `invitation` table without `code_seal` with a startup test; the
      seven-tables pin in `store.rs` follows.
- [x] `Invited` carries `code` and `code_expires_at`, ninety seconds from `now`;
      `invite::invitation_code(store, session, invitation_id, now)` unseals the issuer's copy,
      draws a fresh code, rewrites `code_seal` and `code_expires_at`, pushes and answers
      `{ code, expires_at }`, and refuses anybody but the issuer as `invitation_link` does.
      Asserted in `invite.rs`.
- [x] `join::accept` takes the code: a lapsed `code_expires_at` is refused as lapsed, a wrong
      code fails to open `code_seal` and is refused with "the code is wrong or has lapsed; ask
      whoever invited you for a fresh one", a missing code is `InvalidInput`, and the right
      code opens the password and the rest is ticket 03's path. A test in `join.rs` shows the
      link's secret alone opens neither `code_seal` nor the vault, and that a rewritten
      `code_expires_at` opens nothing. The secrecy sweep in `join.rs` adds the code and the
      vault password to what it sweeps for.
- [x] `command.rs`, `host.ts`, `platform/tauri.ts` and `organization/router.ts` carry
      `invitation_code(invitation_id)` under `inviteMember` and `invitation_accept(link, code,
      password)` public with a six-character `code`; `router.test.ts` pins them;
      `member.reset` answers the code as `member.invite` does.
- [x] The invite result panel shows the link, then the code large beside the seconds it has
      left and a "fresh code" control calling `invitation.code`; the issuer's pending row
      opens the same panel from its code action; `invite-form.svelte.test.ts` and the members
      section's test assert the code, the countdown and the control, and that a non-issuer
      sees no code action.
- [x] The connect screen's password step carries the code field above the password, six
      characters, upper-cased as typed; the two refusals are shown by name;
      `join-screen.svelte.test.ts` asserts the field and both refusals.
- [x] Every new string is written in both locales; `pnpm check`, `pnpm lint`, `pnpm test`
      and `cargo test` pass; a changeset rides with the change.

## Relevant areas

`apps/desktop/tauri/src/organization/{invite,join,link,store,forget,command,vault}.rs`;
`apps/desktop/src/lib/organization/component/{invite-form,join-screen,members}.svelte`,
`organization/{join,router,query,dialogs.svelte}.ts`, `platform/{host,tauri}.ts`,
`i18n/{en,ar}/index.ts`, and the tests beside them.

## Constraints

- **Read [[efforts/826-the-organization-and-the-way-in-are-rethought/plan]], *The invitation
  link is confirmed by a code that is a key half*.**
- **The vault is built exactly as today**, under the generated password; only what wraps that
  password changes. `signer_of`, the certificates and the member signature do not move.
- **[[rules/credentials]]**: the code crosses once, typed, as the password does; the link
  secret crosses inside the opaque link string; neither is written under the data directory.
- **The expiry is the row's against the person's clock**; the barrier is the derivation, and
  no test may rely on the clock for the refusal a wrong code gets.

## Notes

Built by an implementer and landed on 2026-09-14. Departures: `invitation_code` takes
`kdf_params` as a fourth argument so tests derive at the cheap fixture, `command.rs` passing
`INVITED_KDF`, which is `SHIPPING_KDF`; a lapsed code is `PreconditionFailed` and a wrong one
`Forbidden`, two kinds so the connect screen names the two refusals in the reader's own
language, keeping Rust's sentence as the detail beneath; Rust refuses only a blank code as
`InvalidInput` and any other length fails the AEAD, the router refusing anything but six
before a round trip; `store::write_invitation_code` is an unsigned `UPDATE` since both columns
sit outside the signature; `vault.rs` gained `seal_under_member_key`/`open_under_member_key`
under a domain of their own; the five test-only `secret_of` helpers became a shared
`invite::vault_password_of` opening the code seal the way a person does.

**A link alone no longer names the invited person.** Requirement 8 said opening a link names
the organization and the username, which meant `inspect` opening the invited vault with the
link's secret; requirement 23 makes that secret one half of what opens it, so `inspect` no
longer tries, `LinkFacts.invitation` is always `null` for an invitation link, and the connect
screen draws the username line only where there is one. Requirement 8 and criterion 8 were
amended on landing to say so, dated.

Raised, not taken: `invitation_code` does not refuse a consumed invitation, which the pending
row never offers; `InvitedFacts` and `LinkFacts.invitation` are vestigial and are ticket 12's
to delete; the countdown is a per-second interval in the one panel; `joinFailed` reads meaning
into two error kinds, and a third refusal on that step wants a discriminant on the Rust error.
