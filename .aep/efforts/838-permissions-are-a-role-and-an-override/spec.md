---
status: accepted
---

# Problem

What a member of an organization may do is one hand-edited number with a label beside it, and the
label means almost nothing.

- **A role is a starting point, not a thing.** `owner`, `administrator` and `member` pick the mask a
  row is created with (`mask_of_role` in `tauri/src/organization/permission.rs`,
  `ADMINISTRATION_BY_ROLE` in `packages/workspace-permission/index.ts`); after that a holder of
  `changeRole` edits the row's mask one act at a time (`role::change_role`). Two members both called
  "administrator" can carry different acts, and nothing in the directory says which differs from
  what, or why. Changing what every administrator may do means editing every administrator's row.
- **An organization cannot name its own kinds of people.** A landlord with a bookkeeper, a
  collector and a building supervisor has three roles in mind and two words to choose from.
- **Permissions stop at administration.** The seven acts are all about the organization's
  directory. Inside a workspace every member who holds a grant may create, edit and delete every
  complex, unit, tenant, contract and payment; the one lever is the owner minting a read-only
  grant, which is all or nothing per workspace. A collector who should record payments and never
  delete a contract cannot be expressed.
- **Only the owner can widen anyone into an act that signs rows.** Six of the seven acts write a
  signed row, and a member's first signing act needs a certificate under the organization key,
  which only the owner's password derives (`role::change_role`, the `widens` refusal). An
  administrator who manages people day to day cannot hand anybody an administrative act without the
  owner at their machine.

The cost: the owner is the bottleneck for every change to who may do what, the directory cannot
say what a person is for, and the record data has no permission model at all.

# Goal

A member's permissions are computed, the way Discord computes them, from two things an
organization can see and reason about: **the one role they hold**, a named set of flags, and **an
override on their own row**, a set of flags that changes that role for them alone. Every act in
the application, administrative or on a record, is a flag. Three roles exist in every organization
and cannot be removed: owner, manager and member. Between manager and member, an organization adds
its own roles, ranked, and whoever holds the flag to manage roles shapes them, below their own
rank, without the owner present.

# Scope

- The permission vocabulary: one flag per act, administrative and record acts alike, in one
  bitmask.
- Roles: the three built in, custom roles between manager and member, their rank, and what each
  carries.
- The per-member override and how a member's effective permissions are computed from it.
- Who may change roles, assignments and overrides, and the rule that nobody grants what they do not
  hold.
- The chain of trust that lets a manager put a signing act into effect without the owner.
- Enforcement of every flag, in the interface and at the command or router that performs the act.
- An in-place upgrade of an organization in the format that exists today, run by its owner, and a
  clear refusal of a newer format.
- A copy of the organization database taken before its format changes, and of a workspace database
  before a migration changes its schema.
- The organization's format transitions written one to a file, so the next format is one file added.
- A change of shape that commits whole with its version, is checked before it commits, and is
  tested from every version ever shipped; a corrupt local replica rebuilt from its remote.
- The surfaces in the settings area where roles are defined and a member's role and override are
  set.

# Requirements

1. **Every act is a flag.** Each act the application performs on behalf of a member, in the
   organization or in a workspace, is gated by exactly one named flag, and a member's permissions
   are one bitmask of those flags. The families are: the organization's administration (today's
   seven acts, the organization's mark, and the acts over roles and members below), and, for each
   record kind (complexes, units, tenants, contracts, payments), viewing, creating, editing and
   deleting. Ending, renewing and restoring a contract are edits of it. One vocabulary is held in
   `packages/workspace-permission` and mirrored in Rust, held together by a test, as today.
2. **Some flags are the owner's alone.** The acts that need the Turso authority (creating and
   deleting a workspace, minting a read-only grant, locking a member out, renewing credentials, the
   Turso account) and handing the organization over are flags the owner holds and that no role and
   no override can carry.
3. **Three roles exist in every organization, and none can be removed or renamed.** **Owner**
   carries every flag, is held by exactly one member (the owner), and its mask cannot be edited.
   **Manager** replaces administrator and carries every flag except the owner's. **Member** is the
   role every other member holds until given another: it carries viewing every record kind and
   creating and editing records, and no deleting and no administration. The manager's and the
   member's masks are editable, within requirement 7.
