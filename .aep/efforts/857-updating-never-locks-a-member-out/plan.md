---
use-when: "building a ticket of effort 857 and the approach is not obvious from the spec"
---

# Architecture

**Additions arrive on their own; anything that can stop someone waits for the upgrade.** Every
workspace migration and organization format step is declared as one of two kinds, and the kind
decides who runs it and what it moves:

| Kind | What its SQL may do | Who runs it, and when | What it moves |
| --- | --- | --- | --- |
| **addition** | create a table or an index; add a column that may be empty or has a default | any machine whose build ships it, the first time it meets the data, as `complete_schema` already does for the organization's tables | the structure only; neither floor |
| **upgrade** | anything else: remove, rename, rebuild, re-sign; or an addition whose meaning an older build would get wrong | a holder of the upgrade permission, by the explicit act, after the who-is-behind sheet | the read floor, the write floor, or both, as the step declares |

A newer build therefore always runs against a structure that has every addition it ships, and
every step shipped before this effort (see **Steps shipped before 857** below), so no query is
ever written against an older shape. What it adapts to is the **upgraded level**: a
capability that depends on an upgrade step is gated on that step having run, and shows why and
who can run it until then (spec requirement 1).

A meaning change that only adds a column, like `0006`'s `direction`, is split: the column arrives
as an addition, and the step that lets this build *write* the new meaning is an upgrade step that
raises the write floor. Until it runs, the newer build writes nothing an older build would
misread; refunds, in that example, are the gated capability.

**The numbers already-shipped builds read are kept as their floor.** A build released before this
effort refuses a workspace whose organization record `workspace.schema_version` exceeds its own
count, and an organization whose `format` row is not exactly 3 (`lease::refuse_newer`,
`store/format.rs::refuse_another_format`). Those two numbers are therefore never moved by an
addition. They move only when an upgrade raises a floor above what a pre-857 build can honour,
and then they move to a value every pre-857 build refuses. That is the one way to stop a build
that knows nothing about floors, and it is exactly the stop the upgrade sheet warned about.

**Steps shipped before 857** (workspace migrations up to `0006`, format steps up to 3) keep
running on open exactly as 0.20 runs them: format 1 to 2 on the owner's machine, the rest by the
first full-access member under the lease (spec requirement 1, amended at /implement). They are
declared upgrades with floors at their own number, as ticket 01 landed, and also marked
`shipped_before_857`, which is what the open path reads to run them. Data in users' hands today
stands behind `0006`, and drizzle names `payment.direction` in every payment select, so holding it
for a manager would lock members out of their payments. The new rule binds every step declared
after this effort.

**Recording what ran.** Because a pending upgrade blocks no later addition, the steps a workspace
has run stop being a prefix. Its `schema_version` keeps meaning "every step up to here has run",
and a new workspace table `applied_step(step INT PK, applied_at INT)` lists any step above it that
ran; the check against a fresh database builds that database from the same prefix and set. The
organization needs no such record: its additions are created idempotently by `complete_schema`.
**The first post-857 step applied to a database writes its floor record** (`data_floor` and
`workspace_floor`, or `organization_floor`) holding the floors read before it, so an addition that
raises the count never raises the floors through the legacy fallback.

**Where the verdict lives.** `guard/cycle.rs` forbids any module naming `upgrade`. The step
declarations and the floor verdict are reached by `organization/lease`, `store` and `session`
through the structure ticket 04 settles under that guard and `[[rules/module-layout]]`; ticket 03
builds on it.

