---
aep: 2.7.0
owner: repository
date: 2026-08-21
kind: spec
status: implemented
---

# feat(app): settings and the workspace page finish what they offer

## Problem

The shell has two menus and each leads to a page. On both pages something is offered and does
not do what it offers.

**The settings row on the signed-out menu leads nowhere.**
`layout/component/account-signed-out.svelte:87` links to `/settings` and carries a comment
naming the requirement it was built for. `routes/+layout.svelte:179` draws the sign-in card in
place of `children` while the shell state is `sign-in`, for every route, so pressing the row
changes the address and leaves the same card on screen. A person who has signed out, or who has
never signed in, cannot change the application's language — which is the setting they are most
likely to want before they can read anything else on the way in.

**The rest of that requirement landed and only the gate did not.** `Context.identity` is
`Identity | null`, five procedures are `procedure.public`, and `api/tests/procedure.test.ts`
drives the whole router with no identity and asserts both halves. `api/app.ts:15` states in its
own comment that "the settings page offers it, that page is reachable signed out", which is not
true of the tree it sits in. This is requirement 9a and acceptance criterion 7b of
[[efforts/capabilities-only-one-surface-got]]; it has no test, and that is how #646 merged with
its own criterion unmet.

**The workspace's name is a lock, and there are two of them.**
`workspace/component/identity.svelte` draws a name beside a control that explains it cannot be
changed, and the control is inert by design. What it draws is not what the spec first said, and
the correction is requirement 4's whole shape. *Found 2026-08-21 during `/refine`, by reading
the Rust side rather than the page.*

- **The control plane holds a `name` column that nothing has ever read.** `server.ts` hands
  `account.displayName` to `workspaceForAccount` at creation; `workspaceForAccount` returns an
  existing workspace unchanged, so it is written once and never revisited. It is sent on every
  identifying answer, through `wireWorkspace`.
- **The desktop throws that field away.** `sync/control.rs:138` declares `WireWorkspace` with a
  single field, `id`. `record_remote_workspace` takes an id and a URL and has no parameter for a
  name.
- **What every install actually shows is `"Primary workspace"`**, a hardcoded English literal
  written in three places in `sync/store.rs` (lines 222, 436 and 497) and reached by defaulting.

So the rail, the workspace menu and the workspace page name every workspace in English,
identically, for every person, on an application that ships in Arabic. `renameWorkspace` has
been a permission flag since the control plane had permissions
(`control-plane/src/workspace/permission.ts:23`), granted by default to owner and to
administrator, and nothing has ever checked it because nothing renames.

**The updates section is the loudest thing on a quiet page.** Every other row on `/settings` is
a `Field.Field` with its description on the start and one small outlined control on the end.
The updates section is a solid button, a second solid button that appears beside it, one of four
callout states below both, a bordered panel of four figures, a progress bar, a third callout and
a fourth button. Pressing *check for updates* on the ordinary path — no update available, which
is what the ordinary path is — replaces a spinner sentence with a success callout that stays on
screen until the page is left. The version the reader is on is a line of small muted text above
all of it, and the version they could have is a figure inside the panel, so the one comparison
the section exists to offer is made across two typographic registers.

**The diagnostics control is a paragraph-width button for one action.** It reads "open log
folder", and the same action is already drawn as an icon on two of the application's own
screens: `layout/component/startup-error.svelte` and `startup-unreadable.svelte` both use the
shared surface action with `settings.diagnosticsReveal` as its label. *That component was at
`layout/component/surface-action.svelte` when this was written and is at
`design/block/surface-action.svelte` now, which requirement 2c records.*

## Goal

Every control on `/settings` and `/workspace` does what it offers. Settings opens with nobody
signed in. The workspace's name is something its owner chose. The two controls that report on
this installation rather than on the workspace read as controls rather than as sections.

## Scope

- **The route gate in `routes/+layout.svelte`**: which routes draw while the shell is in
  `sign-in`, and what the shell does when somebody signs in from one of them.