4. **An organization adds its own roles.** A holder of the flag to manage roles creates a role with
   a name and a mask, renames it, changes its mask, moves it in the ranking, and deletes it. Every
   custom role ranks above member and below manager, and custom roles are strictly ordered among
   themselves. Deleting a role moves each member who held it to member.
5. **Each member holds exactly one role.** A holder of the flag to assign roles gives a member a
   role. Assigning owner is not assignment: it remains the handover, which is the owner's.
6. **Each member may carry one override, and it changes their role for them alone.** The override
   is a bitmask, empty by default. A member's effective permissions are their role's mask
   exclusive-or'd with their override: a flag set in the override turns the role's flag off where
   the role carries it, and on where it does not. The owner carries no override. A holder of the
   flag to override members sets and clears it.
7. **Nobody reaches above themselves or grants what they do not hold.** Roles are ranked owner,
   manager, the custom roles in order, member. A member acts on a role (editing, re-ranking,
   deleting, assigning it) only where that role ranks below their own, and on another member
   (assigning their role, setting their override) only where that member's role ranks below their
   own. No member changes their own role or override. And a member changes a flag, in a role's mask
   or in anybody's effective permissions, only where they hold that flag themselves.
8. **One computation, everywhere it is asked.** A member's effective permissions are computed by one
   routine per language from the role row and the member row, and the interface, the router, every
   Rust command, and the verification of a signed row read the same answer. A change to a role or
   an override reaches an open session within one sync heartbeat, as a narrowing does today.
9. **A manager puts a signing act into effect without the owner.** Whoever holds the flag to assign
   roles or override members can give a member any flag they hold themselves, a flag that makes the
   member sign rows included, and it takes effect on the next sync, with the owner's machine off.
   The chain of trust is redesigned so that this holds while every property it protects today still
   holds (see Constraints).
10. **Every flag is enforced where the act happens.** The interface does not offer a control whose
    flag the member lacks, and says why where the control would be expected; the router or the Rust
    command refuses the act again, naming the flag. A member without a record kind's view flag does
    not see records of that kind anywhere in the application. A member on a read-only grant holds
    no create, edit or delete flag in that workspace, whatever their role says.
11. **An older organization is upgraded in place by its owner, and a newer one is refused by name.**
    An organization this build creates carries a format version. When the owner signs in, or
    resumes, on this build against an organization made by an earlier version, the owner's machine
    upgrades it before anything else is read: every member keeps the role they held
    (`administrator` becomes `manager`) and exactly what they could do, through their role and an
    override, record acts included; removed members stay removed; workspaces, grants, pending
    invitations and the mark carry across and verify. Until the owner has done this, any other
    member's sign-in, resume, connect or join reads nothing and says the organization is waiting for
    its owner to open this version. A build meeting an organization of a newer format reads nothing
    from it and says the application is to be updated. *The human's call at /plan, 2026-09-25, was
    no migration, with the one user exporting and importing. Amended 2026-09-26, the human's call on
    the running application: an update replaces the old build, and a refused organization cannot
    sign in, so an export is out of reach; the upgrade is part of the update. Settled at the
    review of tickets 22 and 23: the upgrade also runs when the owner connects on their Turso
    account; it runs only online, after what the machine held is pushed and a pull has completed,
    and otherwise writes nothing and asks the owner for a connection; a member's machine pulls first
    with its own grant and goes on once the owner has upgraded; a machine link is among the ways in
    that wait for the owner.*
12. **Roles are defined in the settings area, and a member's role and override on their card.** The
    organization section lists the roles by rank, each with its flags grouped by family, and lets a
    holder of the flag create, rename, re-rank, edit and delete them. A member's card sets their role
    and their override, and shows, flag by flag, what their role gives, what the override changes,
    and what they end up with. Where the viewer may not change something, the control says why.
