---
use-when: "building a ticket in this effort and the approach is not obvious from the spec"
---

# Architecture

Four independent strands over one spec
([[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]]). Two of them carried a real
choice of architecture, and the human chose on 2026-10-02; the others are design and factoring
calls written down here so the implementer asks nothing.

## Signing out one machine: a sign-out table only the other machines write

*Chosen by the human, 2026-10-02.* Requirements 9 to 11.

Today a member's sessions end through `member.session_epoch` in the organization database
(`tauri/src/organization/session/epoch.rs`): `end_elsewhere` raises it, and every machine compares
it with the epoch filed beside its key at launch (`remember.rs` `resumed`) and on every heartbeat
(`heartbeat::ended_elsewhere`). It ends all of a member's machines but the one raising it, so it
cannot end one.

**Two new tables in the organization store**, appended to `TABLES`/`SCHEMA` in
`tauri/src/organization/store/mod.rs` and completed on pull by `complete_schema` the way
`succession` was in effort 828 (format three unchanged, no format bump, and the 2 to 3 walk's
`install_format_three` creates them so the shape check still matches):

- `machine_sign_out(id PK = "<machine>:<member>", machine_id, member_id, epoch INTEGER, at INTEGER)`,
  a monotone counter, written `max(held, new)` like `set_session_epoch`. **Only the member's other
  machines write it; the target only reads it.** That is what makes it hold against an offline
  target: the replica merges per column with the last push winning, and a target that never writes
  the row cannot overwrite a sign-out it has not seen yet.
- `machine_name(id PK = machine id, name BLOB, named_at INTEGER)`, the machine's name **sealed
  under the content key** (`seal_content`/`open_content`), since [[contexts/desktop/organization]]
  holds that every name in the organization database is sealed. Only the machine itself writes it,
  and only where the unsealed value differs (a seal draws a fresh nonce, so an unchanged name is not
  rewritten).

