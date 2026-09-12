---
status: draft
---

# Problem

**Effort 819 changed what a person is signing in to, and the screens that take them there,
and the control that names where they are, were built to the old shape or not at all.**

The first real launch of the organization screens on 2026-09-12 found four things, and reading
the shell found a fifth.

**The screens before sign-in send a person forward and never back.** The wall offers two ways
through it, setting up an organization and opening an invitation, and both land on a screen
with no way to return. The setup walk's `connect` step has no back; only its `name` step has
one, as an outline button in the action row. The join screen's `paste` step has none, and its
later steps offer "paste another link", which is a back that does not say so. The surface
these screens share, `StandaloneSurface`, already carries a `corner` slot documented as "the
way past this screen", and three startup screens use it; the walk and the join screen were
built without it.

**Onboarding ends twice.** The walk runs connect, name, done; `done` shows the join link and
a "continue"; continuing lands the owner on the no-workspace surface, which asks them to name
a workspace and continue again. Two screens in a row ask the same person to press on past
nothing, and the link shown at `done` is also on the organization page, where it stays. The
connect step itself is three paragraphs, about a hundred and thirty words, with the one
instruction that must come first, an empty group in Turso's dashboard, buried in the opening
clause and the action that helps with it at the foot of the screen. No step says how many
there are.

**The wall lists organizations in a select.** A machine that has joined several shows them as
a dropdown above the password field; the name and role of each are read only once the list is
open, and the one thing a person is choosing between is hidden behind a control.

**The icons do not agree with each other.** "open turso dashboard" carries a glyph and
"connect turso account", the primary, does not; "unlock" carries one, "create organization"
and "continue" do not; no field on any of these screens carries one, though the design package
holds an `input-group` primitive built for that and imported by nothing in the desktop.

**The rail's workspace control still describes the world before 819.** `workspace-menu.svelte`
says in its own comment that an account owns exactly one workspace and that a list would be a
switcher that cannot switch. An organization now holds several, a member holds grants on some
of them, startup reopens the last one or the first, and `workspace_open` is a command the
shell already calls. Nothing on screen lets a person choose. The menu's two actions, invite and
new workspace, are inert rows with a padlock, and the sentence under the padlock says they are
locked. They are not locked; the organization page does both.

**Invite and new workspace are inline forms on the organization page.** Every other form that
writes here, complex, unit, contract, payment, tenant, rename, takes the shared `FormSurface`
([[rules/interface]], *Form surface*). These two sit inside `Field.Set`s between lists, so the
page holds a form a person may never use in the middle of what they came to read, and the two
places that should open them, the rail's menu rows, have nothing to open.

**And a way back exposes a gap that was hidden.** The first run's route opens at `connect`
with the consent `idle` every time and never reads whether the machine already holds Turso
authority. Nothing leads back to it today, so it costs nothing. Once back exists, a person who
connects, returns to the wall, and sets up again is asked for a consent the machine has.

*Raised by the human on 2026-09-12: "the setup of org form is not good enough", "there's no
back button when an option is chosen", "usage of icons in the forms is not enough", and then
"rethink and redesign the onboarding process ui and login and workspace ui control and the
invite and new workspace in the app after the changes". Seven choices were settled in the same
conversation and are recorded under Requirements.*

# Goal

**A person arrives, joins or founds an organization, opens a workspace, moves between the ones
they hold, and brings others in, and every screen on that path reads as one application.**

Every screen before sign-in can be left the way it was entered. A new owner's walk ends inside
their first workspace, not on a screen asking them to continue past nothing. The wall shows the
organizations a machine has joined as what they are, rows a person picks from. The rail's
workspace control names the open workspace, lists the others the member holds, switches
between them, and opens invite and new workspace as the forms they are. Buttons carry their
verb and fields their subject, in one vocabulary from the wall to the dialogs. A machine that
already holds a consent is not asked for it again.

# Scope

- **Before sign-in**: `layout/component/startup-sign-in.svelte` (the wall);
  `organization/component/setup-walk.svelte` and `routes/organization/new/+page.svelte` (the
  first run); `organization/component/join-screen.svelte` and `routes/organization/join/`;
  `layout/component/startup-no-workspace.svelte` and `startup-change-password.svelte` with
  `organization/component/change-password-form.svelte`; `organization/setup.ts`, the walk's
  description.
- **In the shell**: `layout/component/workspace-menu.svelte`, `workspace-locked.svelte`, and
  `layout/startup.ts` where opening a workspace after sign-in lives.
