---
use-when: "building a ticket in effort 838 and the approach is not obvious from the spec"
---

# Architecture

Three layers, each with one job, and each of the spec's requirements lands in exactly one of them.

1. **The vocabulary** (`packages/workspace-permission`, mirrored in `permission.rs`): every flag, its
   family, which are the owner's, the built-in roles' default masks, and the one computation
   `effective(roleMask, override) = roleMask XOR override`, with the owner's answer fixed at every
   flag. Pure arithmetic, no I/O, the same table of cases run in both languages.
2. **The chain of trust** (`authority.rs`, `store.rs`): what makes a row *authority* rather than a
   claim. It is rebuilt as **delegated certificates with a signed ceiling**, below. This is the only
   layer that is cryptographic, and it answers "may this signer have written this kind of row about
   this person", never "which exact flags did they change".
3. **The gates**: the Rust command for every organization act, the tRPC procedure for every record
   act, and the interface. Requirement 7's precise rule (strictly below, never yourself, only flags
   you hold) is enforced here, at write time, where the before and the after are both in hand.

## The chain: delegated certificates with a signed ceiling

Today a certificate is a bare licence to sign: `authority::verify` checks the row's signature, the
certificate's signature by the pinned organization key, and that `revoked_at` is empty
(authority.rs:532-563), and nothing asks whether the signer may write *that* row. Any certified
member can sign any row straight into the database, their own wider member row included, and
`revoked_at` is unsigned, so a revocation can be undone by writing a column. Only the owner can
certify, because a certificate is signed by the organization key.

After this effort:

- **Every live member holds exactly one live certificate**, not only those with a signing act, so
  the `signs_rows` / `SIGNS_NOTHING` special case retires. A certificate (`certificate.v2`) signs:
  `id`, `member_id`, `signing_public_key`, `issuer_certificate_id` (absent for a root certificate),
  `ceiling` (the holder's effective permissions when it was issued), `rank` (their role's rank) and
  `issued_at`. Every issue takes a fresh id (`cert-<member>-<issued_at>`), so an older, wider
  certificate is a different row that a revocation names, not a version of this one.
- **Only the owner's certificate is a root**, signed by the organization key, ceiling every flag,
  rank the owner's. Every other certificate is signed by its issuer's signing key, the key the
  issuer's vault derives (`AdministratorKey`, setup.rs:112-113), which is already certified and
  already under signature on every member row.
- **A certificate verifies by walking to the pinned key.** Each link: the signature by the issuer
  (the pinned organization key at a root), the issuer itself not revoked, `ceiling ⊆
  issuer.ceiling`, `rank < issuer.rank`, and the issuer's ceiling holding at least one of the
  member-administration flags (below). The walk refuses a cycle and a depth past 16, and never
  reads a key out of the database it judges.
- **A revocation is a signed row** in a new `revocation` table: `certificate_id`,
  `revoker_certificate_id`, `revoked_at`, signed by the revoker, who must verify and must outrank
  the revoked certificate (or be the root). `administrator_certificate.revoked_at` is no longer
  read. A certificate is revoked when a verified revocation names it or any certificate above it.
- **A row verifies when its certificate verifies and the row is within it.** The second half is a
  table from row kind to what the certificate must carry, in `authority.rs`:

  | Row | The signing certificate must |
  | --- | --- |
  | `member` | hold any of `inviteMember`, `removeMember`, `assignRole`, `overrideMember`, `renameMember`, `resetPassword`, outrank the member's role, hold every flag the row's override switches, and not be the row's own member's; or be the root |
  | `role` | hold `manageRoles`, outrank the role's rank, and hold every flag its mask carries; the manager role is therefore the root's alone |
  | `certificate`, `revocation` | the walk above |
  | `grant` | hold `grantWorkspace`; a read-only grant, the root |
  | `workspace` | hold `renameWorkspace` or `grantWorkspace`; creating one is the root's by where the Turso authority is |
  | `invitation` | hold `inviteMember` or `resetPassword` |
  | `mark` | hold `manageMark` |
  | `succession` | the organization key, unchanged |

  So a member holding the organization database's credential who signs around a command gets no
  further than their certificate: rows of the kinds its ceiling names, about people ranked below
  them, switching for nobody a flag the ceiling does not carry, and never their own row. That is
  the cryptographic bound. Which flags inside it they may switch, where the before and the after are
  both in hand, is the command's.

  *Corrected 2026-09-25 at /implement's review, round one (return to plan, the row-kind table
  only; the requirements and the approach are unchanged). The table left the flags a row carries to
  the command, and the correctness review proved what that let through: a member holding a
  certificate wrote their own member row with a wider override and it verified everywhere; the next
  unrelated role edit re-issued their certificate with that width as its ceiling; and a manager
  wrote a role row carrying `grantWorkspace` and `createWorkspace`, flags their own ceiling lacked,
  which every reader accepted. Criterion 9 asks that an override or a member's own row written
  around the command be refused on read, which the table as written could not do. The member row is
  now bounded by the ceiling in what it gives and refused to its own member's certificate, and the
  role row by the ceiling in its mask.*

  *Corrected again 2026-09-25, on the human's decision after review round two (the row-kind table
  only). Bounding a member row by its whole effective permissions judged it by the role's mask as
  it stands now, so two machines acting offline together bricked the directory: the owner widened
  the member role on one while a lead invited on the other, and the lead's row for the new member
  was then wider than the lead's ceiling on every reader. A member row's signer chooses two things,
  the role and the override; the role's mask is vouched for by the role row's signer and bounded by
  theirs. So a member row is bounded by the ceiling in the flags its override switches, and still
  refused to its own member's certificate; assigning a role wider than oneself is refused at the
  command, as requirement 7 puts it, and criterion 9's cases (an override, a role row, one's own
  row, written around the command) are still refused on read. A member row a certificate no longer
  covers, as a concurrent rank move leaves one, grants nothing on read rather than refusing the
  directory. A removed member's row grants nothing, so a removal is never refused for what the
  member role carries.*

  *And again, on the focused review of that change: an uncovered row's content is never carried
  forward as authority. A rename that re-signed one kept the role a non-covering signer had named,
  so a forged promotion became real under whoever renamed next, a flag they lacked included. So an
  uncovered row is saved only by assigning its role (with an override, where one is given), by an
  actor who holds every flag the result gives, as though the member held nothing before; every
  other act on it is refused by name; an assignment tolerates a row naming a role that is gone;
  and an uncovered row that says the member was removed reads as removed, fail-safe, and is
  restored by such an assignment, which a covered removal still does not allow.*

  *And finally, on the re-check of that: saving an uncovered row by an assignment still carried
  forward what a forger had written on it, a lifted removal and a signing key of the forger's own
  that the new certificate then named at the member's rank. An uncovered row is content anybody
  holding the credential may have written, and nothing the directory holds says which of its fields
  are genuine. So an uncovered row is never saved: every act on it is refused by name but its
  removal, by an actor outranking the member's certified rank, after which the person is made an
  account again. The owner's machine still repairs the owner's own row, taking the signing key and
  the vault from what the owner's own secret opens and derives, never from the row. The rows this
  costs are the rare ones a concurrent rank move or a role's deletion leaves; the common race, a
  role's mask widened beside an invitation, leaves none.*
