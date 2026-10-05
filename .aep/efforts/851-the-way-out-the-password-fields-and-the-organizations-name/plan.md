---
use-when: "building a ticket in effort 851 and the approach is not obvious from the spec"
---

# Architecture

Four strands over one spec ([[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]]):
several organizations on one machine, links that are spent and lapse, the password fields, and
the organization's signed name. Paths are relative to `apps/desktop/` unless written in full.

Four choices were put to the human on 2026-10-05. They answered the switcher's anatomy directly
(the chosen organization shown, a hover, a click opening a dropdown with an x on each row and
"add +" last; written into requirement 3) and left the other three to be decided "for usability
and security"; each is recorded below with what lost.

## The machine's record holds a list, and still writes the old key

`RemoteSyncStore` (`tauri/src/machine/record.rs`) gains:

- `held_organizations: Vec<HeldOrganization>`, serialized as **`heldOrganizations`**. Never
  `organizations`: `upgrade/shape.rs` reads that key as the pre-2026-09-13 shape and forgets the
  machine, and so does every older build.
- `selected_organization: Option<String>`, serialized as `selectedOrganization`: the organization
  the wall opens on, the one last signed in to (requirement 2).
- **`organization` stays, written as a copy of the selected entry on every commit**, and is
  read only by the conversion below. *Chosen for the human, who did not answer this question:
  the updater has a way back to the previous release (`tauri/src/startup/mod.rs`, "the route back
  after a failure"), and a rolled-back build that finds `organization` keeps working on the chosen
  organization. List-only lost because a rollback would land the person on the welcome with their
  data unreachable.* An older build drops the unknown `heldOrganizations` at its next commit, so
  after a rollback the other organizations' entries are gone from the record while their files
  stay on disk; that is the accepted cost of a rollback, and adding them again takes a link.

`HeldOrganization` gains, each `serde(default)`:

- `turso_organization: Option<TursoOrganization>`, moved down from the top level, so each
  organization knows its own Turso organization and group (requirement 14). The top-level field
  stays readable for the conversion and is no longer written.
- `workspace_id: Option<String>`: the workspace this organization last had open, so a switch
  back opens it again.
- `name_signed: bool`: the latch for the signed name (below).

`LocalReplica` gains `organization_id: String` (`serde(default)`), so removing one organization
finds exactly its workspace replicas (requirement 5). The alternative, deriving them from the
organization replica's workspace table, misses deleted workspaces and every workspace when that
replica is damaged; it is used only as a second source when the field is empty.

**The conversion runs in `RemoteSyncStore::sanitize`**, at load, with no keyring: where
`held_organizations` is empty and `organization` is present, the one organization becomes the
list's only entry, `selected_organization` its id, the top-level `turso_organization` moves into
it, and every `LocalReplica` with an empty `organization_id` takes its id. `Persisted::load`
commits the cleaned record at once. The keyring half of the move (the Turso consent, below) runs
in the once-per-launch cell, which holds the credential store.

**The current `workspace` stays one top-level value and means the open organization's.** It is
set from the entry's `workspace_id` on every sign-in and switch, and `workspace::open`'s
`organization_standing` (`organization/workspace/open.rs`) refuses to judge a workspace whose
replica entry names another organization. Without that guard, signing in to B with A's
workspace current reads as `GrantEnded` and deletes A's `ws-<id>.db`. `last_reached_at` and the
two in-memory refusals are cleared on sign-out, switch and remove, since each describes the open
organization.

## Each organization keeps its own Turso consent

The consent token moves from the keyring account `owner` to **`org:<organization id>`** under the
same service, `rentable.turso-platform` (`tauri/src/turso/consent.rs`). `owner` stays as the
**pending slot**: a consent finishes before setup or connect-existing has an organization id, so
`store_platform_token` keeps writing `owner`, and `setup::finish`, `setup::connect` and
`setup_reconnect_authority` move it to `org:<id>` (read, set, read back, delete, as `result()`
already does) once the id is known. `platform_token`, `setup::authority`, `owner_platform`
(`organization/act.rs`) and `PlatformApi` take the organization id and read that account;
`consented_organization` stops caching a slug across organizations; `abandon_the_consent` and
`forget` delete only the account they own. The test pinning the account names
(`consent.rs`, `nothing_but_this_module_names_the_platform_token_service`) is widened.

**The existing `owner` entry moves at launch**, in the once-per-launch cell in `state_of`
(`organization/session/command.rs`, beside `forget_old_shape`), before `resume_remembered` and
before anything calls `owner_platform`: where `owner` holds a token and exactly one held
organization carries a `turso_organization` but no `org:<id>` entry, the token moves to it. A
lazy fallback in `owner_platform` lost because it leaves two names for one token for as long as
nobody happens to call it, and [[rules/credentials]] wants one home.

## One organization open; select, remove, resume

- **`session_select(organization_id)`** persists `selected_organization`. It is refused while a
  session is open (requirement 9). `session_sign_in` is unchanged and signs in to the selected
  entry, which `open_replica` already takes by reference.
- **`session_remove(organization_id)`** is the switcher's x, through **`forget_one(id)`**, the
  per-organization form of `organization/session/forget.rs`. Where the id is the open one it does
  today's first three steps (leave the registry, sign out, release the engine). For any id it
  deletes the remembered key for `id:member_id`, `org-<id>.db*` and the `ws-<wid>.db*` of that
  organization's replica entries (through `Database::remove_replica_files`, which handles the
  sidecars), the entry and its replica entries, and the `org:<id>` consent. If the removed entry
  was selected, the selection moves to the first remaining entry or to none, which is the
  welcome. A removed organization that is not open leaves its registry row to age out, as a
  disconnect from the wall already accepts. **The prefix-wide `sweep_replicas` is retired**;
  delete-organization, `forget_deleted_organization` and the old-shape check all call
  `forget_one` for the organization they concern. `session_disconnect` (the settings area's
  disconnect, signed in) is `forget_one` of the open organization.