- **In the application**: `organization/component/{invite-form,workspaces}.svelte` and
  `routes/organization/+page.svelte`, which holds both; `organization/query.ts` where a
  mutation moves.
- The English and Arabic strings all of the above read.
- `packages/design` is read, not changed: `block/standalone-surface.svelte`,
  `block/surface-action.svelte`, `block/form-surface.svelte`, `primitive/input-group`, and
  the sidebar and dropdown-menu primitives.
- `apps/desktop/tauri/src/organization/command.rs`, `workspace_open` only, and only if
  switching mid-session needs it (see Constraints).

# Requirements

*Before sign-in*

1. **A back control in the surface's corner, on every step that has somewhere to go.** The
   walk's `connect` returns to the wall; `name` returns to `connect`; `workspace` returns to
   `name`. The join screen's `paste` and `unreadable` return to the wall; `password`,
   `restore`, `refused` and `inspecting` return to `paste`. The corner control is the one way
   back: the outline "back" button and the "paste another link" links go.
2. **Back is available while a consent is pending.** Leaving the walk with the browser still
   open abandons the poll and nothing else; a consent creates nothing on the account.
3. **The walk is connect, name, workspace, and ends inside the workspace.** The third step
   names the first workspace; creating it signs the owner in to it and the application opens
   on it, by the path a sign-in takes past the wall. The `done` step and its link go; the
   join link is on the organization page, where it already is. *Chosen 2026-09-12 over
   keeping the three-step walk and the no-workspace surface behind it.*
4. **The walk says its position**, as a quiet muted line reading "step n of 3" under the
   title on every step. No bar and no dots. *Chosen 2026-09-12.*
5. **The connect step's three facts are a list with a glyph for each bullet**, in this order:
   the empty group to prepare, with the open-dashboard action on that item; where an account
   comes from where there is none; where the organization will live and what that costs.
   The same facts, shorter sentences, in both locales.
6. **Returning to the walk finds what the machine already holds.** A first run opened on a
   machine that holds Turso authority shows `connect` as granted, with continue and
   disconnect offered, rather than asking again.
7. **The wall shows several organizations as a picker list.** Where a machine has joined more
   than one, they read as selectable rows carrying name and role, with the password field
   under the chosen one; one organization is named, not chosen, as today. The wall's title,
   description and password sentence are unchanged. *Chosen 2026-09-12 over a select and
   over remembering the last one.*
8. **The no-workspace surface remains for a member whose organization has no workspace yet**,
   restyled to the vocabulary below. For an owner it still offers the create, because an
   owner restored on a second machine may arrive there too.

*In the shell*

9. **The rail's workspace control is a switcher.** Its menu lists the workspaces the signed-in
   member holds a grant on, marks the open one, and picking another opens it: the
   application redraws from the chosen workspace, and that choice is the one startup reopens
   next launch. A member holding one workspace sees the one row, marked. *Chosen 2026-09-12.*
10. **Invite and new workspace are live in the menu.** Each row opens its form for a person
    the row's permission admits, `inviteMember` for one and the owner's role with Turso
    authority for the other, and for anybody else is drawn as refused with a sentence saying
    whose act it is, never as a padlock. The signed-out row (`workspace-locked.svelte`)
    is unchanged. *Chosen 2026-09-12 over a switcher alone.*
11. **The open workspace is named in the rail after a switch**, with its member count, the
    same row as before, redrawn rather than replaced.

*In the application*

12. **Invite and new workspace take the shared form surface.** Each is one `FormSurface`
    opened from the rail's menu and from the organization page alike; the page's two
    sections hold the lists and a control that opens the same dialog, not an inline form.
    The invite dialog still shows what it made, the link and the generated password with
    their copy controls, until dismissed, and still says it cannot send them. *Chosen
    2026-09-12 over inline forms restyled.*
13. **The new-workspace dialog and the walk's third step are the same form**, one component
    drawn on two surfaces, so a name limit or a refusal reads the same in both places.

*Everywhere in scope*

14. **Primary buttons carry their verb's glyph**: connect, create, unlock, continue, copy,
    change, invite, and switch where a row acts. Arrows mirror in RTL, as `back-control`
    already does.
15. **Fields carry a leading glyph** through `input-group`: organization, workspace,
    password, link, email, and name. The glyph is muted, never as dark as the label, so it
    does not outweigh the text beside it (*Balance weight and contrast*, Refactoring UI p.56).
