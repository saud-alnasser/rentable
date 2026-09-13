---
status: accepted
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
open, and the one thing a person is choosing between is hidden behind a control. *Withdrawn by
the human on 2026-09-13, seen on screen as rows: choosing an organization does not belong on
the wall at all. In their picture of the way in, an organization is connected once, one is
signed in to at a time, and the wall is a login page, username and password; the choice
between organizations a machine holds is a page before it. That is a later effort's, and until
it exists the select stays as it is.*

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

**And the way in is not the one the owner pictures.** Effort 819 built a machine that joins
several organizations and chooses between them at the wall, an invitation that is a link
carrying its own half of a secret, and a sign-in that knows which member this machine is and
asks only for a password. Seen on screen on 2026-09-13 the human gave the order the way in
should take: an application connects to one organization, by the owner's Turso account or by
the organization's link, and goes straight to a login page; the login page is username and
password, against an account the owner or an administrator made inside the application; to
reach another organization a person disconnects and connects to the other. The rows of
requirement 7 were the first casualty of that picture; the rest of it is requirements 17 to
25.

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
their first workspace, not on a screen asking them to continue past nothing. An application
holds one organization, connected once by the owner's account or by the organization's link,
and the wall is a login page for it: username and password, against an account somebody made
for the person inside the application. The rail's
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
  switching mid-session needs it (see Constraints). *Widened 2026-09-13 by requirements 17 to
  25:* the organization database's `member` and `invitation` rows and the machine's record of
  what it holds (`organization/{store,join,invite,setup,session,link,command}.rs`,
  `sync/` where the record is persisted), a sign-in by username, a connect without a vault, a
  disconnect, a rename, and the startup that forgets the old shape.
- **The way in, widened**: `organization/component/join-screen.svelte` becomes the connect
  screen; `layout/component/startup-sign-in.svelte` asks for username and password;
  `organization/component/{invite-form,members,invitations,identity}.svelte`,
  `layout/component/account-menu.svelte` and the rail's avatar read the username.

# Requirements

*Before sign-in*

1. **A back control in the surface's corner, on every step that has somewhere to go.** The
   walk's `connect` returns to the wall; `name` returns to `connect`; `workspace` has no back.
   *This said `workspace` returns to `name`. The correctness review of 2026-09-12 traced that
   path: `name` is the step that creates the organization on the Turso account and signs the
   owner in, so a return to it with the form still filled and a second press of create makes
   a second organization of the same name and leaves the first without a workspace. A step
   that already ran is not somewhere to go. Decided by the human on 2026-09-13: the third step
   keeps an empty corner, as the no-workspace surface it twins does.* The connect screen's
   `paste` and `unreadable` return to the wall; `inspecting` and `unreachable` return to
   `paste`. The corner control is the one way back: the outline "back" button and the "paste
   another link" links go. *This said the join screen's `password`, `restore` and `refused`
   returned to `paste`; those steps are gone with requirement 18.*
2. **Back is available while a consent is pending.** Leaving the walk with the browser still
   open abandons the poll and nothing else; a consent creates nothing on the account.
3. **The walk is connect, name, workspace, and ends inside the workspace.** The third step
   names the first workspace; creating it signs the owner in to it and the application opens
   on it, by the path a sign-in takes past the wall. The `done` step and its link go; the
   organization's link is on the organization page, where it already is. *Chosen 2026-09-12
   over keeping the three-step walk and the no-workspace surface behind it.* The `name` step
   asks for the organization's name, the owner's username and their password (requirement
   21); *added 2026-09-13*.
4. **The walk says its position**, as a quiet muted line reading "step n of 3" under the
   title on every step. No bar and no dots. *Chosen 2026-09-12.*
5. **The connect step's three facts are a list with a glyph for each bullet**, in this order:
   the empty group to prepare, with the open-dashboard action on that item; where an account
   comes from where there is none; where the organization will live and what that costs.
   The same facts, shorter sentences, in both locales.
6. **Returning to the walk finds what the machine already holds.** A first run opened on a
   machine that holds Turso authority shows `connect` as granted, with continue and
   disconnect offered, rather than asking again.