- **Order is well-founded and not circular.** Certificates verify from the pinned key alone; role
  rows verify from certificates; member rows verify from certificates and the role rows they
  name. No row authorizes its own signer.
- **What a change does to certificates.** Whoever changes a member's effective permissions or rank
  (assigning a role, setting an override, editing the mask of their role, re-ranking it, resetting
  their password) issues them a fresh certificate from their own and revokes the old one, in the
  same act, and re-signs under their own certificate the rows the old one signed. Where the old
  certificate issued others, those whose ceiling or rank no longer fits under their issuer are
  re-issued by the actor too. **Where a row the old certificate signed is one the actor's own
  ceiling could not sign, the act is refused**, naming the flag the actor would need: re-signing a
  grant needs `grantWorkspace`, and deleting it instead would take another member's access away.
- **The mark is re-signed with everything else.** `store::re_sign_rows_of_certificate` does not
  re-sign `mark` today (store.rs:1903-1946), so removing the member who set it makes the mark read as
  none; the routine gains it and role rows.

### Why this and not the others

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **Delegated certificates with a signed ceiling** (chosen) | Authority is frozen into the certificate, so verifying a row needs no role row's history; demoting somebody re-issues one certificate; a manager certifies without the owner; closes "any certificate signs anything" | A role edit re-issues every holder's certificate; revoking an issuer re-parents what they issued | A hole in the walk (a cycle, an unchecked ceiling) is a hole in security | One verifier and one row-kind table |
| Everyone certified at join, authority recomputed on read from signed role and member rows | Certificates stay simple | A role row authorizes its own signer unless rank is threaded through every read; the reader sees only results, so its check is stricter than requirement 7; demoting a manager invalidates every row they ever signed | Replication order shows up as refusals; one replayed role row widens every holder | Authority logic in every reader |
| The owner certifies (today) | Nothing to redesign | Contradicts requirement 9 | none new | none |

The human asked for "the most secure yet flexible, quick in effect and efficient" and left the
choice here; the first row is the one that is all four.

## Record flags are enforced at the procedure

Record writes reach SQLite as raw SQL through `db_execute_single_sql` / `db_execute_batch_sql`
(`database/proxy.rs`), which know nothing of meaning, so a check there would mean parsing SQL. The
tRPC layer already has `procedure.permitted(...acts)` and `requirePermission` (`api/trpc.ts`), and
that is where every record procedure gets its flag. Rejected: a Rust gate parsing statements for
table and verb, which would be a second, weaker SQL parser standing between the application and its
own database, and which the credential bypasses anyway (spec, Out of Scope).

# Components

**`packages/workspace-permission/index.ts`**
- `FLAGS`, name to bit, replacing `ADMINISTRATION` (bits below):
  - 0 to 9, the member's administration: `inviteMember` 0, `removeMember` 1, `assignRole` 2 (was
    `changeRole`; same bit), `renameWorkspace` 3, `resetPassword` 4, `renameMember` 5,
    `grantWorkspace` 6, `manageRoles` 7, `overrideMember` 8, `manageMark` 9.
  - 10 to 17, the owner's: `createWorkspace`, `deleteWorkspace`, `mintReadOnly`, `lockOut`,
    `renewCredentials`, `tursoAccount`, `transferOwnership`, `deleteOrganization`.
  - 20 to 39, records: for complex, unit, tenant, contract, payment in that order, `view*`,
    `create*`, `edit*`, `delete*` (so `viewComplex` 20 … `deletePayment` 39).
  - 18, 19 and 40 to 52 free. The 53-bit guard and its test stay as they are.