- **The updates section of `/settings`**: what it presents before, during and after a check, and
  what it presents while installing. Its design is settled by building it, not on paper.
- **The diagnostics control of `/settings`**: its presentation only.
- **Renaming a workspace, end to end**: a control-plane route with its permission check, the
  Rust command and client call behind it, the host and facade surface, the procedure, the form,
  and what every surface naming the workspace does afterwards.
- The translations all of it needs, in both locales.

## Requirements

1. **`/settings` renders with nobody signed in.** The shell is already drawn in that state and
   already offers the row; what changes is that the route below it draws instead of the sign-in
   card. Every group renders and works — language, notices, updates, diagnostics — because every
   procedure behind them is already `procedure.public` and building the request context reaches
   no database.

   **`/settings` is the only route that opens**, and the four destinations, the search, the
   workspace control and the shortcut sheet go on refusing, which is criterion 7 of
   [[efforts/capabilities-only-one-surface-got]] and is not reopened. The signed-out menu offers
   two rows and this is the second of them.

   **Nothing navigates on the way out, and that is a requirement rather than an omission.**
   Signing out changes the shell state and moves no address today, which is checked rather than
   assumed: nothing under `layout/` or `sync/` calls `goto`. So a person who signs out while
   reading settings goes on reading settings, and one who signs out anywhere else meets the card
   over the address they were on and returns to it when they sign back in. A redirect to a safe
   address would be a second mechanism answering a question the gate already answers, and it
   would lose the reader's place for nothing: the card is drawn over the route, so nothing behind
   it renders.

   *Inherited from [[efforts/capabilities-only-one-surface-got]], requirement 9a and criterion
   7b. Its API half landed with #645 and its layout half did not. It is carried here rather than
   left there because the human asked for one effort on 2026-08-21, and because the effort it
   came from has nothing else outstanding.*

1a. **The comment in `api/app.ts` stops asserting something untrue.** It reads "that page is
    reachable signed out" as the justification for two public procedures. The justification
    survives requirement 1 and the tense does not.

2. **The updates section presents as one control with an outcome, rather than as a section with
   a stack.** *Directed by the human on 2026-08-21, in these words: icons need to be utilized
   more; the version figures should render the way the update recovery screen renders its two;
   what happens after the button is pressed is not good; maybe an interactive icon that loads
   and then reports; find a better design for it.*

   The direction fixes four things and leaves the design open:

   - **The two version figures render as plates**, the treatment
     `layout/component/startup-recovery.svelte` gives *previous version* and *updating to*: a
     muted rounded box, an uppercase label, the figure under it. That screen keeps its figures
     for the reason this section needs them kept, which its own comment states: a version number
     is a fact somebody reads off the screen and repeats.
   - **Checking is a control, not a row of buttons.** What form it takes is requirement 2a's.
   - **The outcome of a check is transient.** A check reports, and what it reports goes away on
     its own or on the reader's next move. It does not become a new permanent element of a page
     the reader is still using, which is what the success callout is today. **The version plates
     are not an outcome** and stand whether or not anybody has pressed anything.
   - **Icons carry more of it.** Today the section has none. This one is direction rather than a
     testable requirement, and it is an input to requirement 2a rather than a criterion below.

2a. **The design was settled by building it, and this is discharged.** *Run 2026-08-21; the
    write-up is
    [[efforts/settings-and-the-workspace-finish-what-they-offer/evidence/prototypes/the-updates-section-needs-one-home]].*

    Three presentations went up on the real page across the seven states: this arrangement, one
    that consolidated the whole section into a single pressable tile, and one that kept a single
    glyph on the page and moved the conversation into a dialog. **The human chose the first.**

    **What the two losers establish is worth more than the winner.** Both argued the section is
    too large rather than badly arranged, and both lost, so the section staying a section on the
    page at roughly its current height is now a tested decision rather than an unexamined default.
    Neither is reopened without new information.

