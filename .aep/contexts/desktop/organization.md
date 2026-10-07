---
paths:
  - apps/desktop/tauri/src/organization/**
  - apps/desktop/tauri/src/upgrade/**
  - apps/desktop/src/lib/organization/**
  - apps/desktop/src/lib/startup/machine.ts
  - apps/desktop/src/lib/startup/wall.ts
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
One database on the owner's Turso account, `org-<id>`, holding twenty-two tables (`store::TABLES`):
its format, the organization, the roles, the members, the certificates, the revocations, the
workspaces, the grants, the invitations, the migration lease, the machine links, the register of
the machines that hold it, the successions a handover writes, its mark, the workspace
overrides, the sign-outs of one machine, each machine's name (those two by effort 846), the
organization's signed name and each member's lock (those two by effort 851), and what each machine
runs and the floors of the organization and of each workspace (those three by effort 857). The
seven came with no change of format: `complete_schema` creates them after a pull, and the change to
format 3 came with `workspace_override`. *It read seventeen tables until effort 851 (2026-10-05),
and nineteen until effort 857.* Every username and name
in it is sealed under the content key; every authority field is signed along a chain rooted at a
key the member's machine pinned. Every member's machine keeps a replica.
_Avoid_: "the control plane" and "the account" for it. There is no service of ours, and the
account is Turso's.

**Format**:
The one `format` row, version 3, written when an organization is made. An organization made before
effort 838 has no `format` table, which is format 1, and its owner's machine upgrades it in place at
their sign-in, their resume or their connect on the Turso account: every row is judged under the
old rules, carried into this format signed from the root, and the row is written last. The runner
is `upgrade/format/runner/`; each change of format is a file or a directory under `upgrade/format/`
and is named for what it does (format 1 to 2, which roots every row in the chain of certificates,
is `chain/`; 2 to 3, which adds the `workspace_override` table and nothing else, is
`overriding.rs`), listed in order in `upgrade/format/mod.rs` with the readers that find the owner
in the format it starts from, and the version this build ships is the one after that list's
last change, which a test there holds `store::FORMAT_VERSION` to. What format 1 signed, and how it
judged a row, is `upgrade/format/signature.rs`. Nothing names `upgrade` but the organization's
session (effort 840, requirement 15).
Before the change the owner's machine writes a copy of the organization to
`backups/org-<id>/`, and to their Turso account where it holds it; a copy that cannot be taken
refuses the upgrade with `CopyNotTaken` and nothing is changed (838, requirements 13 and 14).
Every change due then runs in one transaction with the `format` row last, and **the organization is
checked before that transaction commits** (`upgrade/format/runner/walk.rs`'s `checked`, over `schema/`; 838,
requirement 15): `PRAGMA quick_check` answers `ok`, and the schema is what a fresh organization of
the format it arrives at is built with, which the last change's `Transition::built` makes on an
empty in-memory database, less the tables any change of the walk names in `Transition::kept`
(`organization_mark`). The schema is compared by structure, not statement text: each table by its
columns' names, declared types, `NOT NULL` and primary key places and by its foreign keys, every
index, SQLite's own for a constraint included, by its table, origin, uniqueness, partiality,
predicate and columns, views and triggers by their normalised statements. So the `member` table,
which the engine records with its added columns last once it is reshaped in place, compares equal
to a fresh one with nothing declared for it. `PRAGMA foreign_key_check` is not in the engine's
`pragma_list` and is logged as not checkable; the schema declares no foreign key. A check that
fails rolls the whole walk back, writes nothing, and refuses with `ShapeNotAsBuilt`, whose sentence
says to update the application and try again and that the diagnostics log says why, which it does:
`schema.notAsBuilt` names every difference. A workspace migration is checked the same way
(`organization/lease/apply.rs`).
A `format` row below 2, or none, where nothing of format 1 is left reads as 2 where the
`workspace_override` table is missing and as the shipped format where it stands, and the owner's
next sign-in finishes it. The owner
is whoever's vault derives the organization key, and nothing else on a row decides it. The upgrade runs only online, after what the machine held is pushed and a pull has
completed; otherwise nothing is written and the owner is asked for a connection. An upgrade cut short
has no row either, reads as older, and the owner's next sign-in, resume or connect finishes it from any machine. Each
certificate the upgrade issues keeps format 1's id, `cert-<member>`, and its key, so a row an old
build signs afterwards still verifies. Until the row is there a build reads nothing from it and
writes nothing to it, and says what to do: an older one waits for its owner, which a member's
machine learns by pulling first with its own grant (838, requirement 11, as the human amended it on
2026-09-26). One whose format is past this build's is judged by its floors (see *Floors*), and
refused only below its read floor, where it needs the application updated. *It said a newer number
was refused outright until effort 857.* A `format` row beside format 1's certificate table or member columns is not this
format: it reads as unfinished. The number is unsigned: rewriting it only makes the organization
refuse to open, which the credential already allows by deleting rows, and **it never makes an
upgraded organization upgraded again**. A machine that has read the organization in this format
keeps that on its own record (`HeldOrganization::format`, in `remote-sync.json`, which nothing
replicated reaches), and a machine with no such record finds a root certificate the organization
key signed, which only this format holds; either refuses the transform and writes nothing, so a
member who deletes the row, puts format 1's table and columns back and replays a promotion they
once held gains nothing by it. What is still written is the last step alone, the `format` row and
its table, where nothing of format 1 is left. Each way the upgrade stands still names its way out:
an owner whose grant on the organization database lapsed has one minted on their own account
first; changes the old build captured that an already reshaped remote refuses for good say that
disconnecting and connecting again drops them (`OrganizationChangesUnsendable`); a member whose
pull was refused over a lapsed or missing credential is told the machine needs a new link
(`OrganizationCredentialLapsed`). *It said there was no in-place migration, and that an older
organization was exported and made again, until ticket 22 of effort 838; ticket 23 added the online
condition, the pull before a member's answer and the finishing of a partial upgrade; ticket 25 made
an upgraded organization never upgraded again, which leaves a partial upgrade past its root to the
push of the machine that made it; ticket 33 added the check before the commit, with a statement
declared for each table reshaped in place, and ticket 38 made the check compare structure, which
retired the declaration.*

**Floors**:
The organization is judged as a workspace is, by a level, a read floor and a write floor in the
numbering of its changes of format, and every step that moves them is one of the two kinds
([[contexts/desktop/persistence]], *Step*, *Floors*, *Legacy number*, which say what they are).
What is the organization's: its **floor record** is the one `organization_floor` row, and it keeps
the floors of each workspace beside that workspace's `schema_version`, in `workspace_floor`, which
wins over the version where they differ, since an upgrade moves the version past every build before
857 to stop them. Its **legacy numbers** are the `format` row and `workspace.schema_version`. An
addition to the organization arrives through `complete_schema` after any member's pull, and the
first one to run records its level in `organization_floor` with both floors where they were; the
changes of format shipped before 857 still run on the owner's machine alone, as 0.20 ran them, and
anybody else meeting one waits for the owner. Data from before 857 reads as floors equal to its
format and version, with nothing written (requirement 13; the carry-over tests at the foot of
`upgrade/format/runner/mod.rs` and `organization/lease/mod.rs` open every shipped format and
workspace version, as the owner and as a member).

**Upgrade**:
The explicit act that runs an upgrade step declared after effort 857, on the organization or on one
workspace (`organization/upgrade/`, effort 857, requirements 3 and 5). It needs `upgradeData` on the
acting member's verified row, which the owner always holds, the manager role carries by default, the
member role does not, and a custom role or an override can carry; until the owner has signed in on
the build that adds the flag no certificate carries it, and a manager is refused with
`ownerNotUpdated`. A step that re-signs the organization's rows needs the owner's own key, so it is
the owner's whoever else holds the flag (`UpgradeNeedsOwner`). Its preview lists the steps it would
run, by the sentence saying what each adds or changes, and every machine it would stop or make
read-only, read off **`machine_version`**, the row each machine writes for itself with the rentable
version it runs and the step it knows on each ladder, and `machine.seen_at`: a machine seen within
seven days by member, machine name and version, one not seen since apart with the date it was, and
one that has never recorded what it runs as on a build before 857. Running it takes the lease and a
copy, runs every step in one transaction with the floor records, checked against a fresh database
before it commits, and moves a legacy number only where a floor now passes what the builds before
857 know. While an organization upgrade holds its lease, every other member's act that writes is
refused as `UpgradeUnderWay` and their machine's own rows wait for the next heartbeat (ticket 19).
An organization replica whose unsent changes an upgrade made unsendable is held, neither pushed nor
pulled, until the person discards them with a confirmed yes on the sync card (ticket 20), as a
workspace's are ([[contexts/desktop/persistence]]). No upgrade step has been declared yet, so the
first release with this act moves no floor.

**Held by a version**:
Where this build stands against a floor, as the shell is told it (`session/version.rs`): the
organization's verdict is kept on its store (`OrganizationStore::refuse_another_format`, asked after
every pull at every way in, and `standing` before any write of its own), the open workspace's on the
workspace engine ([[contexts/desktop/persistence]]), and a resume refused for its version, when no
store is open, on the organization's state (`Shared::held_by_version`). Every verdict that is not
writable crosses in the list `heldByVersion` on `OrganizationState` and on `session_replicate`'s
answer, each with the organization or the workspace it holds: **the organization's and the open
workspace's apart, the organization's first**, or the wall's refusal alone while no store is open,
and an empty list where this build may write everything open. Neither hides the other: a workspace
read-only by its version folds its writes away (`api/context.ts`, `permissionsIn`) and one past
reading meets the workspace-held screen, whatever the organization's standing, by the one routing the ways
in and the heartbeat follow (`startup/machine.ts`, `pastReading`; ticket 16). Below the write floor the organization is read-only:
every act through `as_member` that writes is refused as `OrganizationReadOnlyByVersion`, the replica
held with `PRAGMA query_only` for the act, and the shell draws the read-only notice above every
screen (`organization/component/read-only-notice.svelte`), saying nothing can be changed until
rentable is updated, with the update action in it. Below the read floor the organization is not
opened. **A refusal goes back as far as what it is about, and no further** (`startup/whose-refusal.ts`,
ticket 25): one about the organization or the member (its version, `memberGone`, a lapsed
credential and the others it lists) returns the person to the organization switcher; any other is
about one workspace, keeps the person in the organization on the workspace-held screen with the
other workspaces reachable, and a later sign-in does not reopen that workspace by itself; and a
link refused while the person is in another organization records the refusal against the linked
one and leaves them where they are. **An organization that cannot be opened, for its version or
for any other refusal, returns the person to the organization switcher**, from launch, resume,
sign-in, switching and joining, and
a short callout above that organization, while it is the chosen one, says why in the person's
language (`organization/component/switcher.svelte`); where the reason is its version, the callout
says a newer rentable upgraded it and carries the update action, since updating is the way past it.
The callout clears once that organization opens. **Joining one this machine does not hold yet** has
no place at the switcher, so a refusal of it stays on the join screen: where the reason is its
version (`organizationNewer`, `workspaceNewer`, or `organizationReadOnlyByVersion` refusing the
accept's write), the screen lands on its `outdated` step, the reason in a callout with the update
action beside it (`organization/setup/connect.ts`, `joinFailed`), and the corner's way back hands
the form back with the link and the code and leads on to the switcher; any other reason is said
alone (ticket 17). A workspace below its read floor, in an
organization that opens, meets the workspace-held screen instead ([[contexts/desktop/persistence]]).
*Effort 857, requirements 6 to 9, requirement 7 as amended at /implement.*

**Flag**:
One act the application performs for a member, on one bit of one mask. The vocabulary lives in
`packages/workspace-permission` (`FLAGS`, grouped by `FAMILIES`) and is mirrored in
`organization/role/permission.rs`, held equal by a test that reads the package source: the
organization's administration on bits 0 to 9 (`inviteMember`, `removeMember`, `assignRole`,
`renameWorkspace`, `resetPassword`, `renameMember`, `grantWorkspace`, `manageRoles`,
`overrideMember`, `manageMark`) and 18 (`upgradeData`, effort 857), the owner's acts on 10 to 17 (`createWorkspace`,
`deleteWorkspace`, `mintReadOnly`, `lockOut`, `renewCredentials`, `tursoAccount`,
`transferOwnership`, `deleteOrganization`, together `OWNER_ONLY`), and viewing, creating, editing
and deleting each record kind on 20 to 39. Arithmetic, never `&` or `^` in TypeScript: bitwise
operators keep 32 bits and bit 39 is past them. **Writing a kind needs viewing it**: no role mask
and no member's effective permissions carry a kind's add, edit or delete without its view (838,
requirement 6 as amended 2026-09-27), refused by the package's `firstWriteWithoutView`, Rust's
`refuse_write_without_view` and, first, the organization router.
_Avoid_: "act" for the flag and "permission" for the mask in the same sentence as each other.

**Role**:
A named mask of flags with a rank, and every member holds exactly one. **Owner** carries every flag,
is held by the owner alone, is a constant and never a row, and its mask is not edited. **Manager**
carries every flag but the owner's, **member** carries viewing every record kind and creating and
editing records; both are rows written with the organization and signed by the owner's root, and
their masks are editable. **Custom** roles rank strictly between member (0) and manager
(1,000,000), strictly ordered among themselves, and are made, renamed, re-masked, moved and deleted
from the settings area's organization section. Deleting one moves its holders to member and clears
their override, so they hold the member role exactly (`role/`, 838 requirements 3, 4 and 6 as
amended 2026-09-27).
_Avoid_: "administrator", which the manager replaced.

**Override**:
One mask on one member's row, empty by default, switching flags of their role for them alone: a
member's **effective permissions** are their role's mask exclusive-or'd with their override
(`permission::effective`, and `effective` in the package, one routine per language held equal by
a shared table of cases). The owner carries none. Set from the member's card by a holder of
`overrideMember`. **Assigning a role clears it** unless an override is sent with the role in the
same write (`assign_role`), and so does deleting the role the member held.

**Workspace override**:
A signed row of its own (`workspace_override`, format 3) **pinning record flags only** for one
member in one workspace they hold a grant on: `pinned`, the flags set there, and `granted`, which
of them are on. What they may do there is their effective permissions with every pinned flag set
as it is granted, whatever the layers beneath say, and then any add, edit or delete whose view
that leaves off dropped, since those layers can move (`permission::effective_in_workspace`,
`effectiveInWorkspace` in the package, held to the same shared table), then folded by the grant
(`effectiveIn`). So a workspace set read only stays read only when a write is given or taken away
across the organization. Set by `role::set_workspace_override` under the override's rules
(`overrideMember`, a rank above the member, never oneself or the owner, only flags the actor
holds, every flag pinned among them, granted within pinned, and no write without its view as the
member stands); nothing pinned deletes the row. It goes with the organization layer (another role,
the reset to the role, a deleted role, each refused where a flag pinned anywhere is one the actor
does not hold) and with the grant (a withdrawal, a removal, a deleted workspace). The session and
the members list carry each workspace's pins and permissions, and the tRPC context answers a
record procedure by the open workspace's (`api/context.ts`, `permissionsIn`). A procedure naming a
workspace answers by that one's instead: the transfer procedures (`transfer/router.ts`) take
`{ workspaceId }` through `procedure.permittedIn` (`api/trpc.ts`), which refuses with
`host.noGrant` where the member holds no grant on it, asks the member's flags folded for that
workspace, and reaches a workspace that is not open on Turso through `Context.databaseOf`, over
the shell's `workspace_query` and `workspace_batch`, without opening it here. Naming nothing, or
the open one, is the open replica as before (effort 846, requirement 15). A member's card
sets it beneath each workspace the member is in, as that workspace's permissions
(`access/component/tailoring.svelte`, the record groups of the shared switch list, folded): **what is
pinned is exactly what the switches differ on from what the member holds across the organization
when the card is saved**, so a switch turned back is unpinned, and each switch that differs is
marked. The card writes both masks through `organization.member.setWorkspaceOverride`; the
arithmetic of what the switches come to is `organization/access/access.ts` (`tailoredTo`). *Effort 838,
requirement 12 as amended a third time, tickets 53 and 54; pinned rather than switched at review
round one (ticket 55), since a switch over the layers beneath inverted when they moved. A switch
turned stayed pinned when turned back, beside a reset and a read only preset, until the fourth
amendment (ticket 57) pinned what differs and took both away.*

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

**Organization name**:
What the organization is called, sealed under the content key in two places: the unsigned
`organization.name_sealed` column a build from before effort 851 reads, and the one
`organization_name` row, signed by the root alone (`Authority::OrganizationName`). The owner sets
it at the first run and renames it from the organization tab of settings
(`setup_rename`, the owner alone, no flag), which writes both with one sealed value. A
machine reads the signed row where it verifies; one that has never seen a signed name falls back to
the column, and once it has (`name_signed` on its held entry) a missing or forged row shows the name
it holds. Where no signed row verifies, the owner's machine signs at its next sign-in, resume or
heartbeat the name its own held entry carries, never the column's, and rewrites the column to that
name where the two differ, so a member who deletes the row or rewrites the column never gets the
owner to sign their name. Each machine keeps
the name in the clear on its record entry so the wall names it before anybody unlocks, and a link
carries the name as it stood when made. *Unsigned until effort 851 (2026-10-05).*

**Lock**:
A member's standing between joining and being trusted to change anything, by effort 851
(requirements 31 to 37). An account an invitation makes, and one whose password is reset, is
locked; a locked member signs in, sets their password and views what their role shows, and every
other act is refused (`RefusalReason::Locked`) and drawn dimmed with that reason. The owner, or a
holder of `assignRole` or `overrideMember` who outranks the member, unlocks them from their card
once they have set a password (`member_unlock`); nobody unlocks themselves, and the owner is never
locked. One `member_lock` row per member, signed (`Authority::MemberLock`): a row that does not
verify reads locked. Before the owner's machine has written its backfill and the root-signed
marker (the owner's own lock row), a member with no row reads unlocked, which is how members who
had set a password before 851 carried over; after it, or on a machine that latched it
(`lock_marked`), no row reads locked, so deleting one's own row unlocks nothing; and a machine that joined by an invitation or a machine link reads each member it latched locked with no row from the first join (`own_lock_latched`, a list), without judging anybody else by it. The row is signed over the member's signing key as well (`member-lock.v2`), and a reset draws a new key, so an unlock kept from before a reset and written back reads locked. The backfill locks every member whose password is not their own, runs only after a pull that went, and never on a machine whose own member reads locked. Any role change (`role/apply.rs`) re-signs the locks of the members it moves under the actor where the actor covers them.
_Avoid_: "suspended" or "disabled", which this application does not do.

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
their role says (`effectiveIn`). **The interface makes no new read-only grant** (effort 838,
requirement 12 as amended a third time, ticket 54): read only is every add, edit and delete
turned off in the workspace override, enforced by the application. A grant minted read only before
then keeps working and renewing, reads on the card with its writes off, marked as differing from
the organization, and is granted again at full access when a write is turned back on, every write
left off then pinned off, by anybody who may grant the workspace at full access, and
withdrawn by anybody who may withdraw (`withdraw_grant`, `grant_workspace`). *Both were the
owner's alone until review round one of ticket 54, when the rule went with the lock.* A member's
card and the sheet that adds
one draw each workspace as a switch, in (a full-access grant) or out (none)
(`member/component/workspaces.svelte`, ticket 48 of effort 838), the card with the workspace's
permissions folded beneath one that is in; a workspace's own dialog draws each member the same way, from the same list
(`access/component/switches.svelte`, ticket 49), marking one tailored there *custom here*. *The owner's lock
to read only sat beneath a workspace that was in until ticket 54.*

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

**A row verifies when its certificate verifies and the row is one it may sign**
(`authority::covers`): a member row needs a flag that administers members, a rank above both the
role it names and every live certificate the member holds, every flag the row's override switches,
and a certificate that is not the member's own, or the root, and a row naming the owner's role only
the root about its own holder, with no override; a role row `manageRoles`, a rank above the role and
every flag its mask carries; a grant `grantWorkspace`, a read-only one the root; a workspace row
`renameWorkspace` or `grantWorkspace`; an invitation `inviteMember` or `resetPassword`; the mark
`manageMark`; the organization's name the root alone; a member's lock the root, or `assignRole` or
`overrideMember` with a rank above the member and a certificate not the member's own; a workspace override record flags alone and nothing granted it does not pin, about
a member who is in and not the certificate's own, and `overrideMember`, a rank above that member
and every flag it pins, or the root. So a member holding the credential who signs around a command gets no further than
their certificate: rows of the kinds its ceiling names, about people ranked below them, switching
for nobody a flag the ceiling lacks, and never their own. Which flags inside it they may switch, and
which role they may give, is the command's to refuse. A member row's signer chooses its role and its
override, and the role's mask is vouched for by the role row's own signer, so a member row is not
judged by that mask: two machines acting offline together, one widening a role while the other gives
it, leave a row every reader accepts. **A genuine member row its certificate no longer covers**,
because the role it names moved to or above the signer's rank or went on another machine, or the
member stands certified at or above the signer, **grants nothing** rather than refusing the
directory (`Chain::read_member`) and keeps its removal, and **it is never saved, only removed**: it
is content anybody holding the credential may have written, and nothing the directory holds says
which of its fields are genuine. Every act on the member but their removal, an assignment included,
is refused by name (`session::refuse_unsettled`), and so is retiring a certificate that signed such
a row until that member is removed; the removal is made by somebody ranked above the member as
certified, and the person is made an account again. A member or role row whose signature or chain
does not verify still refuses the read. **A workspace, grant, invitation or mark row that does not
verify**, under a revoked or unknown certificate or beyond what its certificate covers, **is left
out of the read and logged** (`store::read_or_left_out`, 838 ticket 25): it grants nothing either
way, and the rows beside it still read, so a removed manager's old machine pushing late, or a row
written around the command, no longer makes the directory unreadable for everybody. **A removed
member's row grants nothing**, so nothing the member role
carries refuses a removal. **The owner's own row is the owner's machine's to repair**: where it
reads as anything but the owner's role, demoted or removed from below, the machine whose vault
derives the pinned key writes it again under the root at sign-in, at resume and on the heartbeat
(`ownership::repair_owner_row`), taking the signing key and the vault's public half from what the owner's
own secret derives and opens, never from the row; no other machine writes anything. The store
refuses to write a row its signer's certificate does not cover, naming what it needs, and every
command refuses such an act by name before it writes, so no command of ours writes a row every
reader refuses.

**Every live member holds one live certificate, and a change re-issues it** (`role::reissue`): a new
certificate from the actor's own, a revocation of the old one, and every row the old one signed
re-signed under the actor, the mark and roles included, in one transaction. Where the actor could
not sign one of those rows the act is refused, naming what it needs, and nothing is written. An
assignment, an override, a role's new mask or rank, a reset and a removal all go through it. Every
issue takes a fresh id, `cert-<member>-<issued at>`, except the owner's upgrade of a format 1
organization, whose certificates keep format 1's `cert-<member>` (see *Format*).

**A flag added since the root was issued reaches the organization at the owner's first sign-in on
the build that adds it** (effort 857, ticket 15). A root carries the owner's mask as it was when it
was issued, and nothing covers a role or a certificate wider than its signer, so a new flag is in no
certificate until the owner's machine, the one holder of the organization key, issues a root with the
whole of this build's owner mask (`ownership::widen_root`, beside the repair above): in one
transaction, what the old root issued is issued again from the new one under the same ids, what it
signed is re-signed under it, and it revokes the old one; each built-in role gains the new flags its
default carries, keeping the owner's edits; and every member whose standing then reaches past their
certificate is re-issued one (`role::reissue_within`). The root's own ceiling records that it ran,
so it runs once per new flag, and an act that needs the flag before then is refused with
`ownerNotUpdated`.

**The key changes when the owner does.** A handover is two acts (see *Authority*). The acceptance
issues the new owner a root under what their own vault derives, re-signs the founder's rows under
it, and issues again from it every live certificate the founder issued to somebody else, the
founder's own among them as a manager's. The new owner's earlier certificate has its rows re-signed
under the root and is revoked, so they hold one live certificate, the root. **A machine follows a succession rather than being told the key**: the
`succession` row carries the key being left and the key replacing it, signed by the key being left,
so a machine holding the old key checks the change against what it already pinned, pins the new one
and re-reads (`ownership::follow_succession`).

**Link**:
`rentable://join/...`, the organization's locator: its id, name, remote and verifying key, a sealed
credential, and a required `half` naming what stands behind it, an invitation or a machine link.
What a link holds is the issuer's own four-week grant on the organization database and, where it
opens a vault, that vault's generated password, sealed under a key Argon2id derives from a
six-character code and the half's secret together; the code is read out beside the link. It admits
whoever opens it first, once, and lapses at the earlier of the lifetime its maker chose and its
credential's own death: one to twenty-three hours, one to six days, or a week, three days unless
changed (`lifetimeHours`). An owner's link carries a credential minted to die with it; a manager's
carries the manager's four-week grant, an accepted risk. A spent, lapsed or revoked link is refused
before anything is recorded on the machine, and the replica it pulled is deleted unless the machine
holds that organization. A link for an organization the machine already holds selects it, and is
judged on that organization's own replica with no session open: a reset link for one of its members
admits them, anything else is refused as already used. **Every link waiting to be opened is
listed for whoever could have made it and revoked there** (`invitation/outstanding.rs`, effort
851): a holder of `inviteMember` or `resetPassword` sees the links of the accounts ranked below
them, the owner every one, each with its member, what opening it does (joins, chooses a new
password, adds a machine), its maker where an invitation names one, and its lapse; a locked member
is refused both. A revoke deletes the row, so opening the link reads revoked, and the account
stays. The list is a card under the people in the organization tab (`member/component/links.svelte`),
the soonest to lapse first, its count in the header, four rows in view with the rest scrolled inside
the card, and past four a search by username.
A machine link whose row is gone reads revoked as an invitation's does; it read `Replaced` until
the revoke, since a gone row names nobody to ask whether a newer link took its place. *It lapsed
at seven days, and a spent invitation link still recorded the organization, until effort 851
(2026-10-05).* `connect` and `disconnect` are a machine and the organization; `sign in` and `sign out` are
the member. *There was an organization link carrying a never-expiring read-only credential until
828's requirement 16 retired it; what recovers an organization whose every machine is gone is the
owner's Turso account and their password.*

**Authority**:
The Platform API token a consent produced, in the keyring on the owner's machine and nowhere else,
one per organization (`org:<id>`, effort 851; [[contexts/desktop/remote-sync]]).
Creating and deleting a workspace, minting a read-only grant, locking out, renewing credentials and
the Turso account need it, and they are `OWNER_ONLY` flags besides, checked on the owner's verified
row rather than the session's snapshot (`session::Actor::require_owner`). An owner restored on a new
machine repeats the consent for it, because no row holds it. The authority follows the account that
consented and not the ownership, so an owner who was handed the organization holds none until they
grant the consent on their own machine.

**A handover is two acts, and the organization key becomes the new owner's own derivation.** The
owner offers from the account's card with their own password (`ownership::offer_ownership`), which seals
the outgoing key's seed to the offered member's public key and writes a `succession` row signed by
the key in force; `ownership::withdraw_offer` takes both back. The offered member accepts on a machine
they are signed in on, with their own password (`ownership::accept_ownership`): the seal is opened and
refused unless what it yields is the key this machine pinned, and the directory is re-keyed as the
*Chain* entry says. A founder who handed over is a manager from then on.

## Boundaries

- **The password and the keys never cross the IPC boundary.** Every command takes a password in
  and hands facts back; the vault, the content key, the credentials and the Turso authority stay
  in Rust ([[rules/credentials]], *Client boundary*). What crosses about a member is their role's
  kind, id, name and rank, their override and their effective permissions, and for each workspace
  they are in, what is pinned for them there, which of it is on, and their permissions there;
  nothing about a certificate crosses.
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
  open workspace, with what is pinned for the member there set as it is granted and a read-only
  grant's writes cleared, and the organization state is re-read on
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
- **One machine is signed out on its own by a number only the member's other machines write**
  (effort 846, requirements 9 to 11; `tauri/src/organization/session/machine.rs`). The epoch above
  ends every machine but the one moving it; `end_machine` (`session_end_machine`) instead moves
  that machine's row in `machine_sign_out` to one past the greatest it holds and stops the
  `machine` row naming the member, so it leaves the list at once, and nothing about the password
  or the epoch moves. The target compares the row with the mark it last acknowledged,
  `machine_signed_out` in its `remote-sync.json` record, which a sign-in by password or by an
  opened vault takes, at the wall after the pull it makes once the vault is open (ticket 30), and
  **a resume never does**, so the same password signs it back in. The
  comparison is made at the resume, on the heartbeat, and before every act (`acting_row`, against
  the number the open session took, which is its own member's and never a mark the record kept for
  whoever signed in here before (ticket 28), and on the id a launch draws for a record from before
  machine ids where the session resumed without one (ticket 30); since ticket 24 an act refused for it puts the wall up rather
  than waiting on the heartbeat), and a machine found above its mark takes the signed-out-elsewhere
  path. Refused: this machine itself (`NotYourself`), a machine no longer signed in as the reader
  (`MachineMissing`), and one with no `machine_name` row (`MachineNotUpdated`), which has not run
  this version and would not read its row, so *sign out all other machines* is what reaches it.
  Each machine writes its own `machine_name`, the operating system's name sealed under the content
  key. The member's list is every `machine` row naming them, with no presence window, this machine
  first and then by `seen_at`, which the heartbeat refreshes at most hourly (`SEEN_REFRESH`).
  *Unsigned, as the epoch is, and under the same accepted limit.*
- **A machine holds several organizations, and one is open at a time** (effort 851). The wall's
  switcher, signed out, picks which; `session_select` is refused while a session is open, and
  `session_remove` forgets one organization's replicas, remembered key, record entry and Turso
  consent and nothing of the others. Set up, connect-existing, an invitation and a machine link
  each add an organization and select it. Only the open organization replicates; one signed out
  elsewhere while not open shows signed out when next opened.
- **The lock is held by the member's own build, as every record flag is.** Organization acts are
  refused in Rust and record writes at the procedure, so a modified client gets past it, and anybody
  holding the database's credential can write a lock row that reads locked, which an unlock answers
  (851, *Risks*). A machine that never read the marker, and loses both the member's row and the
  marker, reads the carry-over.
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
- **A migration reaches a workspace under a lease taken at the primary**: what runs on open (the
  steps shipped before 857 and the additions), by whichever member with full access opens it, and
  an upgrade declared after 857 by the explicit act (*Upgrade*). A build below the workspace's read
  floor reads nothing of it, judged before the replica is named (`lease::refuse_newer`). The lease
  holder copies the workspace first (`backup.rs`), and a copy not taken applies nothing. The steps,
  a check of what they made (`schema/`) and the workspace's own version row, with `applied_step`
  and `data_floor` where those are owed, commit in one transaction or not at all
  (`lease/apply.rs`); the organization's record, `schema_version` and `workspace_floor`, is written
  after the commit, and where the workspace's row is already at the shipped version only the record
  is brought up. *It said an older build refused a newer workspace until effort 857 judged it by
  its floors.*
- **A damaged organization replica is rebuilt from the remote, not repaired.** `org-<id>.db` opens
  through the workspace's own `Database::open_replica`, so one the engine finds corrupt, not a
  database, or cut short is set aside as `<name>.corrupt-<ms>` with its sidecars and opened again
  empty, and the sign-in's or resume's pull fills it ([[contexts/desktop/remote-sync]]). Damage a
  query, push or pull meets after the open marks the replica through the store's watched
  connection, and its next open sets it aside the same way. What this machine wrote to it and had
  not pushed is lost, and the log says so.
- **The development seed fills the organization through the running app, never by writing rows.**
  *Effort 846, ticket 54.* Roles and members are signed along the chain and a member carries a vault
  sealed under keys only a signed-in owner's app holds, so no script can make a row the app would
  verify. `pnpm db:seed` (`apps/desktop/scripts/seed.ts`) therefore has an organization step,
  `scripts/organization.ts`, that reaches the development app over the webview's remote debugging
  port (DevTools protocol, `Runtime.evaluate` of `__TAURI_INTERNALS__.invoke`) and calls
  `role_create`, `invitation_member_create`, `workspace_create`, `workspace_grant` and the lists as
  the signed-in member does, in that order: roles, members, workspaces, grants. Each workspace it
  makes is a hosted database on the owner's Turso account, so the list is a fixed dozen and only
  the owner's machine makes them; elsewhere the refusal is said and the rest seeds. `pnpm dev`
  opens the port on Windows only (`scripts/debug-port.mjs`, read by `tauri-with-env.mjs`, 9222 or
  `RENTABLE_DEBUG_PORT`), and `build` never does. A role name, username, workspace name or grant
  already there is skipped;
  an app that is closed or signed out, or a webview with no port (macOS, Linux), is said in one
  sentence and the records seed runs regardless. `--records-only` and `--organization-only` pick a
  half. It reads no vault and no keyring.
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
