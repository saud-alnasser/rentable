---
use-when: "deciding what a rentable link is worth to somebody who found it, or what a confirmation code can and cannot stand between a link and the organization"
---

# Question

What does a `rentable://join/` link give the person holding it and nothing else, today, and
which of the two barriers on offer, a code that is a key half or a credential that lapses,
can bound that on its own?

# Sources

- `apps/desktop/tauri/src/organization/link.rs`, read 2026-09-15 at `f56ac57a`: what a link
  carries, and the docstring's own account of what it is worth.
- `apps/desktop/tauri/src/organization/setup.rs`, same commit: the two lifetimes the first run
  mints the organization database's credentials at.
- `apps/desktop/tauri/src/organization/invite.rs`, same commit: how the invitation code seals
  the invited vault's password, and the docstring's own account of the barrier.
- `apps/desktop/tauri/src/organization/connect.rs`, same commit: what a connect records.
- `.aep/references/turso.md`, same commit: what a minted token can carry and what revokes one.
  A secondary write-up of live runs against the Platform API, dated inside it.
- `.aep/contexts/desktop/organization.md`, same commit: the vault's own description.

# Findings

**A link carries the organization database's read-only credential in the clear, whichever
kind of link it is.** *source:* `JoinLink` has five fields, `organization_id`,
`organization_name`, `verifying_key`, `remote_url` and `read_only_credential`, and an
invitation link is those five and an `invitation: { id, secret }` sixth
(`link.rs`, the struct and `for_invitation`). *observation:* the credential is base64url of
JSON, not sealed; `decode` refuses a link whose credential is blank and reads it otherwise.
*conclusion:* every link ever handed out, invitation or organization, reads the directory.

**That credential never expires.** *source:* `LINK_CREDENTIAL_LIFETIME` is `"never"`, minted
once on the first run beside the owner's four-week full-access one
(`setup.rs`, the two constants and the two mints). *source:* the link's docstring says so and
calls it a locator that does not go stale (`link.rs`, *A locator does not expire*).
*observation:* the reference records that Turso has no per-token revocation, and that the one
thing invalidating a token is rotating the database's credentials, which invalidates every
token minted for it (`references/turso`, the rotate bullet, seen live 2026-09-12).
*conclusion:* a link found a year later reads the directory as it did on the day it was sent,
until a lock-out rotates the organization database, which reissues every link.

**What the directory holds is sealed, and what seals it is a password.** *source:* every
username is sealed under the content key and every vault under a key Argon2id derives from
its holder's password; there is no escrow (`contexts/desktop/organization`, *Vault*).
*source:* the change-password form's own docstring: with no server to slow a guess down, the
password's length is the whole of what stands between a holder of the records and reading
them (`apps/desktop/src/lib/organization/component/change-password-form.svelte`).
*interpretation:* a holder of any link can pull a replica and guess every member's password
offline, for as long as they like, at Argon2id's cost per guess. The password floor is the
only bound.

**The invitation code guards the invited vault's first opening and nothing else.** *source:*
`issue` draws a vault password, a thirty-two byte link secret and a six-character code; the
link carries the secret and the row carries the password sealed under the code and the secret
together; what stands between a leaked link and that vault is thirty-two to the sixth guesses
at Argon2id at the vault's cost, and "the barrier is the derivation and not the clock"
(`invite.rs`, *The link is confirmed by a code*). *observation:* the alphabet is thirty-two
characters and the code six long, so 32^6 is about 1.07 billion. *conclusion:* the code
bounds the invited vault; it does not touch the credential in the same link, which is clear.

**A machine needs the credential before it can read anything, so a code that guards the
credential has to unseal it from the link's own text.** *source:* `connect` takes a store
already opened with the link's credential and reads the organization row out of it
(`connect.rs`, the docstring and the first read). *interpretation:* an invitation's sealed
payload can sit in a database row because the link's clear credential fetches the row; a
sealed credential cannot, since nothing fetches anything until it is unsealed. It has to ride
in the link.

**A lapse on a code cannot retire a credential once it is unsealed; a lapse on the credential
can.** *source:* `expiration` on a mint takes Turso's own duration spelling and is honoured
exactly, three days is 259200 seconds and `52w` is accepted (`references/turso`, the table of
what the live run settled). *source:* a member's own grant on the organization database is
minted for four weeks and renewed by the owner's machine
(`ORGANIZATION_CREDENTIAL_LIFETIME`, `setup.rs`; the renewal bullet in
`contexts/desktop/organization`). *interpretation:* a link that carries a member's current
four-week grant, sealed, is dead within four weeks whatever happens to the link, and the code
is what stands before that; a link that carries the never-expiring one is dead only at a
rotation.

**Who can mint what.** *source:* only the owner's machine holds the Platform API token, and
minting is refused everywhere else (`contexts/desktop/organization`, *Authority*).
*conclusion:* a member making a link for their own next machine cannot mint; what they can
carry is the credential their vault already holds.

# Conclusion

Today every link reads the organization database, forever, and the only thing between a
found link and every member's password is the password floor. A code alone bounds a leaked
link to 32^6 Argon2id guesses, the bound the invitation already accepts, and it has to ride in
the link's own text because nothing reads a row before the credential is out. A lapse on the
credential inside the link is the one hard bound available, and a member's four-week grant is
such a credential and is the one a member can carry without the Turso authority. The
organization's own link is the one credential that never lapses.

# Not checked

- Whether the KDF cost the invited vault is sealed at makes 32^6 guesses slow enough on
  current hardware; the invitation already accepts the same figure, and nothing here re-argues
  it.
- Whether a client holding the link and no vault can pull a replica through the sync path as
  opposed to the connect path; the connect path alone was read.
- What the wall does with the link's credential after a connect and before a sign-in.