13. **Nothing changes an organization's format or a workspace's schema without a copy of it first.**
    Before the owner's machine transforms the organization, and before the member holding a
    workspace's lease applies a pending migration to it, the machine writes a copy of every table
    the database holds, as it stands at that moment, to a file of its own on this machine. Where the
    machine also holds the owner's Turso account, it makes a copy of the database on that account
    too, protected from deletion. The change starts only once the local copy is written and read
    back complete. A local copy that cannot be written stops the change, writes nothing to the
    database, and says so. A copy on the account that cannot be made is logged, and the change goes
    on with the local copy. The log names where each copy is. *The human's call, 2026-09-27: both
    copies, and workspace migrations as well as the organization.*
14. **An organization's next format is one file added.** Each change of format, from one version to
    the next, is written in a file of its own and listed, in order, in one place. The upgrade walks
    that list from the format the organization is in to the one this build ships, in one
    transaction, and writes the `format` row last. What every change of format needs (finding the
    owner, the push and pull before it, the copy, the refusal of a directory that was once newer,
    the transaction and the `format` row) is written once, outside those files, and the version the
    build ships is counted from the list. *The human's call, 2026-09-27.*
15. **A change of shape commits whole with its version, or not at all, and only once checked.** A
    workspace's pending migrations, and the version they bring it to, commit in one transaction on
    the workspace database, and the version is kept in that database as well as recorded in the
    organization; a failure anywhere leaves the workspace exactly as it was, and a second attempt
    finds nothing half done. Before either change of shape commits, a workspace migration or an
    organization's change of format, the database is checked: SQLite's own structural checks
    pass, and its schema is the one a fresh database of that version is built with. A check that
    fails rolls the change back, writes nothing, and says so. *The human's call, 2026-09-27: the
    practice of Android, Room, Signal Desktop and Firefox, as [[efforts/838-permissions-are-a-role-and-an-override/evidence/research/how-updates-migrate-and-fall-back]] finds it.*
16. **Every version ever shipped is migrated in the tests.** For each workspace schema version and
    each organization format this build can meet, a test builds a database of that version with
    rows in it, walks it to the shipped version by the path the application takes, and finds the
    schema a fresh build makes and every row carried. A version shipped without such a database
    fails the tests. *The human's call, 2026-09-27, Room's practice.*
17. **A local replica found corrupt is rebuilt from its remote.** Where the engine reports a local
    replica of a workspace or of the organization corrupt, or not a database, the application
    moves the file aside, keeps it under a name that says so, logs it, and pulls the database
    again from its remote, rather than failing every open. What the damaged file held and had not
    sent is lost, and the log says so. *The human's call, 2026-09-27, Firefox's practice.*

# Acceptance Criteria

1. The package names every flag with a bit below 53 and its test still fails a 54th; a test walks
   every mutation in every router and every organization command and fails on one that names no
   flag; the Rust and TypeScript vocabularies are held equal by a test.
2. A test tries to write each owner-only flag into the manager's mask, a custom role's mask, and an
   override, as the owner and as a manager, and every write is refused; the owner's effective
   permissions contain every flag.
3. A newly created organization has exactly the three roles with the masks requirement 3 gives; a
   test tries to delete and to rename each, and to edit the owner's mask, as the owner, and each is
   refused; editing the manager's and the member's masks as the owner succeeds.
4. A test creates, renames, re-masks, re-ranks and deletes a custom role; it ranks between member
   and manager every time; after deletion every member who held it holds member and reads the
   member role's mask XOR their override.
5. Every member row names exactly one role; assigning the owner role through assignment is refused;
   a test assigns each role and reads the effective permissions back.
6. For a role mask R and an override O, a test over every role and a set of overrides reads
   effective permissions equal to R XOR O in both languages; a flag set in O turns off a flag R
   carries and turns on one it does not; the owner's row refuses an override.
7. A test, for each pair of ranks, has a holder of each management flag try to edit, re-rank,
   delete and assign a role at, above and below their own rank, and to set the role and override of
   a member at, above and below them, and of themselves: only the strictly-below cases succeed. A
   holder of every management flag who lacks one record flag tries to switch that flag in a role
   and in an override, on and off, and is refused both ways.