7. **The wall is the login page of the one organization this machine holds.** It names the
   organization as a line of text, asks for a username and a password, and unlocks; no
   select, no rows, no role, since the role is a fact of the account and not of the machine.
   The wall's title and description are unchanged; its unlock and fields carry the glyphs
   requirements 14 and 15 give every screen in scope. *This said the select stays; before
   that, several organizations read as selectable rows carrying name and role, chosen
   2026-09-12, built as ticket 04 and seen on screen, and withdrawn by the human on
   2026-09-13 because the rows made the wall a choice between organizations rather than a
   login page. The same day they gave the picture requirements 17 to 25 write down, and under
   it a machine holds one organization, so there is nothing to choose between at the wall.*
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
    The invite dialog still shows what it made, until dismissed, and still says it cannot
    send them: the organization's link, the username and the generated password, each with
    its copy control (requirement 22). *Chosen 2026-09-12 over inline forms restyled; the
    three copies said the link and the password until 2026-09-13.*
13. **The new-workspace dialog and the walk's third step are the same form**, one definition
    (the schema and the fields) drawn on two surfaces, so a name limit or a refusal reads the
    same in both places. *One Svelte component is not possible: the form surface owns its
    `<form>` and the walk sits on the standalone surface; `plan.md` says what is shared.*

*Everywhere in scope*

14. **Primary buttons carry their verb's glyph**: connect, create, unlock, continue, copy,
    change, invite, and switch where a row acts. Arrows mirror in RTL, as `back-control`
    already does. *Accepted 2026-09-13, on the review's finding: the rail's workspace rows are
    radio items, not buttons, and the marker the primitive draws on the open one is what a row
    carries; an unselected row carries nothing.*
15. **Fields carry a leading glyph** through `input-group`: organization, workspace,
    password, link, and username (*email and display name until 2026-09-13*). The glyph is muted, never as dark as the label, so it
    does not outweigh the text beside it (*Balance weight and contrast*, Refactoring UI p.56).
16. **Both locales, and the tests that hold the shape.** The component tests that render
    these screens assert the back control's presence and destination per step, the position
    line, the wall's organization line and two fields, the switcher's rows and marker, the
    two dialogs opening from both places, and the field glyphs. The walk description in
    `organization/setup.ts` names the third step and its one field.

*One organization* (*added 2026-09-13, from the human's picture of the way in; every choice
below was theirs, made the same day*)

17. **An application holds one organization, or none.** The machine's record names at most
    one; connecting is offered only when none is held. A machine that holds the shape built
    before this requirement, a record of several, or an organization database whose members
    carry an email and no username, forgets all of it at startup: every replica deleted, the
    record emptied, the Turso authority cleared, and the application opens on the screen a
    machine with nothing shows. *Decided 2026-09-13: nothing is published, so there is no
    migration and no one-time screen.*
18. **Two ways to connect, on the screen a machine with nothing shows**: set up an
    organization on the owner's own Turso account (the walk), or connect by the
    organization's link. Connecting by link records the organization on this machine, its
    id, name, remote and verifying key, opens no vault, and lands on the wall. The link
    screen keeps `paste`, `inspecting`, `unreadable` and `unreachable`, and loses `password`,
    `restore` and `refused`: a link carries no invitation half any more, and a person is
    admitted at the wall, not at the link. *This retires 819's join and restore as ways
    through the wall.* The screen itself is a word of title, a friendly line saying what the
    two are for, and the two ways as controls carrying their verb's glyph and three words at
    most, create organization and connect with link, and nothing else; the
    locked wall offers neither, since a machine holds one organization, and its foot carries
    disconnect alone. *Chosen by the human on 2026-09-13 on seeing the first screen: simpler,
    with icons, and settled over three looks at it.*
19. **Signing in is username and password against the held organization.** The account is
    found by trying the password against each vault and checking the username on the row that
    opens, as 819's restore did by email; a pair that opens nothing is refused with the one
    sentence, and nothing says whether the username exists. A first sign-in on a handed
    password consumes the account's pending state and still forces the password change.
    Signing out returns to the wall with the organization still held. An owner on a second
    machine signs in like anybody and reconnects the authority from the organization page,
    as today.