2b. **The winning code was carried into the implementation rather than rewritten**, on the human's
    instruction on 2026-08-21. [[skills/prototype]] requires the opposite and
    [[policies/authority]] rank 1 overrides it; the promotion is recorded here because that skill
    requires a promotion to be recorded in the spec, and the write-up says precisely what moved.

    **What shipped is the variant's presentation on the previous implementation's machinery.** The
    staged scenes, their timers and the simulated release were replaced by the real
    `useCheckForUpdate`, `usePrepareUpdate`, `useRestartApp` and `AvailableUpdate`, and the error
    handling and diagnostics recording came from the implementation being replaced.

2c. **`SurfaceAction` moves to `design/block/`**, which the winning presentation forced and the
    prototype exposed without answering. It declared itself the shell's on the ground that it was
    shared by no concept; a settings row using it makes that false, and [[rules/frontend]] puts a
    composite reaching past the shell in `design/block/`. Its three existing callers move with it,
    and it gains a `disabled` prop the startup screens never needed.

3. **The diagnostics control is an icon.** The action keeps its accessible name, which is
   `settings.diagnosticsReveal` in both locales and is already the string the two startup screens
   pass to the same control.

4. **A workspace can be renamed by a member the workspace permits to rename it, and there is one
   name to rename.** *Which of the two is the name was settled with the human on 2026-08-21: the
   control plane's, and a workspace is named after its account holder until somebody changes
   it.*

   **The alternatives and what lost them.** A neutral default in the column instead of the
   display name was rejected because the server picks that string and a server cannot know the
   reader's language, so it moves the English-on-an-Arabic-interface defect rather than removing
   it. A rename written to the local store alone was rejected because two machines signed in to
   one workspace would then disagree about its name, which is a per-machine nickname and not a
   rename, and it leaves both the column and the permission flag dead.

4a. **The control plane's `name` becomes the name the application shows.** `WireWorkspace` gains
    the field it currently parses away, and the stored workspace record is written from it.
    `"Primary workspace"` survives as the fallback for a machine that has never reached a control
    plane, which is what the three defaults in `store.rs` already exist for; what changes is that
    a name arriving from the control plane wins over them.

    **An existing install's workspace changes name at its next sign-in**, from `"Primary
    workspace"` to the account holder's display name, with nobody having asked for it. That is
    accepted rather than mitigated: there is effectively no installed base
    ([[efforts/a-workspace-follows-its-user]], under *Problem*, restated 2026-08-18 against the
    release download data), so what this costs in practice is nothing, and the alternative is
    carrying a precedence rule between two names forever to protect installs that do not exist.

4b. **The control plane grows a route that renames a workspace**, and it checks
    `renameWorkspace` on the asking account's membership rather than checking ownership. The
    flag has existed since permissions did and this is the first thing to consult it; consulting
    ownership instead would put a second answer beside a mechanism that already has one.

    A refusal names why. A name that is empty or is only whitespace is refused, and so is one
    past whatever length the row can hold.

4c. **The desktop reaches it the way it reaches everything else in the control plane**, which is
    through Rust: a command beside the six in `sync/command.rs`, a call beside the others in
    `sync/control.rs`, and the stored workspace record updated with what came back. No
    credential crosses the boundary, per [[rules/credentials]] under *Client boundary*.

4d. **The rename is offered from the workspace page**, on the row that draws the name, replacing
    the control that today explains that neither the name nor the icon can be changed. The icon
    stays unavailable and the row goes on saying so.

4e. **Every surface naming the workspace shows the new name without a restart.** The name is on
    the sidebar header control, in the workspace menu, and on the workspace page. All three read
    it from `useFetchRemoteSyncState`, so one invalidation covers them.