- `FAMILIES` (administration, owner, and one per record kind), which the editors group by.
- `OWNER_ONLY`, `MEMBER_ADMINISTRATION` (the six that make a member-row signer), `WRITE_FLAGS` (create,
  edit and delete of every kind).
- `BUILT_IN = { owner, manager, member }`, each with its id, rank and default mask: owner every flag
  and rank `2_000_000`; manager every flag outside `OWNER_ONLY` and rank `1_000_000`; member the
  five `view*`, the five `create*` and the five `edit*`, rank 0.
- `effective(roleMask, override)`, `effectiveIn(permissions, accessLevel)` (a read-only grant
  clears `WRITE_FLAGS`), `xorOf`, `maskOf`, `permits`, all by arithmetic: bitwise operators coerce to
  32 bits and bit 39 is past that, which the package header already explains for `|`.
- `Role` becomes the built-in role kind union `'owner' | 'manager' | 'member' | 'custom'`.

**`tauri/src/organization/permission.rs`**: the same table as `Flag`, the same constants, the
`effective` routine, and the test that reads the package source extended to the new names, the
families and the defaults. `require` and `require_any` refuse naming the flag, as now.

**`tauri/src/organization/authority.rs`**: `certificate.v2` and `revocation.v1` preimages; the walk;
the row-kind table; `member.v3` preimage `id ‖ public_key ‖ signing_public_key ‖ role_id ‖ override ‖
owner_seed_sealed?` (the id enters the signature, so no member row stands in for another's);
`role.v1` preimage `id ‖ kind ‖ name_sealed ‖ mask ‖ rank`. The old preimages are deleted, not kept.

**`tauri/src/organization/store.rs`**: the schema below, the readers verifying through the walk,
`re_sign_rows_of_certificate` covering `mark` and `role`, and a certificate cache per read so a walk
is not repeated per row.

**`tauri/src/organization/role.rs`**: `change_role` is replaced by `assign_role`, `set_override`,
`create_role`, `rename_role`, `set_role_mask`, `move_role`, `delete_role`, plus the shared
`reissue(actor, member, now)` that issues, revokes, re-signs and re-parents (Architecture). The
handover (`accept_ownership`) re-issues the root certificate under the new key and every certificate
the previous owner's certificate issued directly, since the previous owner now ranks as a manager.

**`tauri/src/organization/invite.rs`, `removal.rs`, `session.rs`, `workspace.rs`, `mark.rs`,
`setup.rs`**: every place that reads a role string or `permissions` reads the effective permissions
and rank instead. `require_owner` and the other `session.role == OWNER` checks read the verified row,
not the session snapshot. `mark::require_administrator` becomes `require(ManageMark)`. Reset and
removal are no longer the owner's alone because they no longer need the organization key; they need
the flag, the rank, and a certificate to issue from. `setup::create_organization` writes the format
row, the root certificate, and the manager and member role rows.

**`apps/desktop/src/lib/api`**: `procedure.permitted(flag)` records the flag in tRPC `meta` (typed on
`initTRPC.meta<{ flag?: Flag; flags?: Flag[] }>()`), so a test can walk `appRouter._def.procedures`.
`procedure.member` remains only for procedures that are a member's own (sign-out, their own
password) and says so in its meta. `actingIdentity` sets `identity.permissions` to
`effectiveIn(session.permissions, currentWorkspace.accessLevel)`. The refusal message stops saying
"in this workspace" for organization flags.

**Record routers** (complex, unit, tenant, contract, payment, history, dashboard, workspace): each
procedure names its flag. `get`, `search`, `getMany`, `receipt`, `schedule`, `reminder` take the
kind's `view*`; `create`, `createMany`, `planMany` `create*`; `update`, `renew`, `terminate*`,
`unterminate*`, `restoreMany`, `contract.units.set` `editContract`; `delete`, `deleteMany`
`delete*`. `workspace.get` (export) needs every `view*`, `importWhole` every `create*`.
`history.append` takes the flag of the record it logs. `contract.dashboard` stays open to every
member and leaves out each figure whose kind the member cannot view.

**Record interface**: each concept's `acts.ts` gates its acts through `unavailable` with a reason
naming what is missing, the pattern `rules/interface` already sets for record card actions; the
palette drops what is unavailable, as it does now. `layout/create.ts`, the directories' bulk
actions, the import dialogs, and undo's inverses (`design/inverse.ts`) check the same flags.
`layout/navigation.ts`, `layout/record-search.ts` and the cross-kind panes leave out a kind the
member cannot view.

**Organization interface**: the organization section of the settings area gains a roles block,
listing roles by rank with each role's flags grouped by family, and a role editor in the edge
panel (create, rename, move, edit mask, delete), following `rules/interface` for write surfaces.
The member sheet replaces the administrator/member segmented control and `member-acts.svelte` with
a role picker and an override editor that shows each flag's role value, override and result.
`role-table.svelte` retires into the roles block. Every "administrator" string becomes "manager"
in `i18n/en` and `i18n/ar`. A control the viewer may not use is disabled with the reason (rank,
self, or the flag they lack).

# Interfaces