20. **Disconnect forgets the organization on this machine.** Offered on the wall while signed
    out and on the organization page while signed in, which signs out first; it deletes the
    organization replica and every workspace replica on this machine, empties the record, and
    clears the Turso authority from the keyring. The organization and its workspaces on Turso
    are untouched, and the person can connect again by the link. It asks once before it runs.
21. **An account is a username and a password.** `username` replaces `email` and
    `display_name` on the member row, sealed as they were. A username is three to thirty-two
    characters of letters, digits, `.`, `_` and `-`, compared without case, and unique within
    the organization; the owner sets their own on the walk's `name` step and every other on
    invite. The members list, the pending list, the rail's account control and the avatar read
    it.
22. **Making an account is what invite is.** The dialog asks for a username, a role and the
    workspaces; what it shows afterwards is the organization's link, the username and the
    generated password, each with a copy control, and the sentence that it cannot send them.
    The pending row keeps 819's expiry, reissue and revoke until the first sign-in.
23. **The owner or an administrator can rename an account** from its row in the members list:
    one field under requirement 21's rules, refused for a username already taken, the row
    re-signed by the actor; a member cannot rename themselves.
24. **The avatar is two letters of the username**, upper-cased, in the rail's account control
    and on the members list rows, drawn with the design package's avatar primitive where one
    exists and as the same lettered disc otherwise.
25. **The organization page names what it is for**: its link section says that the link plus a
    username and password is how a person gets in, and the invitations section is titled as
    pending accounts.

# Acceptance Criteria

1. On each named step, one control with the accessible name for back sits in the card's
   corner and pressing it lands where requirement 1 says, and the walk's `workspace` step
   renders none; `grep` finds no outline "back"
   button in `setup-walk.svelte` and no "paste another link" in `join-screen.svelte`.
   Asserted per step in the component tests.
2. With a consent pending, the corner control is enabled, pressing it reaches the wall, and
   the account shows nothing created. Verified once on a real consent; no test reaches the
   account.
3. `SETUP_STEPS` is `connect`, `name`, `workspace`; the `name` step presents `name`,
   `username` and `password`; creating the workspace on the third step lands the owner in the
   application with that workspace open and the rail naming it; no `done` step renders.
   Asserted in the walk's tests and once on a real first run.
4. Each walk step renders the position line with its own number and the total, muted, in
   both locales.
5. The connect step renders three list items each with a glyph, the dashboard action inside
   the first, no paragraph outside the list, and the three together are shorter in English
   than the paragraphs they replace.
6. With `holdsTursoAuthority` true, the walk's `connect` renders the granted state on first
   render and the consent is not begun. Asserted with the prop set.
7. With one held organization, the wall renders its name as text, a username input and a
   password input and nothing else that takes input, no `select` and no `[role=radio]`;
   submitting calls the sign-in with the username and the password; the unlock button
   carries a glyph and both fields a muted leading one. Asserted in
   `startup-sign-in.svelte.test.ts`. *This said the select naming the first of two; before
   that, two selectable rows; amended with requirement 7 on 2026-09-13, twice.*
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
    no second row is mounted. Asserted by the menu's own test rerendering with a new open id.
12. `invite-form.svelte` and the workspace form render inside `FormSurface`; the organization
    page renders no `<form>` of its own (`grep -c "<form" routes/organization/+page.svelte` is
    zero, since routes are not rendered under vitest here); both dialogs open from the page and
    from the menu, asserted in the invite form's test and the menu test. The invite result
    renders three copy controls, for the link, the username and the password.
13. One workspace form component is imported by the walk and by the dialog; a name over the
    limit is refused with the same message in both.
14. Each primary button named in requirement 14 renders an `svg` before its label; the
    continue arrow carries the RTL mirror class.
15. Each field named in requirement 15 renders inside an `input-group` with a leading addon
    holding an `svg`; the addon carries the muted foreground colour.
