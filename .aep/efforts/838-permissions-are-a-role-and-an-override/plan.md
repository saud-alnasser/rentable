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
  | `member` | hold any of `inviteMember`, `removeMember`, `assignRole`, `overrideMember`, `renameMember`, `resetPassword`, and outrank the member's role; or be the root |
  | `role` | hold `manageRoles` and outrank the role's rank; the manager role is therefore the root's alone |
  | `certificate`, `revocation` | the walk above |
  | `grant` | hold `grantWorkspace`; a read-only grant, the root |
  | `workspace` | hold `renameWorkspace` or `grantWorkspace`; creating one is the root's by where the Turso authority is |
  | `invitation` | hold `inviteMember` or `resetPassword` |
  | `mark` | hold `manageMark` |
  | `succession` | the organization key, unchanged |

  So a member holding the organization database's credential who signs around a command gets no
  further than their certificate: rows of the kinds its ceiling names, about people ranked below
  them. That is the cryptographic bound. Which flags inside it they may switch is the command's.
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

The organization database, created fresh; nothing in it is altered in place.

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
- **The workspace export and import** (`workspace.get`, `importWhole`) are how the one existing user
  crosses over; neither changes shape.
- **`rules/interface` and `rules/frontend`** govern the new blocks and the edge panel; the design
  calls follow the minimal, guiding direction and Apple's HIG.

# Migration

None in place, by the human's call (spec, requirement 11). The one existing user, in today's build:
exports each workspace, deletes the organization (`organization_delete`, the owner's), updates, then
creates an organization in the new build and imports each workspace. A new build meeting the old
organization, by connect or by an existing replica, refuses with that sentence and writes nothing.

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
| 11 | Rust: an organization database in today's schema and one with `format` version 3 refused at connect and at launch, nothing written; TS: an export fixture written by today's build imports whole |
| 12 | the human, on the running application, at the close |

# Operational Considerations

- **A breaking release.** The changeset is a minor bump flagged as breaking, and says an
  organization made by an earlier version is refused and how to cross over.
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
- **The alias window in step 1** lets old names linger; step 9 removes them, and a lint-level grep in
  that ticket's criteria holds it.