4f. **Another machine picks the new name up without anybody typing on it**, at the next call that
    identifies it. **The mint is not one of those**: `MintedToken` carries a token, a URL and an
    expiry and no name, so a dispatch that only mints does not refresh it. `/account/sign-in` and
    `/session/refresh` both answer with the workspace, and the sync manager schedules the second
    on a timer, so the ordinary renewal cadence is what this rides on. Whether the mint should
    also carry the name, and buy a faster answer, is a question for the plan and not a
    requirement here.

5. **The transfer section of `/workspace` says its name once, and the name says what the section
   does.** *Found and directed 2026-08-21, by the human using the application, in the same session
   that found requirement 1.* `workspace.groupTransfer` and `settings.transferTitle` were both
   "move this workspace", one directly above the other, and neither describes either of the two
   buttons under them. The legend becomes export / import and the row loses its title.

   **This is requirement 2 and 3's shape applied one page over rather than a new decision.** The
   settled arrangement on `/settings` is that a group legend names the section and the row under
   it carries a description and its controls; both settings rows say so in their own comments.
   What is new is only the wording, which the human chose.

   *Scope added to this effort after it was accepted, at the human's direction. It is recorded
   here rather than taken silently, because [[policies/execution]] puts product scope beyond a
   skill's reach: `/implement` found it, `/implement` did not decide it.*

## Acceptance criteria

1. On a machine with no account, opening the account menu and selecting settings shows the
   settings page inside the rail. The language control changes the language, the notice-days
   control saves, the updates control checks, and the diagnostics control opens the folder.
   *(R1)*
1a. From that page, signing in lands in `ready` with the settings page still on screen and the
    rail never leaving. *(R1, and it is criterion 7a of the effort this is inherited from,
    applied to the one route that now draws underneath)*
1b. From that page, the four destinations, the search, the workspace control and the shortcut
    sheet still refuse to act. *(R1)*
1c. A `node:test` under `layout/tests/` asserts, for the shell in `sign-in`, that `/settings`
    draws the route and every other address draws the card, and asserts the same decision for
    every other shell state. The absence of any test at all is why the criterion this inherits
    merged unmet, so it is named here rather than left to the implementer. *(R1)*
1d. Signing out while on `/settings` leaves the settings page on screen and working. Signing out
    while on a record page shows the card, and signing back in returns to that record page.
    *(R1)*
1e. No comment in `apps/desktop/src/lib/api/` claims the settings page is already reachable
    signed out. *(R1a)*
2. The updates section states the current version and any available version in the same
   treatment, and that treatment is the one `startup-recovery.svelte` uses. *(R2)*
2a. Pressing the check control while no update is available, and then leaving the section alone,
    returns the section to the shape it had before the press. The version plates are the
    exception and are expected to stand. A broken version of this is the one that ships today: a
    success callout that appears on the press and is still there when the reader leaves the page.
    *(R2)*
2b. A write-up under `evidence/prototypes/` names every presentation that was put up, which one
    won, and the falsifier that decided it. **Met 2026-08-21.** *(R2a)*
2c. `layout/component/surface-action.svelte` does not exist, its three startup callers import from
    `design/block/`, and both settings rows use it. **Met 2026-08-21.** *(R2c, R3)*
3. The diagnostics control is an icon, and a screen reader reads it as "open log folder" in
   English and "فتح مجلد السجل" in Arabic. *(R3)*
4. A member with `renameWorkspace` renames the workspace from `/workspace`, and the sidebar
   header, the workspace menu and the page all read the new name without the application being
   restarted. *(R4, R4c, R4d, R4e)*
4a. On a machine that has signed in, no surface anywhere in the application reads "Primary
    workspace" unless that is what the workspace is called in the control plane. A machine that
    has never reached one still reads it. *(R4a)*
4b. A request from a member without the flag is refused, and the refusal is the control plane's
    own refusal vocabulary naming the permission rather than a generic 403. A control-plane test
    drives both sides against a membership row built with and without the flag. *(R4b)*
4c. An empty name, a whitespace-only name and an over-long name are each refused, and what the
    reader sees is a message written for them in lower case, per [[rules/api-layer]] under
    *Errors*. *(R4b)*