16. **Both locales, and the tests that hold the shape.** The component tests that render
    these screens assert the back control's presence and destination per step, the position
    line, the picker rows, the switcher's rows and marker, the two dialogs opening from both
    places, and the field glyphs. The walk description in `organization/setup.ts` names the
    third step and its one field.

# Acceptance Criteria

1. On each named step, one control with the accessible name for back sits in the card's
   corner and pressing it lands where requirement 1 says; `grep` finds no outline "back"
   button in `setup-walk.svelte` and no "paste another link" in `join-screen.svelte`.
   Asserted per step in the component tests.
2. With a consent pending, the corner control is enabled, pressing it reaches the wall, and
   the account shows nothing created. Verified once on a real consent; no test reaches the
   account.
3. `SETUP_STEPS` is `connect`, `name`, `workspace`; creating the workspace on the third step
   lands the owner in the application with that workspace open and the rail naming it; no
   `done` step renders. Asserted in the walk's tests and once on a real first run.
4. Each walk step renders the position line with its own number and the total, muted, in
   both locales.
5. The connect step renders three list items each with a glyph, the dashboard action inside
   the first, no paragraph outside the list, and the three together are shorter in English
   than the paragraphs they replace.
6. With `holdsTursoAuthority` true, the walk's `connect` renders the granted state on first
   render and the consent is not begun. Asserted with the prop set.
7. With two joined organizations, the wall renders two selectable rows each carrying name and
   role, the password field under the selected one, and no `select`; with one it renders the
   name and role as text. Asserted in `startup-sign-in.svelte.test.ts`.
8. The no-workspace surface renders a leading glyph on its field and a verb glyph on its
   create for the owner, and the owner-only sentence for others, as today.
9. The workspace menu lists every workspace in `session.workspaces`, marks the one whose id
   is the open workspace's, and selecting another calls the open path with that id; after it
   resolves the rail names the new workspace and `remote-sync.json` records it as current.
   Asserted in a component test on the rows and marker, and once on a real organization with
   two workspaces.
10. The invite row is enabled when the session permits `inviteMember` and opens the invite
    dialog; the new-workspace row is enabled for an owner holding authority and opens the
    workspace dialog; each is otherwise drawn refused with its sentence and no padlock glyph.
    `grep` finds no `LockIcon` in `workspace-menu.svelte`.
11. After a switch, `workspace-menu.svelte` is the same component instance with new props;
    no second row is mounted. Asserted by the sidebar test that counts rows.
12. `invite-form.svelte` and the workspace form render inside `FormSurface`; the organization
    page renders no `<form>` of its own; both dialogs open from the page and from the menu.
    Asserted in the organization page test and the menu test.
13. One workspace form component is imported by the walk and by the dialog; a name over the
    limit is refused with the same message in both.
14. Each primary button named in requirement 14 renders an `svg` before its label; the
    continue arrow carries the RTL mirror class.
15. Each field named in requirement 15 renders inside an `input-group` with a leading addon
    holding an `svg`; the addon carries the muted foreground colour.