- **Resume at launch tries the selected organization only**, keeping one open.
- **Sign-out, `held_here`, the heartbeat and ownership** key off `member.organization_id` and
  find their entry in the list. `signed_out_elsewhere` is cleared on select, and an organization
  that was signed out from elsewhere while not open learns it at its next sign-in through the
  epoch check that already runs there (requirement 9).
- **Adding**: the five `AnotherOrganizationHeld` refusals go. `connect::record`, `setup::finish`,
  `setup::connect`, `join::accept` and `machine::connect` insert an entry and select it.
  `RefusalReason::AnotherOrganizationHeld` is removed with its strings and the frontend's mapping
  (`error/tauri.ts`, `organization/setup/setup.ts`, `organization/setup/connect.ts`).
- **A link or a connect-existing for an organization already held** is answered before anything
  is opened: its entry is selected and nothing is admitted (requirement 13). This is what keeps a
  refused link from ever touching a held organization's `org-<id>.db`, which sits at the same
  path.

## Links are spent before anything is recorded, and lapse when their maker says

**`join::accept`** (`organization/invitation/join.rs`) is reordered so the invitation's standing
(lapsed, consumed, revoked) and the removed-member check run on the store reached with the link's
credential, read with the link's own pinned key (`JoinLink::verifying_key_bytes`), before
`connect::connect` records anything; and the record itself moves to after the vault opens, so a
wrong code or an altered link also records nothing. `machine::connect` already judges its row
first. **On any refusal for an organization not held, the replica the link pulled is deleted**
through `leave_no_replica`, moved out of `organization/setup/mod.rs` into a shared place both
commands and setup reach (the store dropped first, for Windows). *Chosen over opening every link
at a scratch path and renaming it into place: that adds a second open path to every link command
and a rename across Windows file locks, and the held-organization short-circuit above already
removes the only case where deleting could hurt.* The connect screen's "go to the sign-in" branch
for a consumed link is retired: a consumed link is refused with "ask the owner or a manager for a
new link" (requirement 10).

**The lifetime** is chosen by the maker in hours from the set {1..23, 24, 48, 72, 96, 120, 144,
168}, 72 by default (requirement 11). `make_link` (`organization/invitation/mod.rs`) takes
`lifetime_hours` and refuses any value outside the set with a new `RefusalReason::LinkLifetime`;
`link_expiry` becomes `min(now + lifetime, credential expiry)`, and `INVITATION_LIFETIME_MS`
retires.