## Alternatives that lost

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **A. Newer build runs on the older shape**: nothing applies until the upgrade, the query layer handles one version back | Matches the spec as first written | drizzle names every column in every select, insert and `.returning()` (157 selects, 54 writes); a rebuild cannot be carried both ways | a missed column fails for real people | 1 to 3 days a release, by the research's estimate |
| **B. Additions on their own, upgrades by permission** (chosen) | nobody is stopped by an addition; the person upgrading decides every stop; builds on what the organization already does | each step needs a declared kind and floors; meaning changes are split and gated | a step misdeclared as an addition lets an older build write wrong data | one declaration per step, one gate per gated capability |
| **C. A capability list per database** (Git's `extensions`) | the finest gating | a list on every database and every check, drifting from the code | the list and the code disagree | moderate |

The human chose B on 2026-10-07 and amended spec requirements 1 and 3 to match it.

# Components

## Rust, `apps/desktop/tauri/src/`

- **`upgrade/step.rs`** (new): the declaration of every step, one table per database.
  `WORKSPACE_STEPS` has one entry per embedded migration file, by its index; `FORMAT_STEPS` one per
  format transition. An entry is `Step { kind: Addition | Upgrade { read_floor: Option<u32>,
  write_floor: Option<u32>, needs_owner: bool }, describes: &'static str }` where the floors are in
  the same numbering as the steps (a floor of `n` means a build must know step `n` to read, or to
  write) and `describes` is the i18n key of the sentence the sheet shows. Shipped steps are
  declared here, beside them, never in the SQL (`[[rules/migrations]]`). It also answers
  `known() -> u32` for this build, and `addition_sql_is_additive(sql)` for the test below.
- **`upgrade/floor.rs`** (new): the floors of one database and the verdict for this build:
  `Floors { level: u32, read: u32, write: u32 }`, `Standing::{Writable, ReadOnly, Unreadable}`
  from `Floors::standing(known)`. Read from the database's own record (below), falling back to
  the legacy number for data from before this effort (Migration).
- **`organization/lease/`**: `is_pending` and `upgrade` split into **additions and steps shipped
  before 857** (run on open by any full-access member under the existing lease, as today) and **the
  upgrade** (run only by the new command). `refuse_newer` becomes the floor verdict.
  `WorkspaceBehind` (read-only grant, additions pending) stays.
- **`upgrade/format/`**: the runner walks additions automatically for any member, steps shipped
  before 857 as today, and later upgrade steps only by the command; a step with `needs_owner` (every step that re-signs, like 1 to 2) runs only
  on the owner's machine, as today. `refuse_another_format` becomes the floor verdict.
- **`organization/upgrade/`** (new): the explicit act. `organization_upgrade_preview(target)`
  returns what will change and who is behind; `organization_upgrade_run(target)` runs it. Target
  is the organization or one workspace. Gated by the new `upgradeData` flag through
  `act::as_member`, plus `Gate::OwnerAlone` semantics for a `needs_owner` step.
- **`organization/store/`**: three new tables, all additions created by `complete_schema`, all
  unsigned and written as the `machine_name` pattern (one writer per row):
  - `machine_version(id PK = machine id, rentable TEXT, workspace_known INT, format_known INT,
    written_at INT)`, written by each machine for itself (spec requirement 4).
  - `workspace_floor(workspace_id PK, level INT, read INT, write INT, written_at INT)` and
    `organization_floor(id PK = 'floor', level INT, read INT, write INT, written_at INT)`, written
    only by the upgrade.
- **The workspace database** gains the one-row `data_floor(id PK CHECK(id=1), level, read, write)`
  inside the same transaction as the first post-857 step applied, beside the existing
  `schema_version` row, and wins over the organization's copy on a mismatch, as `schema_version`
  already does; and `applied_step`, listing the steps run above `schema_version`.
- **`database/`**: `Database` holds the workspace's `Standing`, set by every open and every
  heartbeat. `execute_single_sql` and `execute_batch_sql` refuse a write while it is `ReadOnly`
  with `RefusalReason::WorkspaceReadOnlyByVersion`, and `replicate` does not push. The refusal is
  enforced on the connection with `PRAGMA query_only` where the engine honours it, otherwise by
  classifying the statement with the engine's parser (Technical Risks).
- **`organization/session/`**: `resume_remembered` stops swallowing a version refusal and carries
  it on `OrganizationState` (`heldByVersion: { target, standing, reason }`), as
  `signedOutElsewhere` is carried. Every open path pulls before it judges (Technical Approach).
- **`update/`**: the updater moves into Rust commands so a download survives the window and can be
  installed at quit: `update_check`, `update_download` (background, progress as events, the
  `Update` and its bytes held in app state), `update_install` (now, with relaunch) and the quit
  path installing a downloaded release with `restart_after_install(false)` through the Rust
  `UpdaterBuilder`, which the JS 2.10 plugin cannot ask for. `Recovery` is untouched.
- **`organization/role/permission.rs`** and `packages/workspace-permission`: the `upgradeData` flag
  on free bit 18, in the administration family, in `MANAGER_ROLE`, not in `MEMBER_ROLE`, not in
  `OWNER_ONLY` (spec requirement 3: an override can grant it). Existing organizations' certificates
  are re-issued to carry it, as Migration says.
- **`error.rs`**: new reasons `WorkspaceReadOnlyByVersion`, `OrganizationReadOnlyByVersion`,
  `UpgradeNeedsPermission` (reuses the flag refusal if one fits), `UpgradeNeedsOwner`,
  `ChangesUnsendableAfterUpgrade`; `WorkspaceNewer` and `OrganizationNewer` keep their names and
  now mean below the read floor.

## Frontend, `apps/desktop/src/lib/`

- **`update/`**: owns the update state (moved from `settings/update-download.svelte.ts`) and one
  `component/update-action.svelte` with a `variant` of `screen`, `notice` or `card`. The Settings
  card, the read-only notice and the update screen all draw it. The launch check runs from
  startup's `continue()`; a release found downloads in the background and a quiet toast offers
  the restart.
- **`startup/`**: an organization that cannot be opened, for its version or any other refusal,
  returns to the organization switcher with the refusal recorded against that organization;
  `fail()` and `admit()` route there from launch, resume, sign-in, switch, join and the heartbeat,
  never to the generic error screen and never to sign-in for a refusal that is not about the
  password. The switcher draws a short callout above that organization with the reason sentence,
  and `update-action` as `notice` when the reason is the version (spec requirement 7, amended). A
  workspace below its read floor, in an organization that opens, takes a new state `held` and
  screen `update-required` in place of the workspace: the reason sentence, `update-action` as
  `screen`, and a plain list of the session's other workspaces that calls `switchWorkspace`. Retry from the error screen never
  reopens a workspace refused for its version. The generic error screen now draws the reason it
  was given, behind the existing detail disclosure.
- **`sync/`, `startup/heartbeat.ts`**: the sync outcome carries the standing and a refusal code
  instead of flattening to text; `applySyncOutcome` moves to read-only or `held` before
  `reconciliation.received()` runs, and the day-crossing reconcile checks it too.
- **`api/context.ts`**: `permissionsIn` folds the version standing like a read-only grant,
  clearing `WRITE_FLAGS`, and `permission.ts::refusalOf` names the version as the reason.
- **`organization/component/read-only-notice.svelte`**: in the shell's `notice` slot, on the
  pattern of `locked-notice.svelte`, with `update-action` inside the callout.
- **`organization/upgrade/`** (new): the "upgrade available" mark on the organization card and on
  each workspace card in Settings, and the upgrade sheet (an edge panel, per
  `[[contexts/desktop/components]]`): what the steps add or change, the machines that would be
  stopped or made read-only within seven days by member, machine and rentable version, the
  machines not seen since a date, and "not yet" / "upgrade now". A capability gated on a step
  reads `useUpgraded(step)` and shows its reason with who can upgrade.

# Interfaces

- IPC, new: `organization_upgrade_preview({ target: { organization } | { workspace: id } }) ->
  { steps: [{ describes }], stopped: [Machine], readOnly: [Machine], unseen: [Machine],
  needsOwner: bool }` where `Machine = { member, name, rentable, seenAt }`;
  `organization_upgrade_run({ target })`; `update_check`, `update_download`, `update_install`.
- IPC, changed: `OrganizationState` gains `heldByVersion` and, per workspace, `standing` and
  `upgradable: bool`; `session_replicate`'s result gains `standing`.
- Removed from the frontend: `@tauri-apps/plugin-updater`'s direct use in `update/tauri.ts`, which
  now calls the Rust commands.
- Every new refusal reason gets its row in `error/tauri.ts`, and a sentence in Arabic and English
  in `organization/i18n`, where `everyCodeHasASentence` makes a missing one a compile error.

# Data Model

| Where | Table | Kind | Written by |
| --- | --- | --- | --- |
| organization | `machine_version` | addition | each machine, its own row |
| organization | `workspace_floor` | addition | the first post-857 step, then the upgrade |
| organization | `organization_floor` | addition | the first post-857 step, then the upgrade |
| workspace | `data_floor` | addition, created with the first post-857 step | that step (addition or upgrade) |
| workspace | `applied_step` | addition | whoever runs a step above `schema_version` |
| organization | `workspace.schema_version` | existing; now the legacy floor | the upgrade, only when it stops pre-857 builds |
| organization | `format` | existing; now the legacy floor | the upgrade, only when it stops pre-857 builds |

The recorded structure (`schema_version` inside the workspace) keeps counting applied steps,
additions included; the organization copy no longer tracks it.

# Technical Approach

The order is foundation first, so every later ticket has a verdict to read:

1. **Step declarations and floors** (`upgrade/step.rs`, `upgrade/floor.rs`, the three tables,
   the legacy fallback). Nothing else can be written without a verdict.
2. **The machine version record**: it has to start recording before any upgrade can list who is
   behind, so it lands early and starts filling on every machine that updates.
3. **Additions on their own**: the lease and the format runner split, the auto path restricted
   to additions. This is what lets a member's newer build open everything.
4. **The verdict at every entry**: launch, resume, sign-in, join, switch and remote reach pull
   first, then judge, then write; resume carries the refusal; the heartbeat judges after the
   organization pull and before the workspace push.
5. **Read-only**: the Rust refusal and the push hold, the TS fold, the notice.
6. **The permission flag**, with the manager carry-over (Migration).
7. **The explicit upgrade**: preview, run, lock, sheet, the available mark, `useUpgraded`.
8. **The updater in Rust** and `update-action`, then the launch check and install at quit.
9. **The switcher callout** for an organization that cannot open, the update-required screen for a
   workspace, the error screen drawing its reason, retry that does not loop.
10. **Unsent changes**, classified on push after an upgrade (spec requirement 10).
11. **Carry-over tests** seeded at every shipped version (spec acceptance criterion 13).

8 is independent of 1 to 7 and can be built beside them; 9 needs 4 and 8.

# Integration

- **`[[rules/interface]]`, *Application surfaces***, allows two shared surfaces and says a third
  is answered there. The organization's refusal is drawn on the way-in surface's switcher, which
  needs no new surface; the workspace's update-required screen stands inside the application in
  place of the workspace, and the ticket that builds it amends that section to say so.
- **`[[rules/migrations]]`** gains a section: every new step is declared in `upgrade/step.rs`
  with its kind and floors, a meaning change is split into an addition and an upgrade, and the
  ticket adding a step names its kind in its acceptance criteria.
- **`[[contexts/desktop/persistence]]` and `[[contexts/desktop/organization]]`** describe the
  floors, the legacy numbers and the two kinds, in the closing ticket.

# Migration

- **Data from before this effort** has no floor rows. Its floors read as its current version
  (spec requirement 13): a workspace at `schema_version` 7 reads `{ level: 7, read: 7, write: 7 }`
  and an organization at format 3 reads `{ level: 3, read: 3, write: 3 }`. Nothing is written to
  make that true, so no organization or workspace is touched to carry it.
- **Already-shipped steps are declared** in `upgrade/step.rs` with the floors they effectively had:
  every one an upgrade step whose floors equal its own number, because every pre-857 build
  refused on any rise. `0006` and format 3 are declared as their meaning requires. Each is also
  marked `shipped_before_857`, and keeps running on open as 0.20 runs it (Architecture).
- **A new permission reaches existing organizations through new certificates.** Every pre-857
  root certificate carries the owner's mask as it was at setup as its `ceiling`, under the
  organization key's signature, so it lacks bit 18. A role row is covered only when its mask sits
  inside the signer's ceiling (`authority/chain.rs`, `Authority::Role`, no exemption for the root),
  so the store refuses a manager role carrying bit 18 under that root, and writing it around the
  check would make the role table unreadable for everybody (role rows refuse the whole read).
  Managers' certificates lack the bit for the same reason. Found by ticket 06 on 2026-10-07; the
  human chose re-issuing over reusing a flag or tying the act to the built-in roles.

  So at the owner's first sign-in on a build whose `OWNER_ROLE` knows more flags than the root's
  ceiling, the owner's machine, in order: re-issues the root with the current `OWNER_ROLE.mask`
  and retires the old one, re-signing or re-issuing what the old root issued, on the pattern of the
  handover's re-signing; adds bit 18 once to the stored manager role, keeping any other edit the
  owner made to it; and re-issues each live certificate whose standing now reaches further than
  its ceiling (`reissue_within`). It is general: the next new flag takes the same path. Every row
  and certificate still verifies afterwards, on this build and on a pre-857 build, since a mask is
  a number to both and the handover's re-keying already runs on them. Until the owner signs in, a
  manager is refused the upgrade with the reason that the owner has not opened this version yet.
- **Pre-857 machines** have no `machine_version` row. The sheet lists them as on an unknown
  version, which reads as stopped by any upgrade that moves a legacy floor.

# Testing Strategy

| Criterion | How it is checked |
| --- | --- |
| 1 | Rust: a workspace seeded at 7 with a fake addition step and a fake upgrade step, opened by a member's and a manager's session; vitest: a capability on `useUpgraded` shows its reason and appears after the run |
| 2 | Rust: `WORKSPACE_STEPS` and `FORMAT_STEPS` cover every embedded step; every addition's SQL passes `addition_sql_is_additive`; `Floors::standing` over below, at and above each floor |
| 3 | Rust: the command through `GATES` with the owner, a manager, a custom role, an override granting and one removing the flag, and a `needs_owner` step; vitest: the sheet lists stopped, read-only and unseen machines |
| 4 | Rust: two sessions on different `known()` values write and read `machine_version` |
| 5 | Rust: an upgrade failed partway on a seeded workspace and organization leaves version, floors and tables as before and a copy written; a write from a second session during the lease is refused or waits |
| 6 | Rust: `execute_*` refuses every write while `ReadOnly` and `replicate` does not push; vitest: the routers refuse with the version reason and the shell draws the notice |
| 7 | vitest: each entry with an organization refusal lands on the switcher with the callout, in both locales, another organization opens from there; a workspace below its read floor lands on `update-required` and another workspace opens from it |
| 8 | vitest: launch, resume, sign-in, switch and join draw the reason, and retry on the same refusal stays put |
| 9 | Rust: a floor raise pulled into a running session sets `Standing` before the heartbeat's next write; vitest: `applySyncOutcome` moves before reconcile |
| 10 | Rust, live (`RENTABLE_LIVE_TURSO=1`, as the prototype): captured changes pushed after an addition and after a removal, the second asked about before anything is dropped |
| 11 | vitest: `update-action` against a mocked host through each outcome |
| 12 | vitest for the launch check and the offer; Rust for install at quit against a stubbed updater; **a human check on Windows** that install at quit runs the installer and does not relaunch |
| 13 | Rust: the seeded organizations and workspaces of every version since 0.14.0 (`[[rules/migrations]]`) open as owner and member with floors equal to version and nothing written |

# Operational Considerations

- **The first release with this effort moves no floor.** It records versions and runs additions
  only, so the first upgrade anyone can press comes with a later release, by which time most
  machines have recorded what they run.
- **A human check on Windows** for install at quit, and a live Turso check of an upgrade on a
  throwaway workspace, are handed over at the close.
- **The changeset** names the update screen, read-only, and the upgrade sheet.

# Technical Risks

- **Pushing captured changes across an addition is measured and safe**: twelve live cases, both
  orders, nullable, defaulted and new-table additions, inserts and updates, all pushed with the
  right values
  ([[efforts/857-updating-never-locks-a-member-out/evidence/prototypes/an-older-replica-pushes-after-an-added-column]]).
  Two cases were not run: an older build on an **older engine version**, and a **removed or
  renamed column**, the known failing case in `store/format.rs`. The first is why the carry-over
  test of criterion 13 seeds replicas with the engine as shipped where it differs; the second is
  why criterion 10's removal path asks before dropping anything.

- **`PRAGMA query_only` on the turso engine** is untested. If it is not honoured, the refusal
  classifies statements with the engine's parser, and a ticket measures which before building on
  it.
- **Pre-857 builds mid-session** do not judge anything after a pull, so when an upgrade moves a
  legacy floor they push until their next launch. The sheet lists them as on an unknown version,
  and an upgrade that moves no legacy floor does not affect them.
- **A step misdeclared as an addition.** `addition_sql_is_additive` checks the SQL shape; meaning
  is a review question the declaration test cannot answer, so the ticket that adds a step must
  name its kind in its acceptance criteria.
- **Install at quit on Windows** exits the process from the installer; the quit path must have
  pushed first, and a failure to install must not block quitting.