New and changed Tauri commands (`organization/command.rs`), each re-checking on the verified row:

| Command | Takes | Gate |
| --- | --- | --- |
| `organization_roles` | nothing | signed in |
| `role_create` | `name`, `mask`, `after_role_id` | `manageRoles`, rank, flags held |
| `role_rename` | `role_id`, `name` | `manageRoles`, rank |
| `role_set_mask` | `role_id`, `mask` | `manageRoles`, rank, flags held |
| `role_move` | `role_id`, `after_role_id` | `manageRoles`, rank of both |
| `role_delete` | `role_id` | `manageRoles`, rank |
| `member_assign_role` (replaces `member_change_role`) | `member_id`, `role_id` | `assignRole`, rank of member and role, flags held |
| `member_set_override` | `member_id`, `override` | `overrideMember`, rank, flags held |
| `member_create` | `role_id` and `override` in place of `role` and `permissions` | `inviteMember`, as the two above |

"Flags held" is requirement 7: every bit that differs between the before and the after, in the
role's mask or the member's effective permissions, is one the actor holds, and no `OWNER_ONLY` bit
is set anywhere but the owner.

`SessionFacts` and `OrganizationMember` gain `roleId`, `roleName`, `rank` and `override`;
`permissions` is the effective value; `role` is the built-in kind. A `RoleFacts { id, kind, name,
mask, rank, holders }` list crosses from `organization_roles`. Nothing about a certificate crosses.

Callers that change: every importer of `ADMINISTRATION`, `ADMINISTRATION_BY_ROLE`,
`EVERY_ADMINISTRATION` and `Role` (the TS read lists them: `api/trpc.ts`, `organization/acts.ts`,
the four organization components, `settings/section.ts`, `workspace/permitted.ts` and
`permitted.svelte`, and their tests).

# Data Model

The organization database, created fresh by this build; one made by an earlier build is upgraded
in place by its owner (see *Migration*).

- `format (id TEXT PRIMARY KEY, version INTEGER)`: one row, version 2. Unsigned: rewriting it only
  makes the organization refuse to open, which the credential already allows by deleting rows.
- `role (id, kind, name_sealed, mask, rank, certificate_id, signature)`: the manager and member rows,
  created with the organization, and the custom ones. The owner role is the constant, never a row.
  Custom ranks are integers strictly between 0 and `1_000_000`; `move_role` takes the midpoint of its
  neighbours and renumbers the custom roles below the actor when a gap closes.
- `member`: `role` and `permissions` are replaced by `role_id` and `override`, and the row is
  `member.v3`. A removed member keeps `role_id` of member and carries `removed_at`, which replaces the
  `removed` role string, and is signed.
- `administrator_certificate` becomes `certificate`, with `issuer_certificate_id`, `ceiling` and
  `rank`, and without `revoked_at`.
- `revocation (certificate_id, revoker_certificate_id, revoked_at, signature)`.
- Every other table keeps its shape; its rows are signed under the new certificates.

# Technical Approach

The order the tickets land in, and why:

1. **The vocabulary**, in both languages, with the old names kept as aliases until step 7 so
   nothing else moves yet. Everything after reads it.
2. **The format and the clean break**: the `format` table, the refusal of an organization with none
   or a newer one (at connect, sign-in and launch), and the local replica of the old shape forgotten
   by the existing `forget::forget_old_shape` pattern. It comes before the chain because it is what
   keeps the chain's new rows away from an old reader and the old rows away from the new one.
3. **The chain**: certificate v2, revocations, the walk, the row-kind table, `member.v3`, `role`
   rows, and organization creation writing the root. Tested on its own, against rows written around
   every command.
4. **The existing flows onto the chain**: invite, reset, removal, lock-out, grants, workspace
   rename, mark, handover and renewal issue and revoke delegated certificates and read effective
   permissions and rank. After this, today's behaviour holds on the new chain, with administrator
   renamed manager.
5. **Roles and assignment**: the role commands, `member_assign_role`, `member_set_override`, and
   `reissue`. Requirements 4 to 7 and 9.
6. **Across the boundary**: the facts, `organization_roles`, the context's effective and read-only
   fold, and the organization state re-read on the sync heartbeat (the TS read found nothing that
   invalidates it today; `sync/autosync.ts` is where the heartbeat is).
7. **Record gates in the routers**, with the meta flag on every procedure and the walk test.
8. **Record gates in the interface**: acts, creates, bulk, import, undo, navigation, search,
   panes, dashboard, print.
9. **The organization interface**: roles block, role editor, member sheet, the manager wording.
10. **Docs**: `contexts/desktop/organization` rewritten for the new chain and roles (not corrected
    in place; the *Chain* entry and every correction under it describe a chain that no longer
    exists), `rules/credentials`' sentence about what `OrganizationSession` carries, and the
    changeset.

Steps 3 and 4 can each be more than one ticket; `/tasks` splits them where a commit would carry two
changes.

# Integration

- **Turso**: nothing new. Creating, deleting, minting read-only and renewing stay the root's, by
  where the authority is.
- **The workspace export and import** (`workspace.get`, `importWhole`) change no shape. *They were
  how the one existing user crossed over, until the amendment of 2026-09-26 (see* Migration*).*
- **`rules/interface` and `rules/frontend`** govern the new blocks and the edge panel; the design
  calls follow the minimal, guiding direction and Apple's HIG.

