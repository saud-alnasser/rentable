---
paths:
  - apps/desktop/tauri/src/organization/**
  - apps/desktop/src/lib/organization/**
  - apps/desktop/src/lib/layout/startup.ts
use-when: "the request touches an organization, its members, their vaults, or the account it lives on"
---

# Organization

An organization is a Turso account's worth of workspaces and the people who may open them, and it
lives on the customer's own account. Built by [[efforts/819-an-organization-hosts-its-own-workspaces/spec]]
across 2026-08-30 to 2026-09-12; the spec and its plan are where every design choice here is argued,
and this file is the vocabulary and the boundaries a change has to keep.

## Language

**Organization**:
One database on the owner's Turso account, `org-<id>`, holding nine tables: the organization,
its members, its workspaces, the grants, the certificates, the invitations, the migration lease,
the machine links a member makes for their own next machine, and the register of the machines
that hold the organization. Every username in it is sealed under the content key; every authority field is
signed along a chain rooted at a key the join link pins. Every member's machine keeps a replica.
_Avoid_: "the control plane" and "the account" for it. There is no service of ours, and the
account is Turso's.

*Corrected 2026-09-16 ([[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]],
requirement 20): **no member makes a machine link.** There are still nine tables and `machine_link`
is still one of them, but it is not "the machine links a member makes for their own next machine".
The one act that makes a link of either kind is `invite::make_link`, held to `inviteMember` and
refused on the owner's own row, so the owner or an administrator makes every link from an account's
card and a member makes none. The member's own act this sentence described was built inside effort
828 and retired inside it. The ninth table, `machine`, is requirement 15's register of the machines
that hold the organization, and that half of the sentence stands.*

*Corrected 2026-09-17 ([[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]],
requirements 20 and 22): **ten tables, and the link act follows two permissions.** The entry and
the correction above both count nine; `store::TABLES` lists ten, the tenth being `succession`,
the row a handover writes when ownership is offered and completes when it is accepted (the *Chain*
entry says how it is signed and followed). And `invite::make_link` is held to `inviteMember` or
`resetPassword` (`permission::require_any`), not to `inviteMember` alone: the human's call at
converge was that whoever may take a password away may hand back the link that gives one, and the
router and the card gate the act the same way. Refused on the owner's own row still.*

*Corrected 2026-09-20 ([[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]],
requirements 14, 15 and 20, on the human's look at the closed build): **the `machine` table gates
nothing.** It is still requirement 15's register of the machines that hold the organization, and it
is read in one place: the standing line each card in the members directory carries (requirement
19). It shut the Turso way in while an owner's or an administrator's machine was connected, and it
refused a link while a machine was signed in on the account; both gates are gone, because an
account is held on as many machines as its holder signs in on. A machine still registers when it
connects, names its member at sign-in, drops them at sign-out, refreshes on every launch and leaves
on disconnect.*

**Vault**:
A member's X25519 keypair, sealed under a key Argon2id derives from their password, on their own
row. The password opens it on any machine, with or without a network; what it unseals is the
content key and every credential the member was granted. There is no escrow, no master key, and no
key that opens a vault its holder did not build, and a test tries every key an administrator holds
against every other vault to keep it so.

**Grant**:
A credential for one workspace, sealed to one member's public key. Full access is the granter's own
credential re-sealed, so an administrator grants only what they reach; read-only is minted, which
is the owner's. A grant is what says a member is in a workspace, and removing it is what says they
are not.

**Chain**:
The organization key, derived from the current owner's secret and stored nowhere, certifies the
owner and each administrator; their keys sign the rows. A row is verified against the key the link pinned,
never against one read out of the database it judges. **A certificate is retired two ways, and both
re-sign its rows first.** A reset draws a fresh vault secret, so the administrator's derived signing
key changes and their reissued certificate carries a new key; a removal writes the certificate back
with `revoked_at` set. Either way `verify` would then refuse every row the certificate ever signed,
so before it is retired the rows it signed are re-signed under the acting administrator, who already
holds authority over them: the resetting owner, or the removing owner or administrator. Reset,
removal and any future revocation share one routine for this (`store::re_sign_rows_of_certificate`)
so they cannot drift, and its limit is that a revocation re-signs the revoked certificate's rows
before it revokes. Nothing seals one member's key to another; the actor re-signs with their own.
*Corrected 2026-09-16 ([[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]],
requirement 22): **the key is the current owner's derivation, and it changes when the owner
does.** A handover is two acts (see *Authority*), and the acceptance re-keys the directory under
what the new owner's own vault derives: every certificate is re-issued under the new key with the
same id, the same member and the same signing key, so every row an administrator signed goes on
verifying and only the two rows whose roles swap are re-signed. **A machine follows a succession
rather than being told the key.** The `succession` row (`store::SuccessionRecord`) carries the key
being left and the key replacing it, and its completion is signed by the key being left, so a
machine holding the old key checks the change against what it already pinned, pins the new key in
its own record, and re-reads; a chain of handovers is a chain of such signatures and is walked link
by link (`role::follow_succession`, called from `command::state_of` when a read refuses, from the
sign-in and from the launch's resume). A machine that pinned neither end follows nothing and
refuses the rows as it refuses any it cannot verify. Nothing is read out of the database to decide
which key to trust: the offer's seal is opened only on a machine that already holds the old key,
and the succession is verified under a key the reader pinned.*

*Corrected 2026-09-14 ([[efforts/826-the-organization-and-the-way-in-are-rethought/spec]],
requirements 4, 6 and 7): what a member may do is one of seven acts (`inviteMember`,
`removeMember`, `changeRole`, `renameWorkspace`, `resetPassword`, `renameMember`,
`grantWorkspace`) carried on their signed row; the owner and an administrator hold all seven
by default and a member none. Six of them sign a row, and a member holding one signs under a
certificate the owner issues: the row carries `signing_public_key` (domain `member.v2`), the
verifying half of the key the member's own vault derives, so the owner certifies a member
widened into a signing act without ever holding their secret. Only the owner's vault derives
the organization key, so only the owner gives a signing act; a holder of `changeRole` who is
not the owner narrows anybody and widens only with `renameWorkspace`. `member_change_role`
keeps the certificate in step, issuing one on the first signing act and revoking it, rows
re-signed first, on the last.*

**Link**:
`rentable://join/...`, the organization's locator: its id, name, remote, verifying key and a
read-only credential over sealed rows. It never expires. There is one link, the organization's
own: it connects a machine, and a username and password admit a person at the wall; an
invitation is the username and a generated password handed over beside it, and the invitation
row is what expires. *Until effort 824 a link made for an invitation also carried the
invitation's half of a secret, which with the password opened a sealed payload naming the
member's row.*

*Corrected 2026-09-14 ([[efforts/826-the-organization-and-the-way-in-are-rethought/spec]],
requirements 8, 9 and 23): there are two links, and no password is handed over. The
**organization link** is the locator above; it never expires, it connects a machine, and a
username and password sign a person in at the wall. An **invitation link** is the same locator
with an invitation half, `{ id, secret }`: opened on a machine holding no organization it
connects the machine, names the organization and asks the person to choose a password, and on
choosing it they are signed in. The link's secret is one half of what opens the invited vault
and a six-character code the issuer reads out, lapsing ninety seconds after it is made, is
the other, so a link alone names the organization and opens nothing. It admits whoever opens
it first, once, and lapses after seven days; only the issuer copies it again or makes a fresh
code, and a reset is a fresh invitation link. `connect` and `disconnect` are a machine and the
organization; `sign in` and `sign out` are the member.*

*Corrected 2026-09-15 ([[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]],
requirements 1, 2 and 4): **no link but the organization's own carries a legible credential**, and
that entry's "read-only credential, it never expires" is now true of the organization link alone.
A link is five clear fields and one of two credentials: `credential: { clear }`, which is the
organization's own and carries no half, or `credential: { sealed }`, which carries a
`half: { kind, id, secret, expiresAt }` naming what stands behind it. What a sealed link holds is
the issuer's own four-week grant on the organization database and, where it opens a vault, that
vault's generated password, sealed under a key Argon2id derives from the code and the half's
secret together. The ninety-second code and the fresh-code control are gone: the seal rides in the
link's own text, because nothing reads a row before the credential is out, so one code lives as
long as its link and a fresh code would be a fresh link to re-send. A link lapses at the earlier of
seven days and its credential's own death. The previous shape is refused as a link that is not
one.*

*Corrected 2026-09-16 ([[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]],
requirement 16, which supersedes requirement 4): **the organization link is gone, and the entry
above reads for the two links that are left.** No never-expiring credential is minted, stored,
shown or accepted; `organization.link_credential_sealed` is not a column, and a replica that still
carries it opens and is never written to it again. A link is four clear fields, a sealed credential
and a required `half`, so a text with no half is refused as a text that is not a link, which is
what the organization's own shape now meets. `invite::organization_link` is `invite::locator`, the
four clear fields an invitation, a reset and a machine link seal a payload onto, and
`connect::connect` takes that locator with the credential its caller unsealed rather than reading
one off a link. What recovers an organization whose every machine is gone is the owner's Turso
account and their password (requirement 14), so the sync section shows no link at all.*
*Corrected 2026-09-17 (828, requirement 24): there is no sync section; the settings area has four
sections, and the block that held the link sits at the top of the organization section and shows
no link either.*

**Authority**:
The Platform API token a consent produced, in the keyring on the owner's machine and nowhere else.
Creating a workspace, minting, rotating and deleting need it; an owner restored on a new machine
repeats the consent for it, because no row holds it.

*Corrected 2026-09-16 ([[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]],
requirement 22): **the authority follows the account that consented and not the ownership**, so an
owner who was handed the organization holds none until they grant the consent on their own machine,
and until they do the acts that mint run on the founder's machine or not at all; the sync section
says so beside the reconnect.* *Corrected 2026-09-17 (828, requirement 24): the sync section is
gone; the Turso account block that says so, with the reconnect, is in the organization section.*

*Corrected again 2026-09-16, at review round one: **a handover is two acts, and the organization
key becomes the new owner's own derivation.** The owner offers from the account's card with their
own password (`role::offer_ownership`), which seals the outgoing key's seed to the offered member's
public key in `member.owner_seed_sealed` and writes a `succession` row signed by the key in force;
nothing else moves, and `role::withdraw_offer` takes both back. The offered member accepts from
their you section (*the account section since 828's requirement 24; corrected 2026-09-17*) on a
machine they are signed in on, with their own password
(`role::accept_ownership`): that password derives the new organization key exactly as the
founder's derived theirs, the seal is opened and **refused unless what it yields is the key this
machine pinned**, and the directory is re-keyed as the *Chain* entry describes. So an owner's way
back is their password and nothing read out of the directory, founder and transferee alike
(`setup::owner_key_from` is now one derivation and has no seal branch), and a founder who handed
over is refused as the administrator they are. The seal is the offer's carrier and nobody's
anchor; an offer refuses an account whose password is not set, because such an account has no
vault of its own to derive from. The first shape sealed the founder's seed onto the new owner's
row and left the key unchanged; a way back resting on that seal rests on the database it is meant
to judge, and a member with a full-access grant could replace it.*

## Boundaries

- **The password and the keys never cross the IPC boundary.** Every command takes a password in
  and hands facts back; the vault, the content key, the credentials and the Turso authority stay
  in Rust ([[rules/credentials]], *Client boundary*). What the web layer holds is what a screen
  draws.
- **What stands between a found link and the directory is a code, on every link there is.**
  *Corrected 2026-09-16 (requirement 16, superseding requirement 4): the exception below retired
  with the link that was it. No never-expiring credential is minted, stored, shown or accepted, so
  every sentence here about "every link but one" is now about every link, and a link with no code
  beside it reaches nothing at all. The owner's way back to an organization whose every machine is
  gone is the Turso account and their password (requirement 14), which is what the recovery copy
  stood in for. The claim below that a leak "exposes the directory until a lock-out rotates the
  database" was wrong when it was written and is corrected here as well:
  [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/evidence/research/what-a-consent-alone-can-recover]],
  finding 5, read the repository and found that **nothing rotates the organization database**. A
  lock-out rotates the workspace databases the removed member held and deliberately not the
  organization's, because the organization's rows are what a remaining member reads their re-sealed
  grant from (`organization/removal.rs`). So nothing retired that credential at all, which is the
  strongest reason the link could not stay.* *Added 2026-09-15
  ([[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], requirements 1, 2, 4
  and 5.)* Every link but one carries the credential that reads the organization database sealed
  under a six-character code and the link's own thirty-two byte secret together, so a link found in
  a chat weeks later names an organization and reads nothing: what a guesser meets is thirty-two to
  the sixth Argon2id passes, and the credential inside is a four-week grant that is dead by then
  regardless. Reading a link is a decode, with no network and no row read, and where the row behind
  it stands is judged by the act that takes the code. **The organization's own link is the
  exception and the standing risk**: it carries the never-expiring read-only credential in the
  clear, because it is what recovers the organization when every machine is gone and there is
  nobody left to read a code out. It is the owner's alone, it is handed to nobody, and a leak of it
  exposes the directory until a lock-out rotates the database. [[rules/credentials]] says the same
  thing where a credential is the subject.
- **What a member may do is what their signed row carries.** The interface draws controls from
  the session's permissions and every command refuses again on the row, through
  `MemberSession::settled` and `permission::require`; a member on a handed password reaches
  nothing else until they have chosen their own. *Corrected 2026-09-14: no password is handed
  over any more; the person chooses theirs on opening the invitation link, and the wall no
  longer knows a forced change.* *Corrected 2026-09-15: the gate is the row on this machine's
  replica and not the session opened at sign-in, so a narrowing reaches an open session within
  one heartbeat, which is how long the row takes to arrive. The session still carries the
  permissions it opened under, because that is what the interface draws from.*
- **The owner's machine is the only one with the Turso authority**, and the acts that need it,
  creating and deleting workspaces, minting read-only grants, renewing and rotating credentials,
  locking out, are refused for everybody else at the command with a sentence saying to ask the
  owner. There is no request queue. *2026-09-14: so are giving somebody a signing act, granting
  read only, deleting a workspace, and ending the owner's own sessions; every other act is a
  bit on the row, and the owner's row is written by nobody but the owner.*
- **A remembered key opens the vault on the next launch, and Rust alone reads it.** *Added
  2026-09-14 (requirements 12 and 22).* A sign-in files the member's derived key in the keyring
  (`rentable.member-key`, account `<organization id>:<member id>`, value
  `<session epoch>:<key>`), so the next launch resumes without a password; nothing under the
  data directory holds it, and a Rust test reads `remote-sync.json` and every replica for the
  bytes. Sign-out, disconnect and forgetting the organization delete the entry. The row's
  `session_epoch` moving past the filed one, which is a member ending their other sessions or
  a holder of `resetPassword` ending theirs, forgets the entry at the next launch and ends an
  open session at the next sync heartbeat, with the wall saying it was signed out from another
  machine. One username may be signed in on many machines; the epoch is the one thing they
  share. *The epoch is outside the row's signature, and that is an accepted limit (the human,
  2026-09-15): a member holding the organization credential can write another member's epoch
  and force them to the wall, which is availability rather than authority, and the same
  credential already lets them delete the row; the chain was never what stood between a member
  and that. An epoch of its own, signed and merged by maximum, is the shape that would close it.*
- **One Turso group holds one organization, and a group that holds one is connected to.** *Added
  2026-09-14 (requirement 21); corrected 2026-09-16 (effort 828, requirement 14).* The walk asks
  the group what it holds before it asks for a name: a group holding an `org-` database sends it to
  a step where the owner types the username and password they already have, and this machine joins
  the organization that is there, signed in, with every grant renewed. **Only the owner can**,
  because only their password re-derives the organization key, and that derived key is what the
  rows are judged against; the key the organization row carries is compared with it and never
  trusted. *Corrected 2026-09-16 (effort 828, requirement 22): "re-derives" is true of the founder
  alone. An owner who was handed the organization opens the same key from the seed the transfer
  sealed into their vault, because `setup::owner_key_from` reads `member.owner_seed_sealed` first
  and derives only where there is none; what their password reaches is the founder's key either
  way, which is why only the owner can. The **Authority** entry above writes it out.* *Corrected
  2026-09-17 (828, requirement 22, as reopened at review round one): the sentence before this one
  describes the first shape and contradicts the **Authority** entry it points at. `setup::owner_key_from`
  is one derivation over the secret the password unseals and reads no seal; the seal branch went
  with the reopening, and "re-derives" is true of a founder and a transferee alike, because the
  acceptance re-keyed the directory under the new owner's own derivation. Only the owner can, for
  one reason on both.* The way is
  open only while no owner's or administrator's machine has been seen in the
  last seven days, since such a machine can hand out a link, and the refusal says so and abandons
  the consent. *Corrected 2026-09-20 (828, requirements 14 and 20, on the human's look at the
  closed build): the sentence before this one is gone with the gate it describes. The way is open,
  full stop; the register is not read here and no machine shuts it. The owner is handed no link, so
  a refusal pointing at the link another machine could make left the owner outside their own
  organization with nowhere to go, and an account is held on as many machines as its holder signs in
  on. Only the owner can, still, and for the reason above.* *Nothing creates in a held group:* the
  refusal requirement 21 added stands for a create arriving by any other route. A second machine
  reconnecting by link is neither of these and succeeds as before.
- **Credentials renew on the owner's machine before they lapse, and only there.** A grant is
  minted for four weeks, and the owner's machine, the only one holding the Turso authority, renews
  every grant within a week of its expiry, best effort, after it signs in. It never blocks a
  sign-in, which works offline. An organization whose owner does not launch the application for a
  month lets its credentials lapse and stops syncing until the owner returns and reconnects, which
  is the inherent cost of having no server and is stated here rather than hidden. A renewal seals
  nothing to a member whose row reads `removed`, so a grant row replayed on its own earns nothing.
  A member who also replays their own `role=member` row flips the filter and is re-credentialed;
  that this is not closed inside the ordinary path is requirement 14's documented limitation, for
  which lock-out is the answer (F-A, ticket 28). *Corrected 2026-09-20 (828, requirement 14 as
  corrected): the owner's machines, plural. The owner connects as many machines as they sign in on,
  each holding the Turso authority through its own consent, and each renews best effort; two
  renewals that cross leave two credentials in force until they lapse, the later re-seal of the
  grant rows standing, and nothing breaks.*
- **Removal ends synchronisation and reaches into nothing.** An ordinary removal stops renewing
  and disturbs nobody; a lock-out rotates the workspaces the member held and says beforehand how
  many others stop syncing until their application collects a fresh credential, which it does
  on its own. The replica on the removed member's disk stays readable, and a test pins it.
  **A removed administrator's certificate is revoked**, so a row they newly sign under it is refused
  by every other client on read; the rows they legitimately signed are re-signed under the remover
  first (see *Chain*), so the revocation bricks nothing. Revocation ends a removed administrator's
  authority to sign anything new, and the renewal filter ticket 24 adds to
  `workspace::renew_credentials` skips a member whose row reads `removed`. Neither stops a removed
  member replaying their own old, still-validly-signed member and grant rows: an ordinary removal
  deliberately does not rotate the credential, so a determined member who kept it can flip
  themselves back, which requirement 14 records as the limit of the ordinary path and answers with
  lock-out (F-A, ticket 28).
- **A migration reaches a workspace under a lease taken at the primary**, by whichever member
  opens it, and an older build refuses a newer workspace before reading anything.
- **Live tests reach the human's account only when asked**, each creating and removing its own
  database; [[rules/testing]] under *Tests that reach a live remote* admits them, and
  [[references/turso]] under *Never run* bounds them.

## What this repository does not do

**Every person on their own Turso account.** An organization's members are made inside the
application and never touch Turso; only the owner holds a Turso account. Turso can hold members
itself, with roles, but a Turso organization with members needs the Scaler plan, 29 dollars a
month as of 2026-09-13, and its documentation says only an owner or admin may mint the
group-scoped token the consent produces, so a plain member may not be able to sign in at all
([[efforts/826-the-organization-and-the-way-in-are-rethought/evidence/research/what-an-organization-with-members-costs-on-turso]],
[[efforts/826-the-organization-and-the-way-in-are-rethought/evidence/research/what-a-turso-member-can-do-through-the-consent]]).
The application ships for people who pay nothing but their own usage, and a design that needs a
paid seat on the owner's side is the shape it exists to avoid. Declined by the human on
2026-09-13. Asked once, at the rethink that followed effort 824.