**An owner's link carries a credential minted for it.** Where the maker's machine holds its
organization's consent (`owner_platform` answers), `make_link` mints a token for the organization
database with `expiration` equal to the lifetime and seals that in place of the maker's grant.
A manager's machine has no consent and seals its own grant, as today. *Chosen for the human, who
asked for the option that serves the person without compromising security: it makes every
owner's link dead on Turso when it lapses, costs one Platform API call per owner link, and needs
no network a link does not already need (the invitation row is pushed when it is made). Sealing
the grant everywhere lost because it leaves an owner's link reaching the database for up to four
weeks. A mint service the owner's machine runs for managers lost because it does not exist and
would put the owner's machine on the path of every invitation.* The Turso duration spelling for
hours is confirmed against [[references/turso]] before relying on `h`; where it is not accepted,
the lifetime is written in minutes (`180m`).

## The password fields: one block in the design package

**`packages/design/src/lib/block/password-input.svelte`**, a composite of
`primitive/input-group` reaching nothing past the design system, so it belongs in the package
([[rules/frontend]], *Components*). It always draws `InputGroup.Root`, an optional leading
`KeyRound` addon (`lead`, for the fields that carry one today), `InputGroup.Input` with
`type={held ? 'text' : 'password'}`, and an `inline-end` addon holding an `InputGroup.Button`
(`size="icon-xs"`, `type="button"`). `value` and `ref` are bindable; `class` goes to the Root (so
the bare fields pass `h-9` and the dialog fields `insetControl`); everything else goes to the
input, which is what keeps it working inside `Form.Control`, since this repository puts the
control directly as its child and formsnap hands it nothing. **Its accessible name comes in as a
`label` prop** from `$LL`, so the `DesignStrings` contract does not grow for one string.