8. The same inputs give the same effective permissions from the TypeScript and Rust routines (a
   shared table of cases); a test narrows a signed-in member's role on one machine and their open
   session refuses the act after one heartbeat.
9. With the owner's machine offline, a manager gives a member who signed nothing before a flag that
   signs rows; after a sync the member's signed row verifies on a third machine. A member who writes
   a role row, an override, or their own member row straight into the database, around the command,
   produces rows every other machine refuses on read. Removing a member, or taking the signing flag
   away, stops rows they sign afterwards from verifying, and the rows they signed before still
   verify.
10. For each flag, a test with a member lacking it finds the control absent or disabled with its
    reason, and the router or command refusing with the flag's name; a member without a kind's view
    flag finds no records of that kind in lists, search, the dashboard, or printouts; a member on a
    read-only grant is refused every create, edit and delete in that workspace.
11. A test builds an organization in the format before this effort (an owner, an administrator
    narrowed by the owner, a member granted administration flags, a removed member, a pending
    invitation, full-access and read-only grants, a mark) and signs in as the owner on the new
    build: afterwards the organization reads as format 2, every member's effective permissions
    equal what they could do before, every row verifies on a second machine, and a half-finished
    upgrade still reads as the old format. The same organization opened first by a member is
    refused, naming the owner, and written to not at all. One carrying a newer format version is
    refused, naming the update, and written to not at all.
12. On the running application, the roles list, the role editor and a member's card show and change
    what requirement 12 says, and a control the viewer may not use says why. Checked by the human.
13. A test upgrades a format 1 organization and finds a local copy holding every table and row the
    organization held before, and none of the changes; one where the account is reachable finds a
    protected copy made on it from the organization database. A test whose local copy cannot be
    written finds the organization and the workspace unchanged and the refusal given. A test
    applies a pending workspace migration and finds the same two copies of the workspace as it was.
    A copy the account refuses leaves the change going on and a line in the log.
14. The format 1 to 2 change sits in a file of its own. The version the build ships equals the count
    of changes listed plus one, and a test fails a list that skips or repeats a version. A test
    registers a change from the shipped format to the next, under test only, and an organization
    in the shipped format is walked through it by the same upgrade, with the copy, the transaction
    and the `format` row, and no other code touched.
15. A test fails a workspace migration part way and finds the workspace at the version it started
    from, every table as it was, and a second attempt applying the whole tail. A test fails the
    check after a migration, and one after a change of format, and finds each rolled back and the
    refusal given. The workspace's version is read from the workspace database inside the
    transaction, and a test where the organization's record is behind finds nothing applied twice.
16. A test walks every shipped workspace version, seeded with rows, to the shipped version, and
    the format 1 organization to format 2, comparing each with a fresh build's schema and rows.
    Adding a migration without its seeded database fails a test.
17. A test gives the application a replica file that is not a database, and a truncated one, and
    finds each set aside, the database pulled again, and the log naming what was lost. Checked by
    the human against a real replica on the running application.

# Constraints

- **The bitmask holds 53 flags and no more.** It is one JavaScript number and one SQLite integer,
  and decision 04's guard (`packages/workspace-permission/tests/permission.test.ts`) fails at a
  54th flag, because a value past 2^53 rounds away its low bits and corrupts every row already
  written. The vocabulary this spec asks for is about forty flags.
- **What a row says about authority is signed, and verified against the key the machine pinned,
  never one read out of the database it judges.** A role row, an override and a member's role are
  authority, so each is signed, and a read meeting a row it cannot verify refuses, as every
  verified reader does today (`store.rs`, the module header; `contexts/desktop/organization`,
  *Chain*). This is what stops a member who holds the
  organization database's credential from writing themselves a wider role.
- **The redesigned chain keeps every property the current one has.** Revocation still retires a
  signer without bricking the rows they signed (`store::re_sign_rows_of_certificate` today);
  removal still ends authority; a handover still re-keys under the new owner's own derivation;
  nothing seals one member's key to another; no escrow and no master key.
