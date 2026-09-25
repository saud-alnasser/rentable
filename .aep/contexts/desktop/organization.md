---
paths:
  - apps/desktop/tauri/src/organization/**
  - apps/desktop/src/lib/organization/**
  - apps/desktop/src/lib/layout/startup.ts
use-when: "the request touches an organization, its members, their roles and permissions, their vaults, or the account it lives on"
---

# Organization

An organization is a Turso account's worth of workspaces and the people who may open them, and it
lives on the customer's own account. Built by [[efforts/819-an-organization-hosts-its-own-workspaces/spec]]
across 2026-08-30 to 2026-09-12, rethought by 826 and 828, and given roles and a delegated chain by
[[efforts/838-permissions-are-a-role-and-an-override/spec]] on 2026-09-25. The specs and their plans
are where every design choice here is argued; this file is the vocabulary and the boundaries a change
has to keep.

*Rewritten 2026-09-25 by effort 838 rather than corrected in place: the chain, the roles and the
permissions it described before (an organization key certifying every administrator, seven acts on
a member's row, a revocation as an unsigned column) no longer exist, and a correction under each
sentence would have left a reader to assemble the present from the past. The entries that did not
change, the link and the Turso account, keep their history.*

## Language

**Organization**:
One database on the owner's Turso account, `org-<id>`, holding fourteen tables (`store::TABLES`):
its format, the organization, the roles, the members, the certificates, the revocations, the
workspaces, the grants, the invitations, the migration lease, the machine links, the register of
the machines that hold it, the successions a handover writes, and its mark. Every username and name
in it is sealed under the content key; every authority field is signed along a chain rooted at a
key the member's machine pinned. Every member's machine keeps a replica.
_Avoid_: "the control plane" and "the account" for it. There is no service of ours, and the
account is Turso's.

**Format**:
The one `format` row, version 2, written when an organization is made. A build meeting an
organization with no format row, or with a newer one, reads nothing from it and writes nothing to
it, and says what to do: an older organization is exported workspace by workspace, deleted, and
made again here; a newer one needs the application updated (838, requirement 11). There is no
in-place migration. The number is unsigned: rewriting it only makes the organization refuse to
open, which the credential already allows by deleting rows.

**Flag**:
One act the application performs for a member, on one bit of one mask. The vocabulary lives in
`packages/workspace-permission` (`FLAGS`, grouped by `FAMILIES`) and is mirrored in
`organization/permission.rs`, held equal by a test that reads the package source: the
organization's administration on bits 0 to 9 (`inviteMember`, `removeMember`, `assignRole`,
`renameWorkspace`, `resetPassword`, `renameMember`, `grantWorkspace`, `manageRoles`,
`overrideMember`, `manageMark`), the owner's acts on 10 to 17 (`createWorkspace`,
`deleteWorkspace`, `mintReadOnly`, `lockOut`, `renewCredentials`, `tursoAccount`,
`transferOwnership`, `deleteOrganization`, together `OWNER_ONLY`), and viewing, creating, editing
and deleting each record kind on 20 to 39. Arithmetic, never `&` or `^` in TypeScript: bitwise
operators keep 32 bits and bit 39 is past them.
_Avoid_: "act" for the flag and "permission" for the mask in the same sentence as each other.

**Role**:
A named mask of flags with a rank, and every member holds exactly one. **Owner** carries every flag,
is held by the owner alone, is a constant and never a row, and its mask is not edited. **Manager**
carries every flag but the owner's, **member** carries viewing every record kind and creating and
editing records; both are rows written with the organization and signed by the owner's root, and
their masks are editable. **Custom** roles rank strictly between member (0) and manager
(1,000,000), strictly ordered among themselves, and are made, renamed, re-masked, moved and deleted
from the settings area's organization section. Deleting one moves its holders to member
(`role.rs`, 838 requirements 3 and 4).
_Avoid_: "administrator", which the manager replaced.

**Override**:
One mask on one member's row, empty by default, switching flags of their role for them alone: a
member's **effective permissions** are their role's mask exclusive-or'd with their override
(`permission::effective`, and `effective` in the package, one routine per language held equal by
a shared table of cases). The owner carries none. Set from the member's card by a holder of
`overrideMember`.

**Rank**:
How high a role stands: the owner 2,000,000, the manager 1,000,000, the custom roles between, the
member 0. **Nobody acts on a role or a member at or above their own rank, nobody changes their own
role or override, and nobody changes a flag they do not hold** (838, requirement 7): every bit that
differs between the before and the after, in a role's mask or in anybody's effective permissions,
is one the actor holds, and no `OWNER_ONLY` bit is set anywhere but the owner. Checked at the
command, where the before and the after are both in hand.

**Mark**:
The one image an organization prints at the foot of its receipts and schedules: a signature or a
seal, PNG, JPEG or WebP, up to 512 KB. One row of `mark`, the image sealed under the content key
like a name and signed under the certificate of whoever set it, which must carry `manageMark`.
Every member reads it from the replica, offline included, and a row whose signature does not
verify, written around the command by anybody holding the database's credential, is read as no
mark and never printed. Checked by its first bytes, never its file name, and read from the path the
open dialog chose, so the image does not cross IPC on its way in.
_Avoid_: "logo" or "letterhead", which the organization does not keep.

**Vault**:
A member's X25519 keypair, sealed under a key Argon2id derives from their password, on their own
row. The password opens it on any machine, with or without a network; what it unseals is the
content key and every credential the member was granted, and the secret it holds derives the key
the member signs rows with. There is no escrow, no master key, and no key that opens a vault its
holder did not build.

**Grant**:
A credential for one workspace, sealed to one member's public key. Full access is the granter's own
credential re-sealed, so whoever grants gives only what they reach; read-only is minted, which is
the owner's. A grant is what says a member is in a workspace, and removing it is what says they are
not. On a read-only grant a member holds no create, edit or delete flag in that workspace, whatever
their role says (`effectiveIn`).

**Chain**:
*Built by effort 838 ([[efforts/838-permissions-are-a-role-and-an-override/spec]], requirement 9;
[[efforts/838-permissions-are-a-role-and-an-override/plan]], Architecture, "The chain").* A
**certificate** names a member's signing key, the certificate that issued it, a **ceiling** (the
flags its holder may sign for: their effective permissions when it was issued) and a **rank** (their
role's), all under its issuer's signature. **Only the owner's certificate is a root**, signed by the
organization key, which the current owner's vault derives and nothing stores. Every other one is
signed by its issuer's key, so a manager certifies a member without the owner's machine. A reader
walks from a row's certificate to the key it pinned, and at each link refuses one its issuer did not
sign, one reaching wider than its issuer, one not ranked below it, and one whose issuer holds no
flag that administers members; a cycle and a walk past sixteen are refused (`authority::Chain`).
Nothing reads a key out of the database it judges.

A **revocation** is a signed row: a certificate is revoked when a revocation its revoker signed
names it or any certificate above it, and the revoker must be the root or outrank what it revokes.
A revocation still counts once its revoker is revoked, or removing a manager would reinstate every
certificate they retired.

**A row verifies when its certificate verifies and the row is one it may sign** (`authority::covers`):
a member row needs a flag that administers members, a rank above the member's role, every flag the
row's effective permissions carry, and a certificate that is not the member's own, or the root, and
a row naming the owner's role only the root about its own holder, with no override; a role row
`manageRoles`, a rank above the role and every flag its mask carries; a grant `grantWorkspace`, a
read-only one the root; a workspace row `renameWorkspace` or `grantWorkspace`; an invitation
`inviteMember` or `resetPassword`; the mark `manageMark`. So a member holding the credential who
signs around a command gets no further than their certificate: rows of the kinds its ceiling names,
about people ranked below them, giving nobody a flag the ceiling lacks, and never their own. Which
flags inside it they may switch is the command's to refuse. The store refuses to write a row its
signer's certificate does not cover, naming what it needs, and every command refuses such an act by
name before it writes, so no command of ours writes a row every reader refuses.

**Every live member holds one live certificate, and a change re-issues it** (`role::reissue`): a new
certificate from the actor's own, a revocation of the old one, and every row the old one signed
re-signed under the actor, the mark and roles included, in one transaction. Where the actor could
not sign one of those rows the act is refused, naming what it needs, and nothing is written. An
assignment, an override, a role's new mask or rank, a reset and a removal all go through it. Every
issue takes a fresh id, `cert-<member>-<issued at>`.

**The key changes when the owner does.** A handover is two acts (see *Authority*). The acceptance
issues the new owner a root under what their own vault derives, re-signs the founder's rows under
it, and issues again from it every live certificate the founder issued to somebody else, the
founder's own among them as a manager's. The new owner's earlier certificate has its rows re-signed
under the root and is revoked, so they hold one live certificate, the root. **A machine follows a succession rather than being told the key**: the
`succession` row carries the key being left and the key replacing it, signed by the key being left,
so a machine holding the old key checks the change against what it already pinned, pins the new one
and re-reads (`role::follow_succession`).

**Link**:
`rentable://join/...`, the organization's locator: its id, name, remote and verifying key, a sealed
credential, and a required `half` naming what stands behind it, an invitation or a machine link.
What a link holds is the issuer's own four-week grant on the organization database and, where it
opens a vault, that vault's generated password, sealed under a key Argon2id derives from a
six-character code and the half's secret together; the code is read out beside the link. It admits
whoever opens it first, once, and lapses at the earlier of seven days and its credential's own
death. `connect` and `disconnect` are a machine and the organization; `sign in` and `sign out` are
the member. *There was an organization link carrying a never-expiring read-only credential until
828's requirement 16 retired it; what recovers an organization whose every machine is gone is the
owner's Turso account and their password.*

**Authority**:
The Platform API token a consent produced, in the keyring on the owner's machine and nowhere else.
Creating and deleting a workspace, minting a read-only grant, locking out, renewing credentials and
the Turso account need it, and they are `OWNER_ONLY` flags besides, checked on the owner's verified
row rather than the session's snapshot (`session::Actor::require_owner`). An owner restored on a new
machine repeats the consent for it, because no row holds it. The authority follows the account that
consented and not the ownership, so an owner who was handed the organization holds none until they
grant the consent on their own machine.

**A handover is two acts, and the organization key becomes the new owner's own derivation.** The
owner offers from the account's card with their own password (`role::offer_ownership`), which seals
the outgoing key's seed to the offered member's public key and writes a `succession` row signed by
the key in force; `role::withdraw_offer` takes both back. The offered member accepts on a machine
they are signed in on, with their own password (`role::accept_ownership`): the seal is opened and
refused unless what it yields is the key this machine pinned, and the directory is re-keyed as the
*Chain* entry says. A founder who handed over is a manager from then on.

## Boundaries

- **The password and the keys never cross the IPC boundary.** Every command takes a password in
  and hands facts back; the vault, the content key, the credentials and the Turso authority stay
  in Rust ([[rules/credentials]], *Client boundary*). What crosses about a member is their role's
  kind, id, name and rank, their override and their effective permissions; nothing about a
  certificate crosses.
- **What stands between a found link and the directory is a code, on every link there is.** A link
  found in a chat weeks later names an organization and reads nothing: what a guesser meets is
  thirty-two to the sixth Argon2id passes, and the credential inside is a four-week grant that is
  dead by then regardless. Nothing rotates the organization database itself; a lock-out rotates the
  workspace databases the removed member held.
- **A member's permissions are read from their verified row, at every gate.** Every Rust command
  re-reads the acting row and its role, and refuses naming the flag, the rank, or the member
  themselves; every tRPC procedure names its flag in its meta and refuses an identity lacking it, a
  test walking the router failing on one that names none; the interface offers a control only where
  the flag is held and says why where it is not. The context's permissions are the row's for the
  open workspace, with a read-only grant's writes cleared, and the organization state is re-read on
  every sync heartbeat, so a change to a role or an override reaches an open session within one.
- **Record flags are enforced at the procedure, not by the chain.** Records live in workspace
  databases the whole-database credential reaches, so a member who holds it can read or write
  around the router; what the flags guarantee is what the application offers and performs. Hiding
  data at rest is not a thing this application does (838, *Out of Scope*).
- **The owner's machine is the only one with the Turso authority**, and the owner is the only
  member whose row names the owner's role; the `OWNER_ONLY` acts are refused for everybody else at
  the command with a sentence saying to ask the owner. There is no request queue.
- **A remembered key opens the vault on the next launch, and Rust alone reads it.** A sign-in files
  the member's derived key in the keyring (`rentable.member-key`, account
  `<organization id>:<member id>`, value `<session epoch>:<key>`), so the next launch resumes
  without a password; nothing under the data directory holds it. Sign-out, disconnect and
  forgetting the organization delete the entry. The row's `session_epoch` moving past the filed one
  forgets the entry at the next launch and ends an open session at the next sync heartbeat. *The
  epoch is outside the row's signature, and that is an accepted limit (the human, 2026-09-15): a
  member holding the organization credential can write another member's epoch and force them to the
  wall, which is availability rather than authority.*
- **One Turso group holds one organization, and a group that holds one is connected to.** A group
  holding an `org-` database sends the walk to a step where the owner types their username and
  password, and this machine joins the organization that is there. **Only the owner can**, because
  only their password derives the organization key the rows are judged against; the key the
  organization row carries is compared with it and never trusted. Nothing creates in a held group.
- **Credentials renew on the owner's machines before they lapse, and only there.** A grant is minted
  for four weeks and renewed within a week of its expiry, best effort, after the owner signs in; it
  never blocks a sign-in. An organization whose owner does not launch the application for a month
  lets its credentials lapse and stops syncing until the owner returns, which is the inherent cost
  of having no server. A renewal seals nothing to a removed member.
- **Removal ends a member's authority and reaches into nothing else.** Their certificate is revoked
  through the re-issue, so a row they newly sign under it is refused by every other client, and the
  rows it signed are re-signed under the remover first; a removal whose departing certificate signed
  a row the remover could not sign is refused by name. An ordinary removal stops renewing and
  disturbs nobody; a lock-out, the owner's, rotates the workspaces the member held. The replica on
  the removed member's disk stays readable, and neither stops a removed member replaying their own
  old, still validly signed rows over a credential they kept, which lock-out answers.
- **What deleting does is the limit of every signature.** A member who can write the database can
  delete rows they cannot forge, a revocation included, which reinstates what it revoked; the answer
  is Turso's point-in-time restore, on the customer's account.
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

**Many roles per member, or permissions per workspace.** One role and one override per member,
across the whole organization, by the human's call at 838's specify: less flexible than Discord's
roles on purpose, because this is not a chat application.