4d. After a rename, signing out and back in shows the new name, not the account's display name.
    This is the regression `workspaceForAccount` would cause if the rename were written anywhere
    it re-derives, and the regression requirement 4a introduces the possibility of. *(R4a, R4b)*
4e. A second machine signed in to the same workspace shows the new name after its next session
    renewal, with nothing typed on it. *(R4f)*
4f. No workspace name, and no session or workspace token, appears in the diagnostics file as a
    result of any of this. *(R4c)*
5. Both locales, right to left checked as each surface is built, from 640x480 upward with no
   horizontal scrollbar. Carried as a line on every ticket that draws anything rather than as a
   ticket of its own.
6. The transfer section of `/workspace` shows one label rather than the same words twice, that
   label reads "export / import" and "تصدير / استيراد", and `settings.transferTitle` is gone from
   both locale files having lost its only caller. *(R5)*

## Constraints

- **The decision about which address draws has to be reachable from `node:test`.** A runes file
  cannot be imported by the harness at all, which `routes/+layout.svelte` states in its own
  comment and which `layout/startup-surface.ts` is the standing answer to: the pre-locale screen
  put its one decision in a plain module and tested it there. Criterion 1c is not satisfiable
  with the decision left inline in the route, and this constraint exists so that is discovered
  now rather than at the end.
- **The rename form is the shared form surface**, with a declared weight, per
  [[rules/interface]] under *Form surface*. It is not an input that appears in place of the name
  on the row: a rename is a write, and a surface that writes takes the form surface whatever its
  size.
- **A validation error marks its own field** and no summary callout lists it
  ([[rules/interface]], under *Validation errors*).
- **The rename procedure is `procedure.member`**, and it reaches `ctx.host` rather than
  `ctx.db`. The workspace belongs to somebody, so it is not public however small the write looks
  ([[rules/api-layer]], under *Who may call*).
- **Every `invoke` goes through the Tauri facade** ([[rules/api-layer]], under *Where things
  live*).
- **The application's own surfaces stay on the shared standalone surface**, and nothing here adds
  a sixth application screen or changes one.
- **The tone vocabulary is the five in `$lib/design/tone`** and the updates section takes its
  tones from there ([[rules/interface]], under *Tone*).
- **The redesign moves what the updates section presents and drops none of it without saying so.**
  It presents six things today: the current version, an available version, a release date,
  release notes, download progress, and the way to restart. The prototype decides where each one
  goes and whether it is standing or transient. A presentation that drops one records that it did
  and why, in the write-up criterion 2b asks for. *Added during `/refine`: without this, "find a
  better design" and "present less" are the same instruction, and the release notes are the piece
  most easily lost.*
- **The diagnostics control and the updates control agree with each other.** Making one row on
  `/settings` an icon while its neighbour keeps a text button is the odd-one-out this is meant to
  remove. Requirements 2 and 3 are one presentation decision reached from two directions.
- **Nothing here reopens what signing in does.** Requirement 1 changes what is drawn underneath
  the card, not the card, the admission ladder or the session window.
- **The workspace name is not a credential**, and the row that carries it is not one either. What
  must not cross the boundary is the session token and the workspace token, which already do not.

## Out of scope

- **Creating a second workspace, switching between workspaces, inviting anybody, and removing
  anybody.** Each is offered and inert today, each needs a control-plane route this does not add,
  and each belongs to requirement 14 of [[efforts/a-workspace-follows-its-user]]. Excluded by
  [[efforts/the-shell-says-whose-workspace-this-is]] for the same reasons and not reopened.
- **The workspace icon.** The workspace record has no icon column, so the slot stays a
  placeholder. The row that carries the name is being rebuilt and the icon slot on it is not.
- **A control-plane route that lists a workspace's members.** The members list goes on drawing the
  one member the desktop can name. Renaming needs a membership row read, which the route already
  does to authorize; that is not a listing route and does not become one.