The glyph is `eye-closed` at rest and `eye` while held (the human's "closed eye"), crossing with
the motion row of [[contexts/desktop/components]] and `motion-reduce:`. **No tooltip**: while held,
a tooltip would cover the field it is revealing, and the name is carried by `aria-label`.

The hold: `pointerdown` with `preventDefault` (the caret and the focus stay in the field), released
by `pointerup` and `pointercancel` on `window` and by the window's `blur`; Space `keydown`
(repeats ignored) and `keyup` on the button, and the button's `blur`. All eleven fields in the
spec's table move to it. The block is tested in the package; each surface's own test checks its
field (criterion 19).

## The owner's confirmation

`SetupField` and `SETUP_WALK` (`organization/setup/setup.ts`) gain `confirmation`, after
`password`, and the walk's `SetupSchema` (`organization/setup/component/walk.svelte`) a
`superRefine` putting the mismatch on `['confirmation']`, after the tenant form's precedent. The
label and the mismatch sentence are `organization.join.confirmLabel` and `organization.join.mismatch`,
which already say this. The refusal is the walk's own field error (requirement 17).

## The group field keeps the form

*Added 2026-10-05 for requirement 30, while the effort was being built.* The walk's test of the
group field rerenders the walk with `askGroup` and finds the values kept, yet the human sees them
cleared after a real refused create, so the cause lies on the path the test skips: the form's
own handling after `onUpdate` resolves (superforms resets a valid SPA form by default once the
submit handler returns, and `create` in `first-run.svelte` catches the refusal so the handler
returns normally), or the walk being torn down while `isCreating` holds. Ticket 12 pins it with a
failing test through the real path first ([[skills/implement/diagnosing]]), then fixes it where
the cause is; the form state stays in the walk.

## A new member starts locked

*Added 2026-10-05 for requirements 31 to 37, while the effort was being built.*

- **A new table, `member_lock`**, appended to `TABLES`/`SCHEMA` after `organization_name` and
  completed by `complete_schema` with no format change, as `machine_sign_out` was: one row per
  member, `member_id`, `locked`, `updated_at`, signer and signature. A field on `MemberAuthority`
  was ruled out: it changes the member row's preimage, which breaks every existing signature and
  needs a format bump.
- **`Authority::MemberLock { member_id, locked, updated_at }`** with its own domain constant.
  `covers`: the root, or a certificate holding `AssignRole` or `OverrideMember` that outranks the
  member and is not the member's own, after `WorkspaceOverrideAuthority`'s arm. Re-signed at
  handover with the other rows of certificates.
- **Reading it.** A member with a verifying row reads what it says; a member with a row that does
  not verify reads locked; a member with no row reads unlocked (the carried-over members, until
  the backfill below says otherwise). The verified answer rides `SessionFacts` (`locked`) and the
  roster's `MemberStanding` (`locked`).
- **Writing it.** `write_account` writes a locked row beside the member row; `unset_password`
  (the reset) writes a locked row; the new `member_unlock(member_id)` writes an unlocked row, and
  is refused for a member whose password is not yet set, for the actor's own id, and for an actor
  without the flags or the rank.
- **The backfill**, beside `repair_owner_row`: the first machine of a member who could sign the
  row and opens the organization writes a locked row for every member with no lock row whose
  password is not set and who has no consumed invitation, and pushes.
- **Enforcing it.** `acting_row` (or the `actor()` path every organization command goes through)
  refuses a locked actor every act but sign-in, sign-out, the password change and reads, with a
  new `RefusalReason::Locked`. On the frontend, `permissionsIn` masks a locked session's
  permissions to the view flags, so every `procedure.permitted` record write refuses and every
  control keyed on a flag is not drawn; the wall-to-workspace screens show the locked sentence.
- **The card.** `organization/member/component/card.svelte` draws a `locked` outline badge beside
  the existing footer badges, and the unlock where `acts.ts` says the reader may (a new
  `canUnlock`), confirmed through the destructive-confirm pattern the directory already uses.

## The switcher

**`organization/component/switcher.svelte`**, an application component (it reads `$LL` and the
state), over `primitive/dropdown-menu`, which [[contexts/desktop/components]] gives to several
commands behind one control. The trigger is a plain outline `Button` sized as a row, carrying the
tile, the name in `<bdi>` and `ChevronsUpDown`, with the hover the human asked for. The tile is a
tinted square holding the name's first letter (`primitive/avatar` is for people). The content is
the workspace menu's anatomy (`workspace/component/menu.svelte`): a `RadioGroup` of the held
organizations with the check on the chosen one, each row carrying a trailing x (`aria-label`
"remove <name>", its click stopped so it never selects the row) that opens the remove confirm for
that row; then a separator and "add organization" with `Plus`. It scrolls past five rows as that
menu does.

**On the wall** it heads the `children` of `way-in-surface`, above the username. The wall's title
becomes "sign in" and its description goes, since the switcher now names the organization
(requirement 2, the name drawn once). **On the no-workspace screen** it replaces the name line.
Its acts from there sign out first where they change the organization (select, add) and not
where they do not (removing another organization), since switching happens signed out
(requirement 8).

**Removing** opens `DisconnectDialog` named for the row's organization. Its sentence keeps effort
824's wording; the clause about forgetting the Turso account is said only where that organization
holds this machine's consent, since it is false otherwise.

**Adding** goes to `THE_FIRST_RUN` or `THE_JOIN` as the welcome does. The selection lives in the
record, not in component state, so going back from either brings the wall up on it and a finished
add has already selected the new one. `startupScreen` (`startup/screen.ts`) lets the
no-workspace screen reach those two addresses. The wall's foot control drops both extras
(requirement 15); the `extras` prop of `way-in-preferences.svelte` goes with them, since nothing
else hands any in.

## The organization's signed name

**A new signed table, `organization_name`**: `(id TEXT PK = 'name', name_sealed BLOB, updated_at
INTEGER, certificate_id TEXT, signature BLOB)`, appended last to `TABLES`/`SCHEMA` in
`organization/store/mod.rs` and completed on pull by `complete_schema`, with no format change, as
effort 846 added its tables. A new `Authority::OrganizationName { name_sealed, updated_at }` with
its own domain, `covers` answering `certificate.is_root()` (the owner, with no flag), and
`needed_for` saying "the owner's certificate". It is re-signed in
`re_sign_rows_of_certificates_but`, so an ownership handover keeps it valid. *Chosen for the
human, who asked for the most secure option that stays easy to use. A signature column on
`organization` lost: no mechanism adds a column to a replica, it would likely need a format bump
that takes members on older builds off the organization, and an older build accepting ownership
rewrites that row with `INSERT OR REPLACE` and would wipe the column.*

**Reading**: `facts_of` (`organization/session/mod.rs`) takes the name from the signed row where
it verifies. Where there is no signed row and the machine's entry has `name_signed: false`, it
falls back to `organization.name_sealed`, which is what every organization shows today. **Once a
machine has read a signed name it sets `name_signed`, and never falls back again**: a missing or
forged row then shows the name it last held. *The latch is what keeps existing organizations
readable on day one without leaving the unsigned column forgeable forever. Showing only the held
name until the owner signs lost on usability: members of an organization whose owner rarely
signs in would see a name nobody can change.*

**The owner's machine signs the existing name** at its next sign-in, resume or heartbeat, beside
`repair_owner_row` (`organization/ownership/repair.rs`), where no signed row exists.

**The rename** is `organization_rename(name)`: the gate is the session's role alone, a flagless
`require_owner_alone` beside `require_owner` (`organization/workspace/mod.rs`), with a new
`Gate::OwnerAlone` in the command gate table (`organization/mod.rs`); the router procedure is
`procedure.member`, the documented case whose check is Rust's alone (`api/trpc.ts`). Rust trims,
refuses empty (`OrganizationNameMissing`) and over 120 characters (new
`OrganizationNameTooLong`, applied to setup as well, which checks only for empty today). It writes
the signed row **and** `organization.name_sealed` with the same sealed value, through
`write_organization` with `..organization`, so members on older builds see the rename too; then
pushes, updates the owner's held entry at once (as `rename_held_workspace` does) and returns the
whole `OrganizationState`.

**Other machines' held names** are refreshed in `state_of`, after `current_facts`, writing the
entry only where the verified name differs. The frontend rereads the state on every heartbeat and
after sign-in, so the wall and the switcher follow (requirements 25 and 26).

**In the organization tab** a new first card, before the standing, shows the organization's name
as a row; for the owner it carries an edit control opening a light `FormSurface` after
`workspace/component/rename-form.svelte` (trim, the walk's two sentences, an unchanged name closes
with no write).

# Interfaces

| Seam | Today | After |
| --- | --- | --- |
| `OrganizationState` (Rust `session/command.rs`, TS `organization/host.ts`) | `organization: HeldOrganization \| null` | `organizations: HeldOrganization[]`, `selected: string \| null`; `holdsTursoAuthority` is the selected organization's |
| `OrganizationHost` | `disconnect()` | `select(id)`, `remove(id)`, `disconnect()` (the open one), `rename(name)` |
| Commands | `session_disconnect` | `session_select`, `session_remove`, `organization_rename`; `session_disconnect` forgets the open organization |
| `make_link` / its command and router | no lifetime | `lifetimeHours`, validated in Rust |
| `admission.ts` | `organization === null` | `organizations.length === 0` |
| `startup/wall.ts` | `disconnect()` | `select(id)`, `remove(id)`, guarded by `isSigningIn` and `isCreating` |

Every fixture and test listed by the evidence that builds `organization: {...}` moves to the new
shape in the ticket that changes it; a derived `organization` kept for compatibility lost, since
it would be a second answer to "which organization" in the one state the shell reads.

# Technical Approach

Steps, in the order they land. *Cut on 2026-10-05 into eleven tickets under `tickets/`: step 5 became tickets 05 (the record) and 06 (the consent), and the steps after it moved up one. The tickets' `blocked-by` is the order from here on.*

1. **The password input block** and the eleven fields. Independent of everything else.
2. **The owner's confirmation** in the walk.
3. **Spent links refused before anything is recorded**, and the replica a refused link pulled
   deleted (for an organization not held). Lands before the multi-organization work because it is
   a fix on today's single-organization shape, and the held short-circuit (ticket 07) builds on it.
4. **The link's lifetime and the owner's minted credential**, with the making UI's choice and the
   handover's date and time.
5. **The record holds a list**: the conversion, the mirror, the replica's organization id, the
   per-organization Turso organization and consent with its launch move, and the workspace guard.
   **Its first step is the frozen fixture of a current-release machine** (criterion 16), written
   test-first, so the conversion is built against the real shape ([[skills/tdd]]).
6. **One organization open; select, remove, add**: `forget_one`, `session_select`,
   `session_remove`, the refusals turned into adds, the held short-circuit for links and
   connect-existing, resume of the selected only.
7. **The state and the switcher**: the frontend shape, the wall and the no-workspace screen, the
   foot control, the startup routing.
8. **The signed name**: the table, the authority, the re-sign, the owner's backfill, the latch,
   the held-name refresh.
9. **The rename**: the command, the gate, the length check, the tab's card and form.
10. **Contexts, comments and the changeset**: [[contexts/desktop/remote-sync]] and
    [[contexts/desktop/organization]] say a machine holds several organizations and how each is
    kept; the code comments naming the old rule (`machine/record.rs`, `sign-in.svelte`,
    `setup/command.rs`, `invitation/machine.rs`) are corrected where their tickets touch them; one
    changeset per user-visible ticket rides with it ([[references/changesets]]).
11. **The group field keeps the form** (ticket 12, added 2026-10-05): built on the owner's
    confirmation, since both live in the walk's one form.
12. **The lock** (tickets 13 and 14, added 2026-10-05): the signed row, the backfill and Rust's
    refusal, built on the signed name since both append a table and an authority; then the badge,
    the unlock and the read-only session.

5 precedes 6 because every command in 6 reads the list; 6 precedes 7 because the switcher calls
its commands; 8 precedes 9 because the rename writes the signed row.

# Migration

- **The record**: converted in place at load (above). Nothing is forgotten; the test in
  criterion 16 starts from a frozen current-release record.
- **The keyring**: the Turso consent moves from `owner` to `org:<id>` at the first launch;
  remembered member keys are already keyed by organization and do not move.
- **The replicas**: no file is renamed or pulled again; replica entries gain their organization's
  id from the record.
- **The organization database**: one new table, created by `complete_schema` on every machine's
  next pull; no format change, so members on older builds keep opening the organization and keep
  reading `organization.name_sealed`, which the rename also writes.
- **Existing names** are signed by the owner's machine at its next sign-in; until then every
  machine shows today's name.

# Testing Strategy

| Criteria | Where |
| --- | --- |
| 1, 12, 13 | Rust: `invitation/join.rs`, `invitation/machine.rs`, `invitation/connect.rs`, `setup/command.rs`, `setup/connect.rs` tests over two held organizations; component test of the welcome |
| 2, 3, 4, 6, 7, 15 | component tests of the switcher (`organization/tests/`), `startup/tests/sign-in.svelte.test.ts`, a no-workspace test, `settings/tests/way-in-preferences.svelte.test.ts` |
| 5, 8, 9 | Rust: `session/forget.rs` (two organizations, byte-for-byte), `session/command.rs` (sign-out of one, heartbeat of the open one only), `session/replica.rs` (resume the selected) |
| 10, 11 | Rust: `invitation/join.rs` and `invitation/machine.rs` (second opening refused, record unchanged, no replica file; each lifetime; off-step refused; owner's sealed credential's expiry equals the link's); component tests of the link act |
| 14 | Rust: two organizations on two Turso accounts against the in-memory platform |
| 16 | Rust: a frozen current-release `remote-sync.json` with a keyring and data directory, through load, the launch cell and a resume |
| 17, 18 | `organization/setup/tests/walk.svelte.test.ts`; the existing join and change-password tests unchanged |
| 19, 20, 21 | the block's tests in `packages/design/src/lib/block/tests/`, with `fireEvent` pointer, key and window events (the repository has no user-event); one test per surface for its field |
| 22, 23 | `organization/tests/` component test of the tab; form and router tests |
| 24, 25, 26, 27, 28, 29 | Rust: the rename command's gate and refusals, two-replica refresh, old and new links, the forged unsigned row against the latch, an organization made before this change |

# Operational Considerations

- **Rollback**: a rolled-back build keeps the selected organization (the mirror) and drops the
  others' entries from the record at its next commit; their files stay on disk, and a link adds
  them back.
- **An owner's link needs Turso reachable** to mint; offline, making it is refused with the
  network sentence the link act already says, rather than falling back to sealing the grant.
- **The owner must sign in once** on the new build for the name to be signed; until then nothing
  changes for anybody.

# Technical Risks

- **The launch move of the consent runs before anything uses it**, or an owner-only act on the
  first launch would find no token. The cell's order (old shape, consent move, resume) is tested.
- **Turso's `h` duration** may not be accepted; ticket 04 checks it against the reference and uses
  minutes where it is not.
- **Fixture churn**: about thirty test files build the old state shape. Ticket 08 moves them in
  one pass; a missed one fails typecheck rather than passing silently.
- **Two stores over one file**: the held short-circuit must run before `reached` opens a store, or
  an accept for the open organization opens a second store over its live replica.