# Migration

*Amended 2026-09-26, the human's call (spec, requirement 11): the plan said none in place, with the
one user exporting in the old build; an update replaces that build and a refused organization
cannot sign in, so the export was out of reach.* An organization of format 1 (no `format` table) is
upgraded in place, once, by the owner's machine.

**Who.** Only the owner, because every row the new format holds is signed from the root, and the
root is the organization key, derived from the owner's vault secret (`owner_key_from`, the test
`repair_owner_row` uses). A vault is the owner's exactly when that key's verifying key equals the
pinned one. Every other member's sign-in, resume, connect, join or machine link meets
`OrganizationOlder` with a sentence saying the organization waits for its owner to open this
version; nothing is written.

**Where.** In the sign-in and the launch resume, and in `setup::connect_existing`, before the format
is refused: open the replica, read the old member rows unverified to find the vault, open it (the
password, or the remembered key on resume), confirm the organization key, unseal the credential,
pull, verify every old row under the format 1 rules (`member.v2`, `certificate.v1` against the pinned
key, the unsigned `revoked_at`), then transform, push, and carry on into the ordinary sign-in. A row
that does not verify under the old rules is not carried; the upgrade names what it dropped in the
log.

*The order as built, tickets 22 and 23 (`upgrade.rs`): open the replica; read the member rows as they
lie to find the vault the password or the remembered key opens; settle the pinned key along any
completed succession a format 1 handover left; confirm the organization key; unseal the member's own
grant on the organization database where the machine holds no credential yet. Anybody but the owner
then pulls with it, and goes on into the ordinary sign-in only where what arrived is format 2. The
owner's machine pushes what the old build left captured, then pulls, then judges every row under the
format that signed it, then transforms in one transaction in the order `upgrade::planned` gives: the
member columns added and dropped where still needed, the tables, the rows that verify under neither
format removed, the root and the two role rows, each member's certificate and row, the standing offer
withdrawn, the workspaces, grants, invitations and mark, `administrator_certificate` dropped, and the
`format` row. Then it pushes. Each certificate keeps format 1's id, `cert-<member>`, and its key, so a
row an old build signs afterwards still verifies.*

*The online condition, ticket 23: the transform runs only once that first push has gone and the pull
has completed. Offline, or with either failing, nothing is written and the owner is refused with
`OrganizationUpgradeOffline`, asking for a connection. Where the pull brings format 2, another of the
owner's machines finished first and nothing is written. An upgrade cut short anywhere reads as older,
every other machine waits, and the owner's next sign-in, resume or connect online finishes it from any machine, each
step running only on the shape it finds. Narrowed by ticket 25: a machine that has read the
organization in this format keeps that locally and never transforms it again, and one without that
record refuses to transform where a root the organization key signed is present. So a remote cut
short after its root was written is finished by the push of the machine that ran the upgrade, which
holds the whole change, and not from another machine.*

**What.**

- `member`: `role` and `permissions` give way to `role_id`, `override` and `removed_at`, and every
  row is re-signed as `member.v3` under the root. The owner keeps `owner` with no override. An
  `administrator` becomes `manager`, a `member` stays `member`, and a `removed` member becomes
  `member` with `removed_at` set to the row's `updated_at` and no live certificate. **The override
  keeps what each member could do**: the effective permissions are the old bits 0 to 6 (`changeRole`
  read as `assignRole` and `overrideMember`), every record flag with delete included (the old build
  gated no record act), and, for an administrator, `manageMark` and `manageRoles`; the override is the
  role's mask XOR that. A `member` holding any administration flag would rank 0 and so could certify
  nobody; they become `manager` instead, with the override keeping exactly their flags.
- `role`: the manager and member rows, as `create_organization` writes them.
- `certificate`: one per live member, issued from the root with the member's own
  `signing_public_key`, ceiling their effective permissions and rank their role's; the owner's is the
  root. `administrator_certificate` is dropped. Every workspace, grant, invitation and mark row is
  re-signed under the root, so none depends on an old certificate id or on a ceiling the old build
  never checked.
- `format`: written **last**, so an upgrade cut short still reads as format 1 and runs again at the
  next sign-in. The whole runs in one local transaction and one push. *Superseded by the order as
  built, above: a push, a pull, one transaction, a push; a cut-short upgrade reads as older, which
  covers every partial shape, and is finished at the owner's sign-in, resume or connect.*
- Unsigned tables carry as they are; `session_epoch` is kept, so remembered sessions stay valid. A
  standing handover offer is withdrawn (its `succession` row deleted and the seal cleared); the owner
  offers again. The leftover `organization_mark` table is left alone.

**The schema change is the risk.** The organization store has never altered a table, and a
drop-and-rename does not replicate through a sync connection (measured 2026-08-20, noted at
`store.rs` and `database/test/workspace.rs`). The ticket measures `ALTER TABLE ... ADD COLUMN` and
`DROP COLUMN` through the sync connection first; if either fails, the member columns are handled by
the approach that does replicate, and the measurement is recorded where the earlier one is.

*Measured 2026-09-26 on a live account (ticket 22), recorded at `store.rs` and
`database/test/workspace.rs`: `ADD COLUMN`, `DROP COLUMN` and `DROP TABLE` all replicate through a
sync connection, so the member columns are altered in place. The one failure is a row change captured
under a column set that a later statement in the same push drops, which fails that push with `Number
of arguments mismatch`; so the reshape runs before any row is written, and what the old build left
captured is pushed before the upgrade runs.*