16. `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass; the Arabic strings are
    written, not copied from English.
17. The machine's record holds at most one organization, and `organization_state_get`
    answers with one or none; a record of the old shape, or a database whose `member` table
    has no `username` column, is forgotten at startup with every replica file gone from the
    data directory. Asserted in Rust with a record of two and with a database of the old
    schema; verified once on the human's machine, which holds two today.
18. From the screen a machine with nothing shows, pasting the organization's link lands on the
    wall naming that organization with no vault opened and no member recorded; the link
    screen's `password`, `restore` and `refused` steps no longer exist (`grep` in
    `join-screen.svelte` and in `organization/join.rs`). Asserted in the component test and
    in Rust against a store with one member.
19. In Rust, a username and password that match a member open a session; the wrong password,
    an unknown username, and a known username with another member's password are each refused
    with the same sentence; a first sign-in on a handed password marks the invitation consumed
    and the session as needing a password change. Sign-out leaves the record naming the
    organization. Asserted in `join.rs` tests.
20. Disconnect on the wall and on the organization page each ask once, then leave no
    `org-*.db*` or `ws-*.db*` under the data directory, an empty record, no authority in the
    keyring, and the screen a machine with nothing shows. Asserted in Rust on a temporary data
    directory; verified once by hand.
21. `member` carries `username_sealed` and no `email_sealed` or `display_name_sealed`;
    `member_invite` and `organization_create` refuse a username under three or over
    thirty-two characters, one with a character outside the set, and one already taken in any
    case; the walk's `name` step and the invite dialog refuse the same with the same sentence.
    Asserted in Rust and in the two forms' tests.
22. The invite dialog presents `username`, `role` and workspaces and no email or display name;
    its result renders the organization's link, the username and the password with a copy
    control each. Asserted in `invite-form.svelte.test.ts`.
23. A rename by the owner or an administrator re-signs the row and the members list shows the
    new username; a rename to a taken username is refused; a member's session refuses the
    command. Asserted in Rust, and the dialog in a component test.
24. The rail's account control and each members row render the first two characters of the
    username upper-cased inside the avatar. Asserted in the sidebar's and the members list's
    tests.
25. The link section's sentence and the pending accounts title read as requirement 25 says,
    in both locales.

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
  **One exception, decided 2026-09-12 on the first screen drawn:** `primitive/input-group`
  still carried the registry's stock geometry (h-9, rounded-md, bordered, shadowed) while the
  owned `primitive/input` is h-8, rounded-2xl and borderless, so every field this effort draws
  through it matched nothing beside it. The group takes the input's geometry, in the package,
  because the alternative was the same class string repeated on every field here and on every
  field after. No slot, no prop, no new behaviour: the primitive draws what the input draws.
- **The Rust side is untouched unless switching mid-session needs it.** `workspace_open`
  records the workspace and opens its database; whether it releases the replica it replaces
  is a question `/plan` answers by reading `bootstrap::open_database`, and only a found
  defect there reaches Rust. *Why: the credential path is [[rules/credentials]]'s, and this
  effort is about screens.* *Widened 2026-09-13:* requirements 17 to 25 reach Rust, and
  every one of them keeps [[rules/credentials]]: the password and the keys never cross the
  boundary, a sign-in hands facts back, a refusal is one sentence.
- **No plaintext identifier on a member row.** The username is sealed under the content key
  like the email it replaces, so a sign-in cannot narrow the rows before a vault opens and
  costs one Argon2id derivation per member for a wrong password, as 819's restore did. *Why:
  the read-only credential in the link reads every row, and a plaintext or keyed username
  would tell a link holder who is in the organization.* A plan that finds this cost too high
  for the organizations expected returns here rather than indexing.
- **Disconnect is the only way to reach another organization**, and it asks once. *Why: a
  machine that could hold two would need a chooser again, which is the thing withdrawn.*
- **Switching is the sign-in path past the wall, not a page reload.** The shell reopens the
  workspace by the same stages a sign-in runs (open, changes, records) and invalidates every
  query, so nothing drawn from the previous workspace survives. *Why: [[rules/data]] on
  cached queries; a list from workspace A drawn under workspace B's name is the failure that
  reads as data loss.*
- **The walk's third step and the dialog are one component** (requirement 13). *Why: two
  forms for one act is how the limit changes in one and not the other.*
- **The wall's shape is the human's, settled on screen on 2026-08-20** (see the comment in
  `startup-sign-in.svelte`): one word of title, a line, air, the way in. Nothing on the wall
  moves but the glyphs. *This said the picker rows are drawn inside that shape; they were,
  and on screen they were still a second thing on the wall. Withdrawn with requirement 7.*
- **Every glyph comes from the two libraries already in use**, Lucide for the design
  package and its consumers, Tabler where the shell already uses it. *Why: a third set is a
  third stroke weight.*
- **The visual reference is cited where it decides something.** *Supercharge the defaults*
  (p.220) for icons as bullets; *Balance weight and contrast* (p.56) for the muted field
  glyph; *Semantics are secondary* (p.60) where a button's rank is in question. *Why:
  [[rules/interface]], *The visual reference*.*
- **Looks are settled on screen, on real data.** Where a shape is in question, the switcher's
  rows, the connect list, it is prototyped in the running application against the human's
  own organization and judged there, never on a mock. *Why: the wall's own history is one
  slot added and removed in a day after being looked at, and the picker rows went the same
  way on 2026-09-13.*
- **A changeset rides with the change.** *Why: every one of these screens is one a person
  sees, and [[rules/version-control]] requires the entry for a user-visible change.*

# Out of Scope

- **The account page beyond its password form's glyphs and the username it names**: the
  page's frame.
- **Removal, lock-out, reissue and revoke.** Their dialogs and their wording stay; the rows
  read a username instead of an email and a display name, the invitations section is titled
  as pending accounts, and a rename row joins the members list (requirement 23). *Narrowed
  2026-09-13; this said the lists were untouched.*
- **Reconnecting authority.** It stays on the organization page as it is; the link section's
  sentence changes (requirement 25).
- **A progress bar, dots, or a stepper.** The position is a line of text.
- **The consent flow itself**: what Turso asks, what the poll does, how a disconnect works.
- **Choosing between organizations on this machine, at the wall or anywhere.** A machine
  holds one (requirement 17); reaching another is disconnect, then connect. *This said the
  select stays until a page before the wall exists, and before that the rows; the picture
  the human gave on 2026-09-13 was first recorded here as a later effort's, and the same day
  they asked for it in this one. It is requirements 17 to 25 now.*
- **A role that creates workspaces and nothing more.** Creating a workspace needs the Turso
  authority, which only the owner's machine holds, and there is no server to ask; an
  administrator sees the owner-only sentence, as today. *Decided 2026-09-13 over handing the
  token to administrators' vaults, which is a credentials-rule change of its own.*
- **A migration for organizations built before requirement 21.** Nothing is published; a
  machine forgets them (requirement 17) and the owner sets the organization up again.
- **Sending the link, the username or the password anywhere.** The dialog says it cannot.
- **An email on the account.** The username is the whole of the identity this effort keeps;
  an address, for anything, is a later effort's.
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
- The organization's own link, minted by `organization_own_link`, carries everything a
  connect needs (id, name, remote, verifying key, read-only credential) and nothing
  invitation-shaped, so requirement 18 changes what a link is read for, not what it carries.
- `member.vault` opens with the handed password exactly as with a chosen one, so requirement
  19's first sign-in is 819's join with the invitation half no longer needed to find the row.
- The design package holds an avatar primitive or the rail already draws a lettered disc;
  the plan reads which.
- `workspace_open` can be called while another workspace's database is open, since startup
  reopens the last workspace over the one recorded from the previous run. If
  `bootstrap::open_database` turns out to leak the previous replica, the Rust change is a
  finding for the plan, and the constraint above admits it.
- A member holds a grant on every workspace in `session.workspaces`, so the switcher's list
  is that array and no second read is needed.

# Risks

- **A wrong password costs one derivation per member.** Argon2id at 819's parameters is a
  quarter of a second on a fast machine; an organization of forty members makes a wrong
  password a ten-second refusal. Accepted for the organizations expected (the constraint
  above says why no index); the wall's waiting sentence covers it.
- **Forgetting at startup deletes data the human holds today.** Requirement 17 wipes the two
  organizations on the human's own machine and their workspace replicas; the remotes on
  Turso are untouched but were built under the old schema and will not open under the new.
  Accepted 2026-09-13 with "start over"; the run says so before the first launch of the build.
- **Two people with one username.** Uniqueness is checked on the owner's or administrator's
  replica at invite; two administrators offline at once could each make one. The rename
  refusal and the sign-in's password check keep it from being a security fault, and the
  second row to sync is a members-list fact the owner corrects with a rename.

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