16. `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass; the Arabic strings are
    written, not copied from English.

# Constraints

- **[[rules/interface]], *Application surfaces*: every screen before sign-in stays on
  `StandaloneSurface`**, tone `neutral`. *Why: they present the application's own state; a
  toned card here would say the application stopped.*
- **[[rules/interface]], *Form surface*: the two dialogs declare a weight and present two
  ways in CSS.** Invite is heavy (four fields and a result panel); new workspace is light.
  *Why: the rule exists because swapping components across the breakpoint loses typed
  values, and an invite form is exactly the one a person has half-filled.*
- **[[rules/interface]], *Validation errors*: a field glyph is not the error glyph.** The
  leading addon is the field's subject; the error still marks the label line. *Why: two
  glyphs with two meanings on one field is one too many, and the error's has a rule.*
- **The design package is read and not changed.** *Why: `input-group`, `surface-action`, the
  `corner` slot, `form-surface` and the sidebar primitives already do what these screens
  need, and a change to a shared block for one consumer is how blocks grow slots nobody
  argued for; `standalone-surface.svelte` records one such slot coming and going in a day.*
- **The Rust side is untouched unless switching mid-session needs it.** `workspace_open`
  records the workspace and opens its database; whether it releases the replica it replaces
  is a question `/plan` answers by reading `bootstrap::open_database`, and only a found
  defect there reaches Rust. *Why: the credential path is [[rules/credentials]]'s, and this
  effort is about screens.*
- **Switching is the sign-in path past the wall, not a page reload.** The shell reopens the
  workspace by the same stages a sign-in runs (open, changes, records) and invalidates every
  query, so nothing drawn from the previous workspace survives. *Why: [[rules/data]] on
  cached queries; a list from workspace A drawn under workspace B's name is the failure that
  reads as data loss.*
- **The walk's third step and the dialog are one component** (requirement 13). *Why: two
  forms for one act is how the limit changes in one and not the other.*
- **The wall's shape is the human's, settled on screen on 2026-08-20** (see the comment in
  `startup-sign-in.svelte`): one word of title, a line, air, the way in. The picker rows are
  drawn inside that shape and nothing else on the wall moves. *Why: requirement 7 was
  chosen as a change to the list, not to the wall.*
- **Every glyph comes from the two libraries already in use**, Lucide for the design
  package and its consumers, Tabler where the shell already uses it. *Why: a third set is a
  third stroke weight.*
- **The visual reference is cited where it decides something.** *Supercharge the defaults*
  (p.220) for icons as bullets; *Balance weight and contrast* (p.56) for the muted field
  glyph; *Semantics are secondary* (p.60) where a button's rank is in question. *Why:
  [[rules/interface]], *The visual reference*.*
- **Looks are settled on screen, on real data.** Where a shape is in question, the switcher's
  rows, the picker, the connect list, it is prototyped in the running application against
  the human's own organization and judged there, never on a mock. *Why: the wall's own
  history is one slot added and removed in a day after being looked at.*
- **A changeset rides with the change.** *Why: every one of these screens is one a person
  sees, and [[rules/version-control]] requires the entry for a user-visible change.*

# Out of Scope

- **The account page beyond its password form's glyphs**: identity, and the page's frame.
- **The members and invitations lists, removal, lock-out, reissue and revoke.** Their rows,
  their dialogs and their wording stay; only what surrounds them on the organization page
  moves.
- **The organization link section and reconnecting authority.** Both stay on the organization
  page as they are.
- **A progress bar, dots, or a stepper.** The position is a line of text.
- **The consent flow itself**: what Turso asks, what the poll does, how a disconnect works.
- **Remembering the last organization at the wall.** Chosen against on 2026-09-12; a picker
  with the rows is the whole of requirement 7.
- **Switching organizations from inside the application.** A machine that has joined two
  organizations switches at the wall, as 819 requirement 17 settled; the rail's switcher is
  between workspaces of the one organization the person is in.
- **Workspace settings, renaming, deletion, and who may open a workspace.** `workspace_grant`
  and `workspace_delete` are not drawn anywhere new; the workspace page is not touched.
- **Rewriting the succession sentence's facts.** The third connect item says what the current
  paragraph says, shorter. What a personal account costs is 819's decision.
- **The rents ledger.** Nothing behind the rail changes.

# Assumptions

- The corner control's tooltip renders on every screen in scope because each is drawn inside
  `TooltipProvider` and `DesignProvider`; `startup-unreadable.svelte` is the one screen
  outside both and is not in scope.
- "paste another link" and a corner back have the same destination on every join step, so
  removing the link loses nothing.
- `workspace_open` can be called while another workspace's database is open, since startup
  reopens the last workspace over the one recorded from the previous run. If
  `bootstrap::open_database` turns out to leak the previous replica, the Rust change is a
  finding for the plan, and the constraint above admits it.
- A member holds a grant on every workspace in `session.workspaces`, so the switcher's list
  is that array and no second read is needed.

# Risks

- **A back during a pending consent races the poll**: the person returns to the wall while
  the browser finishes, and the machine then holds authority nobody acknowledged. Requirement
  6 is the mitigation.
- **A switch that fails halfway leaves the rail naming one workspace and the lists drawing
  another.** The constraint on switching runs the whole sign-in path and invalidates every
  query; a failure raises the ordinary startup error surface rather than a half state.
- **Arabic strings that are translations of shorter English lose the fact.** The connect
  items carry what a person must do before pressing anything. Criterion 16 asks for written,
  not copied, and review reads both.
- **The effort is large for one context.** Sixteen requirements over three areas; the plan
  cuts it into tickets by area (before sign-in, the shell, the dialogs) and each ticket
  lands on its own.