A machine still on the old build after the upgrade reads a directory it cannot parse. That is the
cost of the owner updating first; the old build is not changed.

## Each format change is a file (spec, requirement 14)

*Amended 2026-09-27, the human's call.* `upgrade.rs` today is the runner and the format 1 to 2
change in one file. It splits in two, with no change of behaviour:

- **`organization/transition/mod.rs`** holds the list, `TRANSITIONS`, in order, and the shape one
  entry has: the format it starts from, a name for the log, a refusal check over the directory as it
  stands (format 1 to 2's is `holds_a_root`), and the plan it makes and applies inside the
  runner's transaction. A table of plain `fn` items returning boxed futures, not an `async` trait
  object, because `async fn` in a trait is not object safe on this toolchain and the list is
  static. `FORMAT_VERSION` becomes `TRANSITIONS.len() as i64 + 1`, a `const`, so a change added is
  the shipped format moved, the way `build.rs` counts the workspace migrations. A test fails a list
  whose `from` values are not 1, 2, 3 in order.
- **`organization/transition/two.rs`** takes what is format 1's alone: `Judge`,
  `Carried`, `carried_by`, `planned`, `applied`, `Step`, the format 1 readers the upgrade calls, and
  `holds_a_root`.
- **`upgrade.rs` stays the runner**: the vault, the settled key, the owner, the grant and the mint,
  following the owner, the push and pull, `known_format`, then the copy (below), then one
  transaction that walks `TRANSITIONS` from the format read to the shipped one and writes the
  `format` row last, then the push. The format read is the `format` row, or 1 where no such table
  stands. `known_format` refuses any entry whose `from` is below it, which generalises ticket 25's
  guard.
  *As built, ticket 26 (`store::format_as_it_stands`): the format read is 1 wherever anything of
  format 1 is left, whatever row stands beside it, and otherwise the `format` row, or the shipped
  format where no row stands; so ticket 25's stray row still reads as unfinished and a directory
  with nothing of format 1 left is only given its `format` row. The next format whose row can go
  missing adds its own shape check there. The file is `two.rs`, named for the format it makes,
  since a Rust file name is one word (`rules/module-layout`).* *Ticket 29: a row below 2 where
  nothing of format 1 is left reads as 2 and is written back, as before the split; each entry
  carries the readers that find the owner's vault and grant in the format it starts from; and the
  runner counts the shipped format from the list it is handed, so a test walks a whole sign-in
  through a test-only next format. A missing row still reads as the shipped format, which is why
  the next format adds the shape of the one before it to `format_as_it_stands`.*
- The module comment of `transition/mod.rs` says in five lines how the next format is added: a file,
  a line in the list, the new tables in `install_schema`, and a test in the file. A test-only entry
  from the shipped format to the next proves it (spec, criterion 14).

## A copy before every change (spec, requirement 13)

*Amended 2026-09-27, the human's call: both copies, and the workspaces too.* The engine refuses to
copy a replica's file (#569, `update.rs`), so the local copy is **logical**: every table in
`sqlite_master` but SQLite's own and the engine's, read row by row, written into a new plain SQLite
file with the same `CREATE` statements, through `sqlx` as the rest of the plain files are.

- **`tauri/src/backup.rs`**, one module both paths call:
  - `local_copy(source, data_directory, database, label, at) -> Result<PathBuf, Error>`: `source`
    is a trait of `begin`, `read` and `end` whose statements `backup.rs` owns, with two
    implementations, the organization replica's connection and a workspace's pipeline stream
    (`migrate::OverThePipeline`). The file is written as
    `<name>.partial`, every table's row count read back and compared with the source's, then renamed
    to `<data_dir>/backups/<database>/<label>-<unix ms>.sqlite`. The three newest per database are
    kept, the rest removed after the new one stands.
  - `remote_copy(platform, database, label) -> Result<String, PlatformError>`: a new
    `TursoPlatform::copy_database`, a `POST /databases` with `seed: {type: "database", name}` in the
    same group, then delete protection, as `create_database` does (a copy that cannot be protected
    is removed). The name is `copy-<id>-<label>-<unix s>`, at most 40 characters, never `org-` or
    `ws-` at its start (ticket 30). Every copy is kept; the owner removes them on the account.
- **Organization**: in the owner's upgrade, after the pull and the refusal checks and before the
  transaction, the replica is copied, labelled `format-<from>-to-<to>`. The remote copy is made
  where `ItsRemote::account` is present. A new `Replication::copied` carries it so the test double
  records it.
- **Workspace**: in `migration::upgrade`, once the lease is `Held` and before `apply_between`, the
  workspace is copied over the pipeline the migration uses, labelled `schema-<from>-to-<to>`; the
  remote copy where this machine holds the account. A local copy that fails releases the lease,
  as a failed migration does.
- *As built, ticket 30: every index, view and trigger is copied with the tables, after the rows;
  what the engine owns is one filter, `backup::NOT_THE_ENGINES`; each table's rows are compared
  with the source's own `COUNT(*)` in the same read transaction; a workspace is read in one
  transaction over one pipeline stream, a page of rows at a time; the copy just written is never
  the one retention removes; and a copy on the account is named `copy-<id prefix>-<label>-<s>`,
  forty characters at most, so no reader takes it for an organization or a workspace.*
- **A new refusal, `CopyNotTaken`**, in English and Arabic: the copy before the upgrade could not be
  taken, its source unread or its file unwritten (told apart in the log), nothing was changed, and
  the Rust message names the directory. A remote copy refused is
  `backup.remoteCopyRefused` in the log and nothing else.

## Whole, checked, tested from every version, and rebuilt (spec, requirements 15 to 17)

*Amended 2026-09-27, the human's call, from [[efforts/838-permissions-are-a-role-and-an-override/evidence/research/how-updates-migrate-and-fall-back]].*

- **The workspace tail is one transaction.** `migrate::apply_between` sends `BEGIN`, every
  statement of the tail, the checks below and the version row on one Hrana stream held by its
  baton, then `COMMIT`; any failure sends `ROLLBACK`. The version is kept in a one-row table in the
  workspace database, read first inside the same transaction: where it already says the shipped
  version, nothing is applied and only the organization's record is brought up. The
  organization's record stays the gate read before a replica is opened, and is written after the
  commit as today. *Whether libSQL's server takes every statement of `0003` inside one explicit
  transaction is not measured; the live test that does so is `#[ignore]`d and the human's, and
  where it does not, one transaction per migration file with its version row is the fallback.*
- **The check before commit**, one function in a new `tauri/src/schema.rs`, used by both paths:
  `PRAGMA quick_check` answering `ok`, `PRAGMA foreign_key_check` answering nothing, and the schema
  read from `sqlite_master` (tables, columns, indexes, views, triggers, normalised) equal to a
  fresh database's of the same version. For a workspace the fresh one is the embedded migrations
  applied to an in-memory SQLite; for the organization it is `install_schema` on a fresh store,
  with the tables the upgrade leaves alone named once as allowed extras. A mismatch refuses with
  `ShapeNotAsBuilt`, in English and Arabic.
  *Measured at ticket 33 on turso 0.8.0-pre.12: an organization upgraded in place records its
  `member` table as the engine rewrote it after the ALTERs (the added columns last, with the
  defaults a `NOT NULL` ADD COLUMN needs, quotes dropped), which is not the statement a fresh store
  records, and a drop-and-rename does not replicate (2026-08-20, 2026-09-26). So a change of
  format also declares the statement the engine records for each table it reshapes in place, and
  the check accepts that or the fresh one for that table alone, strict everywhere else; a change
  names the tables it leaves alone (`organization_mark`) and each entry builds the fresh
  organization of the format it arrives at. `PRAGMA quick_check` answers on the engine;
  `foreign_key_check` is not in its `pragma_list` and is silently ignored, so it is logged as not
  checkable, which the organization's schema, declaring no foreign key, makes safe.*
- **Every version in the tests.** One seed per shipped workspace version, the rows a database of
  that version holds, is walked by the same `apply_between` against a local stand-in for the
  pipeline, and a test fails a shipped version with no seed. The format 1 organization already
  has its builder.
- **A corrupt replica rebuilt.** Where opening or reading a replica answers the engine's `Corrupt`
  or `NotADB`, the file and its sync metadata are renamed to `<name>.corrupt-<ms>`, the log says
  what was set aside, and the replica is opened again from its remote.
  *Measured at ticket 35 on turso 0.8.0-pre.12: a file that is not a database fails the open with
  the kind flattened to text by the sync kit, so it is matched there by turso_core's wording, and by
  kind on the first read; a truncated file is never reported as corrupt (a short read, a `Busy`, or
  an open that never returns), so a truncated main file is found before the engine is given it,
  from the header's page size and count against the file's length, where no write-ahead log holds
  the rest (`database/corrupt.rs`). Damage met after the first read is not handled here.*
- **What is carried forward.** Releases from 0.14.0 on, the first on Turso: workspace schema 5 on
  and organization format 1 on are seeded and walked in the tests (ticket 34). *The human's call,
  2026-09-27.*
- **Before Turso, a guided move** (spec, requirement 18). 0.12.0 and 0.13.0 kept records in
  `app.db`, at workspace schema 2 and 3 (their own runner's `__migrations__` ledger names which,
  exactly {0000, 0001} or {0000, 0001, 0002}; ticket 36). A new command reads that file read-only, whatever of the two it is, into the tables `import_read_book` returns, in the
  whole-workspace export's columns (`TRANSFER_COLUMNS`), and writes the same tables as the export
  workbook to `backups/app/workspace-<version>.xlsx` through `export_write_workbook`'s writer.
  The interface takes those tables into the existing `planWorkspaceImport` and import dialog, as
  if the person had chosen that file. It is offered on the way in, where the file holds records,
  as one line saying the earlier version's records are here and will be brought in once a
  workspace exists; and, once the person holds a workspace they may import into, as a callout in
  the workspace group of settings beside the transfer controls, until they have brought them in
  or dismissed it. Nothing writes to `app.db`.
- **A rule for shipping migrations**, `rules/migrations`: add before removing, so an older build
  keeps working while a newer one migrates; a migration never edited once shipped; each shipped
  version seeded in the tests.

# Testing Strategy

| Criterion | Checked by |
| --- | --- |
| 1 | the package's bit guard; a Rust test reading the package source for names, bits, families and defaults; a TS test walking `appRouter._def.procedures` that fails on a procedure with no flag and no `member` meta; a Rust test over `command.rs`'s handler list naming each command's gate |
| 2 | Rust: each `OWNER_ONLY` flag written into the manager mask, a custom mask and an override by the owner and a manager, each refused; the owner's effective equals every flag |
| 3 | Rust: `create_organization` yields the three roles with `BUILT_IN`'s masks; delete, rename and owner-mask edit refused; manager and member mask edits by the owner succeed |
| 4 | Rust: the role lifecycle, rank stays between member and manager after every move; a deleted role's holders read the member mask XOR their override |
| 5 | Rust: every member row names one role; assigning the owner role refused; effective read back per role |
| 6 | a shared JSON table of `(mask, override, effective)` cases read by a TS test and a Rust test; the owner's row refuses an override |
| 7 | Rust: for each management flag and each rank pair (above, equal, below, self), every act; the flag-held case switching a flag on and off, both refused |
| 8 | the shared table of criterion 6; Rust: a narrowed member's open session refused after one pull (the existing test at role.rs:1781 re-pointed); TS: the context's permissions follow a changed state after the heartbeat |
| 9 | Rust, three stores on one database: owner offline (no organization key derivable in the test), a manager assigns a signing flag, the member's signed row verifies on the third store; a member row, a role row and an override written around every command by a certified member, beyond their ceiling or at or above their rank, refused on read; removal and narrowing, then a row signed under the old certificate refused and the rows signed before still verifying; a certificate cycle and a walk past 16 refused; a revocation by a certificate that does not outrank refused |
| 10 | TS: for each record flag, the procedure refuses without it; component tests on each concept's acts for the reason text; navigation, search and dashboard leave out a kind without its view flag; a read-only grant refuses every write |
| 11 | Rust: a format 1 organization written by the main-branch shape (owner, narrowed administrator, member with administration flags, removed member, pending invitation, both grant levels, mark) upgraded by the owner's sign-in, then every member's effective permissions compared with the old and every row verified from a second store; the upgrade cut short before `format` still reads as format 1 and completes on the next sign-in; a member first refused naming the owner, nothing written; `format` version 3 refused naming the update, nothing written. *Tickets 23 and 25 add:* offline, or a failed push or pull, nothing written; a member pulling first and following the owner; every partial state finished; a second owner machine writing nothing; a late old-build row read verified; the owner found by key alone; a format 2 organization made to look older never transformed |
| 12 | the human, on the running application, at the close |
| 13 | Rust: the format 1 fixture upgraded, then its local copy opened as a plain file and every table and row compared with a copy read before the upgrade; the in-memory platform recording one protected copy; a directory that cannot be written refusing with `CopyNotTaken` and the organization unchanged; a pending workspace migration against the pipeline test double leaving its copy; a refused remote copy logged and the change done; retention keeping three |
| 15 | Rust: a tail failing at a middle statement against the local stand-in, the workspace unchanged and the retry whole; a failing check rolling back each path; the version row read first |
| 16 | Rust: every shipped version seeded and walked; a missing seed failing |
| 18 | Rust: `app.db` built at schema 2 and 3 from the shipped migrations, read into the transfer tables, every record present, the workbook written; TS: the import plan over those tables creates every record; the human on the running application with 0.13.0's file |
| 17 | Rust: a not-a-database and a truncated replica each set aside and pulled again; the human on the running application |
| 14 | Rust: the list's `from` values contiguous from 1 and `FORMAT_VERSION` equal to its length plus one; a test-only entry from the shipped format to the next, walked by the runner with the copy, the transaction and the `format` row; the format 1 to 2 tests unchanged and green after the split |

# Operational Considerations

- **A breaking release.** The changeset is a minor bump, the pull request carries the breaking flag,
  and the changeset says an
  organization made by an earlier version is upgraded when its owner first signs in, and that other
  members wait until then.
- **Every role edit writes one certificate, one revocation and the re-signed rows per holder.** At
  the sizes this application serves (tens of members) that is a few hundred rows at the most, in one
  push.
- **A refusal can now come from a manager's missing flag during removal or narrowing** (the rows the
  departing certificate signed that the actor cannot re-sign). The sentence names the flag and who
  holds it.

# Technical Risks

- **The walk is the security boundary.** A missed check (ceiling, rank, revocation above, cycle)
  lets a certified member sign themselves authority. First sign: criterion 9's around-the-command
  tests passing where they should refuse, so each is written to fail first.
- **Re-issuing on every change can leave a half-written state** if the push fails between the new
  certificate and the revocation. Both are written in one transaction on the replica before the
  push, and a reader treats a member with two live certificates as holding the newer.
- **Unverifiable rows refuse the whole read.** A manager whose certificate is revoked while their
  signed rows are still arriving could make a member's directory refuse until the re-signed rows
  land. The re-sign is in the same transaction as the revocation for that reason.
- **A copy holds the organization's sealed and signed rows as they lie.** It is no more exposed
  than the replica beside it on the same disk, and the remote copy is on the owner's own account;
  neither holds a key. Copies on the account are never deleted by the application, so they collect,
  one per change, which is rare.
- **The alias window in step 1** lets old names linger; step 9 removes them, and a lint-level grep in
  that ticket's criteria holds it.