**The acknowledged mark** is `HeldOrganization::machine_signed_out: i64` (serde default 0) in
`remote-sync.json` (`tauri/src/machine/record.rs`), after the `format` precedent for a fact kept
outside the replicated database. It is set to the table's current value at every password or vault
sign-in (one helper, called from `join::admit`, the invitation accept, the first run and the
owner's connect), **never on resume**. A machine is ended when the table's epoch for it and its
member exceeds the mark; it is checked beside the epoch at both places the epoch is checked, and an
ended machine takes the existing `sign_out` path with `signed_out_elsewhere = true`.

**`end_machine(machine_id)`**: `settled()` first; refuse this machine's own id (`NotYourself`); the
member is always the session's, never input; write `epoch = max + 1`; `UPDATE machine SET
member_id = NULL WHERE id = ? AND member_id = ?` so the row leaves the list at once; push, and return
`sent` for the offline sentence, as `end_elsewhere` does. **`end_elsewhere` keeps the epoch** (it
still reaches machines with no row and machines older than this version) and gains the same row
clearing for every other machine of the reader, so the list does not keep showing ended machines.

**Refusing a machine that has not run this version** (spec requirement 10): a machine with no
`machine_name` row has not run this build and would ignore the table, so its single sign-out is
refused with that reason and *sign out all other machines* is offered.

**The list** is every `machine` row whose `member_id` is the reader's, **with no presence window**
(a laptop closed for a month still holds a remembered key and is the case that matters), this
machine first, then by `seen_at` descending. `seen_at` is refreshed on the heartbeat at most once an
hour, so last seen means last contact rather than last launch.

**The machine name** is read by `whoami::devicename()` in a new `tauri/src/machine/name.rs`
(`whoami` becomes a direct dependency; confirm the 2.x signature in its docs before relying on it),
trimmed and capped at 64 characters on read and display, falling back to `None`. A row with no name
crosses as `null` and the interface writes *a machine added {date}*, never the id.

**Authority.** Both tables are unsigned, like `machine`, `machine_link` and the epoch. A holder of
the organization credential could end another member's machine or rename a row; that is the
availability-not-authority limit [[contexts/desktop/organization]] already records (human,
2026-09-15). The command keeps an honest client to the reader's own machines.

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **B. Separate table (chosen)** | Holds offline by construction; no `ALTER` on a replicated store; *all others* unchanged | Two more tables; an acknowledged mark in the local record | Unsigned, as the epoch is | One table, one helper, two checks |
| A. Column on `machine` | Smallest schema | The target's own `INSERT OR REPLACE` at launch erases an unseen sign-out; `ALTER ADD COLUMN` pushed twice by two offline machines can be refused for good | Silent loss of a sign-out | Every `machine` write rewritten as a column-scoped update, forever |
| C. Per-machine epoch everywhere | One mechanism | Keyring entry format changes; *all others* must enumerate rows and misses machines with none | Regression on old machines | Largest change on the credential path |

## A workspace that is not open: straight to Turso

*Chosen by the human, 2026-10-02.* Requirement 15.

Today `api.transfer.get` and `importWhole` read and write `ctx.db`, the one open workspace
(`transfer/router.ts`). **The open workspace keeps that path**, offline included. For any other
workspace, Rust runs the transfer's SQL against that workspace's Turso database over Hrana
`/v2/pipeline`, with the `WorkspaceCredential` the member's vault already unsealed for every grant
(`MemberSession.workspace_credentials`), so nothing is minted and a non-owner can do it. A
read-only grant's token is read-only at Turso as well.

- **Rust**: generalise `OverThePipeline`, `Pipeline::of` and `decoded` out of
  `organization/lease/apply.rs` into `organization/workspace/remote.rs` (backup's `Source` and the
  lease keep using them). Two commands, `workspace_query(workspace_id, query)` and
  `workspace_batch(workspace_id, queries)`, under `as_member`: the credential from the session or
  `NoGrant`; the hostname and schema version from the signed workspace record, never from the
  caller; `lease::refuse_newer`, and a new refusal for a workspace behind this build's schema
  (*open it once on this machine to bring it up to date*); single statements pass
  `reject_transaction_control` as `database/proxy.rs` does; a batch is `BEGIN`, its steps,
  `COMMIT`, rolled back on a failing step; unreachable is `Error::Network` with a sentence naming
  the workspace; a 401 or 403 collects the credentials again once, then refuses. Rows map to
  `SQLRow` exactly as `proxy.rs` maps them.
- **TypeScript**: `WorkspaceHost` (`organization/workspace/host.ts`) gains `query` and `batch`,
  invoked from its adapter `organization/workspace/tauri.ts`. `api/context.ts` gains
  `databaseOf(workspaceId): Database`, built by `createDatabase(single, batch)` over them: a third
  transport through the same factory, which [[rules/api-layer]] allows.
- **Router**: a new declaration `procedure.permittedIn(...flags)` in `api/trpc.ts` takes
  `{ workspaceId?: string }`; absent or the open id changes nothing; otherwise it reads the session,
  refuses without a grant, and continues with `db: ctx.databaseOf(id)` and
  `identity.permissions = permissionsIn(session, id)` before `requirePermission`, because
  `procedure.permitted` gates before input is parsed. `transfer.get`, `transfer.importWhole` and
  `transfer.held` take it. `autosync` skips its sync request when the target is not open.
- **Derived status**: the contract sheet exports stored `status`, which a workspace nobody had open
  across a day may hold stale. A transfer read from Turso computes status at read time (the same
  derivation `contract/reconcile.ts` writes), never by writing, since a read-only grant cannot write.

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **B. Over the pipeline (chosen)** | No file, no switch, no second engine; the constraint holds by construction | Online only; a round trip per statement; misses this machine's own unpushed writes to a held replica | Credential expiry (one retry) | One remote module, two commands, one transport |
| A. Transient local replica | Export offline from a held replica | Two engines on one file corrupt silently unless a lock spans switch, open, release and heartbeat; temp files and a crash sweep; an import that fails to push leaves a file | Corruption nothing reports | High |
| C. Swap the open database | Reuses everything | Every visible query and the cache hit the wrong database meanwhile | Wrong data shown | Low code, high hazard |
| D. Switch, then run | No code | Breaks the spec's constraint | n/a | none |

## The settings area: one shared group and row

*A factoring call, the agent's.* Requirements 1 to 5, 8, 12 to 14, 16.

Add shadcn-svelte's `item` primitive to the design package (`add item --cwd packages/design -y`,
never `--overwrite`, then prettier; [[references/shadcn-svelte]]), and build two blocks on it in
`packages/design/src/lib/block/`:

- `settings-group.svelte`: `title?`, `footer?` (one line), `rows` (snippet), `end?` (snippet for
  the destructive rows, drawn after a separator, so they are always last). Marked
  `data-settings-group`.
- `settings-row.svelte`: `icon`, `name`, `value?`, `control?` (a snippet given `{ labelId }`, so a
  toggle group is labelled by the row's name), `tone?: 'neutral' | 'error'`. An error row draws its
  icon and name in the destructive colour and its control as a destructive ghost button (button
  emphasis, which *Tone* leaves to shadcn). Marked `data-settings-row` and `data-row-tone`.

Rejected: spelling the look per block with `Field.*`. It needs no new files, but a dozen blocks each
carrying the grouped look in their own classes is how today's area drifted (one red button among
outline ones), and nothing in the markup would say *row* for the tests to find.

Row controls are labelled outline buttons with an icon (`Button variant="outline" size="sm"`);
updates' and diagnostics' icon-only chips become labelled buttons so every group reads alike.

**The section switch** (`block/section-switch.svelte`) takes `icon?`, drawn before the label, the
label kept in a span so `capitalize.test.ts` holds. The four glyphs move out of `settings/surface.ts`
into a window-only `settings/glyph.ts` (general `sliders-horizontal`, account `circle-user`,
organization `users`, workspaces `building`), read by the surface and by `area.svelte`, so the switch
and the command menu cannot disagree. Not on `settings/section.ts`, which loads under Node.

**Every block, mapped** (icons are lucide names; *end* is the destructive tail):

| Section | Group | Rows | End |
| --- | --- | --- | --- |
| general | language and appearance | language (`languages`), appearance (`sun-moon`) | |
| general | updates | this version (`package`); available (`download`) with check, install or restart; notes and progress beneath | |
| general | diagnostics | the folder (`folder`), path as value; reveal (`folder-open`) | |
| account | ownership offered, when one stands | the offer (`crown`), offered by; accept (`crown`) | |
| account | signed in as | avatar, username, role and organization | |
| account | password | password (`key-round`); change (`key-round`) | |
| account | machines | one row per machine (`laptop`), this machine first; others carry sign out (`log-out`) | sign out all other machines (`log-out`) |
| account | this machine | | sign out of this machine (`log-out`), moved out of `identity.svelte`; not confirmed |
| organization | sync | the state row (below); sync now (`refresh-cw`); callouts and their acts under it; *open Turso dashboard* gains `external-link` | |
| organization | signature or seal | the mark (`image`), preview as value; choose or replace (`image`) | remove (`trash-2`), confirmed |
| organization | Turso account, owner only | Turso account (`database`): connected on this machine, or not held here with reconnect (`plug`) | forget Turso account (`unplug`), when connected |
| organization | roles, members | tray and cards unchanged; heading takes the group's treatment | |
| organization | leaving | owner: hand over ownership (`crown`) | disconnect this machine (`unplug`); owner: delete organization (`trash-2`) |
| workspaces | directory | the earlier-records callout above, then the cards | |

**Hand over ownership in the leaving group** projects the reader's own member record through
`toPageActions` over `memberActs`, filtered to `member.offerOwnership` and `member.withdrawOffer`,
and runs `memberHost.run(act.id, record)`, so label, icon and refusal come from the one declaration.
`offerOwnership`'s condition that somebody can be offered moves from `appliesTo` to `unavailable`
(*nobody has set a password yet*), so the act is shown refused rather than missing, on the card and
here alike.

**Sync's five states** (requirement 12). `RemoteSyncState` has no in-flight fact, so a small
`sync/activity.svelte.ts` counts runs through `syncWorkspaceNow` (`sync/workspace.ts`), which both
the button and autosync go through, exported from `sync/ui.ts`. `syncStatusOf` maps:

| State | From | Tone, icon |
| --- | --- | --- |
| up to date | `synced` | success, `circle-check` |
| syncing | in flight, over `synced` or `neverReached` | info, `refresh-cw`, not animated |
| not yet reached | `neverReached` | neutral, `cloud-off` |
| needs attention | `accountRefused`, `credentialRefused` | warning, `triangle-alert` |
| needs reconnecting | `needsReconnect` | error, `octagon-x` |

A problem keeps its state while a retry runs. `syncStandingSentence` splits into the state word and
a *last reached* line drawn whenever `lastReachedAt` is set.

**The workspace card** (`organization/workspace/component/directory.svelte`) keeps the disc and adds
*open on this machine*; the member count with `users`; the reader's own access from
`session.workspaces[i]` (`accessLevel`, `pinned`), worded as what they may do (*you may edit*,
*you may read*, *set for you*, *owner*), never *full access* or *no access*, which the interface
rule bans on the member card. Its acts gain `workspace.export` (`file-down`) and `workspace.import`
(`file-up`) in `primary`, after members, on every card, each refused by
`refusalOfEvery(EXPORT_FLAGS | IMPORT_FLAGS, standingOf(workspace.id), t)`, a standing built from
`workspacePermissionsIn` and `accessIn` for that workspace, not from `memberPermissions`, which is
the open workspace's. The host runs them: export is the save dialog, `api.transfer.get({ workspaceId })`,
the workbook writer and a reveal; import mounts one `WorkspaceImportDialog` for the record's
workspace, naming it in its title. `transfer.svelte` is deleted.

**The earlier-records callout** stands between the tray and the cards, names the open workspace it
brings the records into (a `{workspace}` parameter on `earlier.description`, en and ar), passes its
id explicitly, and with nothing open keeps its *open a workspace to bring them in* line and no act.

## Ending soon on the dashboard

Requirements 3, 6, 7.

`api.dashboard.get` already returns `endingSoonNoticeDays`. A new `dashboard/component/ending-soon.svelte`
is a ghost icon button (`calendar-cog`) at the end of the ending-soon section's header, given to
`section.svelte` as an optional `control` snippet for that rank only. It opens a popover with the
setting's name, a number field with steppers, *days*, and one line; it writes through
`useSetEndingSoonNoticeDays` (exported from `settings/ui.ts`) a short wait after the last change,
marks an invalid value on its own field, and on a failed write puts the old value back and lets the
shared handler say why. The success toast goes; the change is visible in place.

**With no contract in the window** the section's header is drawn in the rank's own place, with no
rows, reading *none end within the next {n} days*, and the same control; under the empty state when
nothing ranks at all. Rejected: a text control above the sections (two homes for one setting, and
not in the section's header), an act on the empty state alone (fails when other ranks hold rows),
the command menu alone (not on the dashboard).

**Every reader refreshes.** `dashboard/surface.ts`'s `endingSoonReaders` becomes a list of keys and
the contract surface contributes its list and record prefixes, so the contracts filter, a contract's
page and the schedule stop going stale (an existing gap). The command menu gains a dashboard place
`/?ending-soon`; `landing.svelte` reads it, opens the popover, and clears it with
`replaceState`. `settings/component/ending-soon.svelte` and its test are deleted.

## The card grid and the ledger

Requirements 18 to 20.

The list shell already lays records in columns (`recordMinWidth`, `listRows` in
`packages/design/src/lib/group.ts`, column-aware movement in `list/keyboard.ts`); no list turns it
on. In `list/`:

- a pure `columnsFor(width, min, gap, max = 3)` in `list/list.ts`, used by the viewport and the
  skeleton alike, replacing `floor(width / recordMinWidth)`, which ignores the gap and has no cap;
- `gap-3` on `rows.svelte`'s multi-column grid, which the skeleton already has;
- the selection checkbox stays beside the card in its cell, aligned to the top.

`record-card.svelte` gains `layout?: 'row' | 'tile'` and an optional `heading` snippet. A tile is a
column: a heading row (title, status, the actions control at its end), then the facts. The link over
the content and both action routes are untouched.

`Cell.Status` gains a labelled form (icon and word), used on tiles; rows keep the bare icon.

| Concept | `recordMinWidth` | `recordHeight` | Heading | Facts (icon, `text-xs`) | Read change |
| --- | --- | --- | --- | --- | --- |
| tenant | 300 | 136 | name | national id (`id-card`, ltr), phone; a chip per non-zero contract status count, word included; *no contracts* when all are zero | none |
| complex | 300 | 120 | name | location (`map-pin`); units, occupied, vacant, zeros hidden | none |
| unit (a complex's units) | 300 | 104 | name, status with word | occupant (`user`) | none |
| contract (all three surfaces) | 300 | 152 | tenant name or reference, status with word | reference (`hash`), dates (`calendar-range`), cost per interval, paid of expected with the ring, payments when above zero, its units | units' names through `contract_unit`, gated on unit view |

The heights are starting values, **prototyped in Arabic on real workspace data before they are
fixed**, since a card taller than its declared height overlaps the next. Each concept's card moves
into its own component (`tenant/component/card.svelte` and so on; contract keeps `record.svelte`).

**The ledger** (`payment/component/ledger.svelte`) stays one column by month. A row becomes two lines
at 64 px: date with the amount at its end; then, muted and truncated, the method with its glyph, the
reference (ltr) and the note (`sticky-note`). With none of the three, one line, centred. Method
glyphs: cash `hand-coins`, bank transfer `landmark`, cheque `pen-line`, Ejar `globe`; not `banknote`
(the contract card's payment count) nor `coins` (the dashboard's outstanding). The method labels
move into one shared map, replacing the copies in `payment/component/details.svelte` and
`form.svelte`. `payment.getMany` already returns all three; no read change.

# Interfaces

| Side | Added or changed |
| --- | --- |
| Rust commands | `session_machines -> Vec<MachineView>`, `session_end_machine(machine_id) -> SessionsEnded`, both `Gate::Own`; `workspace_query`, `workspace_batch`, `as_member` |
| `MachineView` | `{ id, name: string \| null, seenAt, createdAt, isThisMachine, mayEndAlone }` |
| tRPC | `organization.session.machines` (query), `organization.session.endMachine({ machineId })`; `transfer.get/importWhole/held` take `{ workspaceId? }` through `procedure.permittedIn` |
| TS host | `OrganizationHost` gains `machines`, `endMachine`; `WorkspaceHost` gains `query`, `batch`; `Context` gains `databaseOf` |
| Acts | `workspace.export`, `workspace.import`; `WorkspaceActContext.standingOf`; `WorkspaceHostRequests.exportFile/importFile`; `member.offerOwnership` refusal moves to `unavailable` |
| Callers that change | `transfer/component/import-dialog.svelte` (`held({ workspaceId })`, the workspace in its title); `workspace/query.ts` `useImportRecords` input; `app-database-records.svelte`; `transfer.svelte` deleted; `end-other-sessions.svelte` replaced by the machines group |
| Rule counts | [[rules/api-layer]]'s procedure counts and kinds move with the three new procedures and the new declaration, in the same change |

# Data Model

Organization store: `machine_sign_out` and `machine_name` (above), created by `SCHEMA` and
`complete_schema`; `TABLES` from 15 to 17; the `machine` table is not altered, so its column pin
stays at four. [[contexts/desktop/organization]]'s table count is corrected in the same change.
Local record: `HeldOrganization::machine_signed_out`. No workspace migration.

# Technical Approach

The strands are independent; within each the order below holds.

1. **The shared blocks first**: the `item` primitive, `settings-group`, `settings-row`, the section
   switch's icons. Every settings ticket draws on them.
2. **Settings sections** onto the blocks, one section per ticket: general (with ending soon removed
   only once 4 lands), account (without machines), organization (sync states with the activity
   count, the Turso row, the mark, leaving with handover), workspaces (cards' words and access).
3. **Machines**: Rust tables, name, mark, checks and `end_machine` with their tests; then the
   commands and router; then the machines group in the account section. The Rust half lands before
   the interface so the two-machine check runs against it.
4. **Ending soon on the dashboard**, then its removal from general in the same ticket, so the
   setting is never unreachable between commits.
5. **Workspace transfer**: the remote module and commands; then `databaseOf` and `permittedIn` with
   the router tests on two memory workspaces; then the acts, the host and the callout, deleting the
   block below the cards last.
6. **Grid**: `columnsFor`, the gap and the tile layout in the shell and the card; a prototype of the
   four cards on real data in Arabic and English to fix the heights; then one ticket per concept;
   the ledger rows.
7. **Rules**: [[rules/interface]]'s four sections with the tickets that change their subject, and
   [[rules/api-layer]]'s counts with the procedures.

# Integration

- The organization store and its replication, which effort 838's permissions and 828's register
  also read; the heartbeat, the sign-in paths and the upgrade walk.
- The lease's pipeline client, generalised and shared rather than copied.
- The command menu (a dashboard place, the workspace acts through `organization/palette.ts`).
- The dashboard's keys and the contract surface's, through the settings contribution.

# Migration

A machine on this version completes the two tables on its next pull; a machine on an older version
ignores them, which is why its single sign-out is refused and *all others* still reaches it. Rows
from before this land have no name until that machine signs in or resumes on this version, and show
the fallback. Nothing in a workspace changes.

# Testing Strategy

| Criterion | Check |
| --- | --- |
| 1, 2, 5 | `app/tests/settings-area.svelte.test.ts` over each section as owner and as member: every `[data-settings-row]` has an svg and a name; every `[data-row-tone=error]` is last in its group with an svg, no other control carries the tone; within a group buttons all carry an svg or none do; `section-switch` links carry an svg; each confirmation's text names what ends |
| 3, 4 | general's rows are exactly the four; no button named *save* anywhere; `api.settings.set` rejected reverts locale and appearance, and the dashboard popover |
| 6, 7 | `dashboard/tests/landing.svelte.test.ts`: the header control writes and the refetched data redraws; with no ending-soon rank the empty header and control are drawn, and an answer holding the rank fills it; the contracts list key is invalidated; the palette place opens the control; persistence rests on the existing set-then-get procedure test |
| 8 | settings-area: account's order |
| 9 to 11 | Rust, two `OrganizationStore`s over one replica with `Memory` credentials, each with its own `machine_id`: both machines listed with this one first and flagged, another member's absent, one seen 30 days ago present, a nameless row `null`; A ends B, one heartbeat on B reaches the wall and forgets the key, A and a third machine untouched, `session_epoch` and the vault unmoved, B signed in again stays in; B closed when ended is refused at `resume` before the key is spent; ending one's own refused; `sent = false` against a server that answers nothing; *all others* clears the rows; a machine with no name row refused alone; the name stored sealed, not rewritten when unchanged, trimmed and capped. TS: router map and gates, the sentences, a component test for order, fallback name and the confirmation naming the machines. **By hand before merge**: two installs, end one while it is offline, bring it back, it reaches the wall |
| 12 | `sync/tests/status.test.ts` over the mapping including in flight; `standing.svelte.test.ts` over each state's icon and tone, the last-reached line, sync now, the callout under the state |
| 13, 14 | settings-area: the Turso row connected with forget last and the revoke text, and not held with an icon-bearing reconnect; member leaving is disconnect alone; owner leaving is handover, disconnect, delete, and handover calls `memberHost.run('member.offerOwnership', ...)` |
| 15 | `transfer/tests/router.test.ts` on two memory workspaces, A open and B with known records: `get({ workspaceId: B })` equals B's file and `get()` A's; `importWhole` into B leaves A unchanged; B read-only refuses import there while A's passes; a flag pinned off in B alone refuses there; no grant refuses; status computed at read. Rust `remote.rs` against the loopback server: host and token from the signed record, value parity with `proxy.rs`, batch rollback, the four refusals, and no file created in the data directory. Component: a non-open card offers both, refusals per workspace, no block below the cards, the dialog's confirm carries the id. **By hand**: export a workspace never held while another is open; no `ws-<id>.db` appears |
| 16, 17 | `organization/workspace/tests/directory.svelte.test.ts`: the open words, member count, access word; the callout above the cards names its workspace and passes its id |
| 18 | `columnsFor` unit tests; `listRows` three to a row; keyboard across three columns in both directions; a thousand-record harness draws fewer cards than records. Column counts at real widths in the running app |
| 19 | one component test per concept card: the status word visible, every fact with an svg, no zero count, a contract's units |
| 20 | ledger: method, reference and note shown; date and amount alone without them; month headers stay |
| 21 | the design package's node tests (contrast, motion, typography, shape, mirrored icons) stay green; by hand in the running app: Arabic and English, light and dark, keyboard only, reduced motion |
| 22 | the rule sections read as built; `index.mjs` regenerated, `validate.mjs` clean |

# Operational Considerations

- The two by-hand checks (two-machine sign-out, export of a never-held workspace) are human checks,
  handed over together at the close.
- A transfer of a workspace that is not open is online only, and says so when pressed.
- Changesets ride with their tickets: the settings look, machines, the dashboard control, workspace
  transfer, and the grid are each user-visible.

# Technical Risks

- **The sign-out check placed wrong signs out every machine, or none.** It shows in the two-store
  tests first; the acknowledgement test (B signed in again stays in) is the one that catches a mark
  never written.
- **`whoami::devicename` differs from what the person calls the machine** on Windows (the computer
  name, not a friendly one). Shows on first run; the fallback stays honest.
- **Hrana value mapping drifts from the proxy's** (large integers, blobs). The parity test pins it.
- **Card heights clip in Arabic.** The prototype fixes them before the concept tickets.
- **`item` from the CLI fails the design package's shape or motion tests.** Shows on add; its
  spacing is the primitive's own and tolerated.