- **The password and the keys never cross the IPC boundary** (`rules/credentials`). Effective
  permissions are a fact and may; a signing key may not.
- **The owner-only acts stay the owner's because of where the Turso authority is**, not because of
  a flag: it sits in one machine's keyring and in no row, so no role can deliver it. Requirement 2
  names them as flags so the owner's mask is every bit and a refusal names what was missing.
- **There is no service of ours.** Everything is computed and enforced on the members' own
  machines from the replicated organization database, offline included.

# Out of Scope

- **More than one role per member.** One role and one override, by the human's call: this is not a
  chat application, and the combination Discord allows is more flexibility than a landlord's office
  needs.
- **Per-workspace roles or overrides.** A member's permissions apply in every workspace they hold a
  grant for. Which workspaces they are in stays the grant's, as today. Discord's channel overrides
  are the thing this declines.
- **Cryptographic enforcement of record flags.** A full-access grant is a credential that writes
  anything to the workspace database; the record flags are enforced by the application, and a
  member who takes the credential to another SQLite client is not stopped by them. Read-only grants
  remain the one cryptographic limit on a workspace.
- **Hiding data at rest.** A member without a view flag does not see those records in the
  application; the rows are still in the replica on their disk.
- **Ownership-scoped flags** such as "edit only the payments I recorded".
- **An audit log** of who changed which role or override.
- **Giving anyone but the owner the Turso authority**, or the acts that need it.
- **A 54th flag**, and the row-per-flag migration decision 04 names for it.
- **Down migrations.** No client read in [[efforts/838-permissions-are-a-role-and-an-override/evidence/research/how-updates-migrate-and-fall-back]] ships them; the fallback is the
  transaction's rollback, the copy, and the rebuild from the remote.
- **Restoring a copy from inside the application.** A copy is the record to restore from, by hand
  or on the Turso account; a restore button, and deciding what a restore does to the machines that
  moved on, are a later effort's.

# Assumptions

- **Discord's model as this spec reads it**: a server owner holds every permission; `@everyone`
  is a role every member holds; roles are ranked, and a member manages only roles and members
  ranked below their highest role and grants no permission they lack; basic features (viewing a
  channel, sending, deleting others' messages) are permissions like any other
  (discord.com/developers/docs/topics/permissions). Taken as known, not researched here, because
  the spec departs from it deliberately wherever the human chose (one role, an XOR override, no
  channel overrides).
- **The override is XOR, by the human's call**, with the drift under Risks shown before the choice
  was made.
- **The member role's default** (view everything, create and edit records, delete nothing,
  administer nothing) is this spec's reading of "normal basic permissions" and is the human's to
  correct.
- **A trust chain that lets a manager certify a signer is buildable** within the constraints above,
  as delegation: a certified signer certifies others for no more than they hold, and a row is
  verified by walking to the organization key. `plan.md` sets the design out against the chain as
  the code has it; the design is argued, not prototyped.

# Risks

- **An XOR override drifts when its role changes.** An override stores differences, so when a
  role's mask gains a flag a member's override had turned on, that member loses it; when a role
  loses a flag the override had turned off, the member gains it. Moving a member to another role,
  or deleting their role, re-reads their override against a different mask. The member's card
  showing role, override and result flag by flag is the mitigation; it does not remove the effect.
- **The chain redesign is security-critical.** A mistake in it lets a member who holds the database
  credential sign themselves authority, which is the attack the current chain exists to stop.
- **Record flags look like security and are not.** A reader of the roles screen may believe a
  member without the delete flag cannot delete; they cannot in the application, and can with the
  credential and another tool. The out-of-scope entry states it; the interface should not imply
  more.
- **A machine on an older build refuses the new organization's rows** as rows it cannot verify,
  because a delegated certificate is not signed by the organization key. Accepted: there is one
  user, and the format version is what makes the next break a clear refusal instead.
- **Deleting a signed row is still possible.** Anybody holding the organization database's
  credential can delete a revocation and so revive a certificate, or replay an older signed row,
  as they can delete any row today. There is no server to hold the latest state; this is the
  limit `contexts/desktop/organization` already records, and this effort does not close it.