- **Transferring ownership, deleting a workspace, and changing a member's role.** Three more
  flags in the same enum with the same amount of nothing behind them. Renaming is taken alone
  because it is the one whose absence a person meets on the first day.
- **`/account`, and opening it signed out.** There is nothing on it to read with no account, and
  the signed-out menu does not offer it.
- **The four primary destinations acting while signed out.** Criterion 7 of the inherited effort
  says they refuse, and they go on refusing.
- **The rest of the settings page.** Language, notices, and the page's own loading and failure
  branches are untouched.
- **Automatic update checks.** The updates section is redesigned around the check a person asks
  for. Whether the application should check on its own is a different question with a different
  answer for a desktop application that is offline by design, and it is not asked here.
- **Rendering release notes as markdown.** They arrive as text and go on being drawn as text.
- **Renaming anything else.** No concept record gains a rename it does not have.

## Assumptions

- **The `workspace.name` column has a length the row can hold and no other constraint on it.**
  Read from `database/schema.ts` at plan time; assumed here rather than checked because the
  refusal in 4b exists either way and only its bound is in question.
- **Nothing outside the control plane derives anything from a workspace's name.** Checked as far
  as the store: the replica file is named `workspace-<id>.db`, the Turso database is named from
  the id, and the only writes to the stored name in `sync/store.rs` are the three defaults. Not
  proven exhaustively across the Rust tree.

*What was an assumption here on 2026-08-21 and is not any more: **that the control plane could be
deployed alongside a desktop release.** `apps/control-plane/README.md` says "Nothing is deployed"
and that a desktop build whose `RENTABLE_CONTROL_PLANE_URL` is unset reaches no account and shows
nothing. There is no running server to fall out of step with, the route and the desktop that
calls it ship from one branch, and the version-skew refusal requirement 4b would otherwise have
owed does not exist. It is recorded rather than deleted because it was load-bearing for the
sizing.*

## Open questions

*None left. Which of the two workspace names is the name closed in refinement and is requirement
4. What the updates section becomes, and whether the check keeps a place on the page, both closed
in the prototype and are requirements 2 and 2a. The last one closed while building the rename,
below.*

- ~~**What a rename that succeeded on the control plane and failed to write locally leaves
  behind.**~~ **Closed 2026-08-21, building #698**, which is where it was cheapest to settle. The
  rename is reported as having happened, and the failure names what is left rather than what broke:
  the control plane holds the new name, every other machine will pick it up, and this window shows
  the old one until the next session renewal. *A reader told only that a file could not be written
  would press rename again, which would succeed and change nothing they can see, which is the
  outcome the wording exists to prevent.*

## Risks

- **The route gate is one condition and the states around it are not.** `shell` already latches
  the rail through a load so that signing in does not take it away, and requirement 1 adds a
  second axis to a decision that has four states and a latch. The failure shows up as the sign-in
  card flashing on the way in, or as a route drawing for a moment during startup before anybody
  has signed in. Criterion 1a is aimed at the first and criterion 1c at both.
- **A rename is the first write the control plane has ever accepted against a workspace row**, and
  less of the machinery is reusable than it looks. *Corrected during `/refine`.* The refusal
  vocabulary exists. The membership read exists as eight inline lines inside `mintWorkspaceToken`
  rather than as a function, so the route either extracts it or repeats it, and that is the
  plan's call. **`permits` has never been called by anything but its own test** — nothing in
  production has ever consulted a permission flag — so this route is where the permission model
  is exercised for the first time, and a mechanism nothing has ever called is a mechanism whose
  defects nothing has ever had the chance to surface.
- **The updates section is the only place in the application that installs software.** A
  redesign that moves the install control also moves the one control whose failure leaves a
  machine part-upgraded, and `startup-recovery.svelte` exists because that has happened. The
  prototype settles presentation and must not change what `installUpdate` does.
