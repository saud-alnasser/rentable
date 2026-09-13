---
use-when: "building a ticket in effort 824 and the approach is not obvious from the spec"
---

# Architecture

Two decisions were put to the human on 2026-09-12 and both went to the recommendation. Everything
else follows the seams the code already has. *Widened 2026-09-13 for spec requirements 17 to 25:
the sections from "One organization on a machine" down are the way in, and two more decisions
were put to the human the same day, the record's shape and the invitation's sealed half; both
went to the recommendation.*

## A switch runs the sign-in path, under the loading surface

`startup.ts` gains one method, `switchWorkspace(workspaceId)`. It refuses while a switch or a
sign-in is in flight, sets `state: 'loading'`, calls `ports.organization.openWorkspace(id)`,
drops every query nothing is drawing any more and invalidates the rest, then `#enterApplication()`, which is what every way
through the wall already calls: `#continue()` runs the open, changes and records stages, admits
again, and lands on `ready`. A failure goes through `#fail` to the existing error surface, whose
retry is `start()`, which reopens whatever `remote-sync.json` records as current.

**Why this and not a switch in place.** `#continue()` is the only path that opens a workspace
and is held by 26 tests. An in-place switch (`workspace_open`, then `invalidateAll()`) is that
path rewritten without the loading state, and it draws every list under the new name while the
old rows are still on screen, which [[rules/data]] on cached queries is written against. The
loading surface for a second is the cost, and it is the same second a sign-in costs.

**The Rust side needs nothing.** `bootstrap::open_database` lets go of whatever database is held
before building the next replica, the one-file rule its own comment states, and `workspace_open`
calls it after recording the chosen workspace as current. Startup exercises exactly this on every
launch, reopening the recorded workspace over the plain file opened before sign-in. The
assumption the spec names is confirmed by reading `bootstrap.rs` lines 109 to 200.

**The API context is not forgotten on a switch.** `context()` derives `db`, `host`, `clock` and
`identity`; a switch changes none of them, since `db` is the proxy client and the identity is the
member. `#rememberSession()` is not called; `#continue()` refills the
remote-sync snapshot, and `cache.rememberRemoteSync` is called after it so the rail's query reads
the new workspace without waiting for a refetch.

*This said the cache is cleared. It is not, and ticket 05 found why on 2026-09-12: on the installed
query-core, `client.clear()` under a live observer leaves that observer holding its last data for
good, since an observer rebinds only when its options change, and the rail's props do not change
on a switch; the rail would have kept naming the old workspace. So the page's queries, which have
no observer once the loading surface replaced it, are removed (`cache.dropUndrawn`, one new port
over `removeQueries({ type: 'inactive' })`), and the rail's are refetched through the existing
`invalidateAll`. The spec's "invalidates every query" holds either way.*

## The two dialogs mount once, in the shell

`organization/dialogs.svelte.ts` holds `export const organizationDialog = $state<{ open: 'invite'
| 'workspace' | null; invited: Invited | null }>(...)` with `openOrganizationDialog(kind)`,
`closeOrganizationDialog()`, `showInvited(invited)`, `dismissInvited()` and
`resetOrganizationDialogs()`. *This said `{ open }` and two functions. The members list's reissue
also produces a link and a password, and with the inline form gone that result needed the one
panel too, so ticket 06 put the panel's state in the store beside `open`.* The precedent is `layout/startup-stage.svelte.ts`, module-level rune
state read by the shell, and `sync/sign-out.ts`, a request one component raises and another
answers. `layout/component/organization-dialogs.svelte` mounts both `FormSurface`s, reads the
organization state query for `session.workspaces`, the role and the permissions, and is rendered
by `routes/+layout.svelte` inside the providers wherever `LayoutFrame` is, beside it rather than
inside it, since the frame owns navigation and not forms.

**Why one host and not one per caller.** The rail menu and the organization page both open the
invite; with an instance each, an invitation made from the menu shows its link and password in a
panel the page's instance has never seen, and a person who navigates to the page to find them
finds an empty form. One instance is one result panel.

## The wall is a login page

The wall names the held organization as a line, and draws two fields, username and password,
both inside `input-group` with a muted glyph, and the unlock with its verb. `onSignIn(username,
password)` replaces `onSignIn(organizationId, password)`; `startup.signIn` and the
`organization.signIn` port change shape with it, and the sign-out row on the wall gains a
disconnect link (below). *This said the select stays, and before that a radio group; the human
withdrew the rows on 2026-09-13 and the same day gave the picture under which a machine holds
one organization, so there is nothing to choose between here.*

## One organization on a machine

`RemoteSyncStore.organizations: Vec<JoinedOrganization>` becomes
`organization: Option<HeldOrganization>`, where `HeldOrganization` is `JoinedOrganization` with
`member_id` and `role` made `Option`: a machine that connected by link holds the organization and
no member yet; the first sign-in fills them; sign-out keeps them. Serde's `default` keeps the
record readable, and the old `organizations` key surviving in `remote-sync.json` is one of the two
signs of the old shape (below).

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **A, `Option<HeldOrganization>`** (recommended) | the type says what the spec says: one or none; every reader that iterated is one `if let` | every consumer of `organizations` changes, in Rust and in `host.ts` | none beyond the edit | the frontend's `organizations: JoinedOrganization[]` becomes `organization: HeldOrganization \| null`, one field |
| B, keep the `Vec`, refuse a second | fewer edits | a `Vec` that may hold one is a rule nobody can see from the type, and the wall keeps a list it cannot show | a second push lands somewhere and the wall draws it or hides it | every reader keeps a loop over one element |

**Connecting** is `organization_connect(link)`: decode, `reached` (as inspect does), verify the
rows against the pinned key by reading `organization` once, write the record with no member, and
return the state. It refuses while an organization is held. **`organization_link_inspect`** stays
as the connect screen's `inspecting` step, returning the name; `LinkStanding` loses every
invitation value and the link loses its `invitation` half (below).

**Forgetting** is one routine, `organization::forget(app_state)`: sign out if signed in, close and
delete every `org-*.db*` and `ws-*.db*` under the data directory, set `organization: None`,
`replicas: []`, `workspace` to default, clear the Turso authority from the keyring
(`consent.disconnect()` in `sync/turso/consent.rs`, which the walk's disconnect already calls), commit. It is called by
`organization_disconnect` (the command the wall and the page reach, after the frontend's one
confirm) and by startup when the shape is old: `remote-sync.json` still carrying a non-empty
`organizations` array, or a held organization whose replica has no `member.username_sealed`
column (`PRAGMA table_info`). The startup check runs in `organization_state_get`'s first call,
before anything is read from the replica, and writes a diagnostic saying what it forgot.

## Signing in is username and password

`organization_sign_in(username, password)` is 819's `join::restore` with the link replaced by
the held organization: open the replica as today, try the password against each non-removed
member's vault, and check the sealed username on the row that opens against the typed one,
lower-cased and trimmed. The three refusals are the one sentence (`Forbidden`). On success, if
the member's `must_change_password` is set and an unconsumed invitation names them, the
invitation is consumed and pushed, as `join` did; the session carries `must_change_password` and
the shell's password-change gate does the rest. The record's `member_id` and `role` are filled.

The invitation loses its `sealed_payload`, `kdf_salt` and `kdf_params`: they existed to bind the
link's half and the password to a member id, and the row is now found by the password alone. What
stays is `id`, `member_id`, `expires_at`, `consumed_at` and the signature: the pending list, the
expiry, reissue and revoke read exactly those. `JoinLink.invitation` goes, `invitation_secret()`
goes, `open_invitation` and `InvitationPayload` go. `join::join` and `join::restore` go;
`organization_join` and `organization_restore` go with them, and `host.ts` and the frontend's
`organization/join.ts` lose their callers.

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **A, drop the invitation's sealed half** (recommended) | the schema says what an invitation is now: a pending account with an expiry; no dead columns, no dead crypto | a larger diff in `invite.rs` and `link.rs` | an expiry that used to be enforced at `join` is enforced at sign-in instead, and the test has to say so | one less secret to reason about |
| B, keep the columns, stop reading them | smaller diff | a sealed payload nobody opens, a link field nobody fills, and a reviewer asking why | a later reader reintroduces the link half because the column invites it | dead code kept honest by comments |

**Expiry at sign-in.** A member whose invitation has lapsed is refused with a sentence naming the
lapse, since that is what reissue is for. A revoked one has no invitation row at all, since
`revoke_invitation` deletes it and touches the member row only through the pending list, so a
handed password with no invitation row, spent or open, is refused with the one sentence. *This
said a revoked one reads `removed` on the row; ticket 11 read `revoke_invitation` and found it
does not, and the orchestrator closed the gap at integration.*

## An account is a username

`member.username_sealed` replaces `email_sealed` and `display_name_sealed`, sealed under the
content key with the label `member.username_sealed`. `MemberFacts`, `MemberSession`'s facts,
`OrganizationSession` and `OrganizationMember` carry `username` and lose `email` and
`displayName`; `ownerDisplayName` becomes `ownerUsername`. `invite::validate_username` holds
requirement 21's rules (3 to 32, `[A-Za-z0-9._-]`, compared lower-cased) and the uniqueness check
decrypts every non-removed member's username under the session's content key. `create_organization`
takes the owner's username beside the name and the password. `member_rename(member_id, username)`
re-seals and re-signs the row under the actor's signer, the way `removal` writes a row, with the
same validation; a session whose `member_id` is the target is refused.

The design package's `avatar` primitive already draws the rail's disc from `accountInitials`;
it reads `session.username` and the members list draws the same disc per row.

## The connect screen

`join-screen.svelte` keeps `paste`, `inspecting`, `unreadable` and `unreachable`; `inspecting`
resolves to `organization_connect` directly, so there is no step between reading the link and
standing at the wall. The route's `onConnect` runs the connect and calls
`startup.standingChanged()`, which raises the wall on the held organization. The `password`,
`restore` and `refused` steps, `onJoin`, `onRestore` and their strings go.

## The workspace form is one definition, drawn on two surfaces

`FormSurface` owns its `<form>` element and takes `enhance`, and the walk sits on
`StandaloneSurface`, so the third step and the dialog cannot be one Svelte component. What is
shared is `organization/workspace-form.ts`, holding the schema built from `WORKSPACE_NAME_LIMIT`
with the locale's messages, and `organization/component/workspace-fields.svelte`, the one name
field with its glyph and `FieldError`, taking a `superform`. The walk's third step and the dialog
each own a `superForm` over that schema and render those fields. Spec requirement 13 is read this
way and its criterion holds: a name over the limit is refused with the same message in both
places because both read one schema.

## The connect step is a list

`SETUP_WALK`'s `statements` stay the data; the component renders them as `<ul>` with a Lucide
glyph per item (`folder-plus` for the group, `user-plus` or `id-card` for the account, `building`
for where the organization lives; the prototype settles which, the plan settles that each has
one). The open-dashboard action is a `Button variant="link"` inside the first item's text rather
than a row of its own at the foot. *Supercharge the defaults* (Refactoring UI p.220) is the
citation the component carries.

## Back is `SurfaceAction` in the `corner` slot

Every step with somewhere to go passes a `corner` snippet holding `SurfaceAction` with
`ArrowLeftIcon` and `rtl:rotate-180`, `label` the locale's "back", `onclick` the step's
destination. The walk's `onBack` prop becomes the one route-level handler that decides between
`goto(THE_WAY_IN)` on `connect` and `step = previous` on `name`, and the walk's third step draws
no corner (spec requirement 1, amended 2026-09-13); the join screen's `onPasteAnother` is renamed
`onBack` and the route gives it the same shape. `startup-error.svelte` is the model. *This said
every step, and `step = previous` elsewhere; the third step's back re-entered the step that
created the organization.*

# Components

| Part | Becomes responsible for |
| --- | --- |
| `layout/startup.ts` | `switchWorkspace(id)`; nothing else changes |
| `layout/startup-ports.ts` | one new port, `cache.dropUndrawn`; `organization.openWorkspace` and `cache.invalidateAll` exist |
| `layout/component/workspace-menu.svelte` | the list of `session.workspaces` with the open one marked, `onSwitch(id)`; the invite and workspace rows call `openOrganizationDialog`, or draw refused with a sentence; no `LockIcon` |
| `layout/component/sidebar.svelte` | passes `session.workspaces`, the open `workspace.remoteId`, `canInvite`, `canCreateWorkspace` and `onSwitch` into the menu |
| `layout/component/organization-dialogs.svelte` | new: mounts the two `FormSurface`s, owns their mutations, reads `organizationDialog` |
| `organization/dialogs.svelte.ts` | new: the open state and its two functions |
| `organization/component/invite-form.svelte` | the fields and result panel inside a heavy `FormSurface`; the page no longer holds it inline |
| `organization/component/workspace-fields.svelte` | new: the one name field with glyph |
| `organization/workspace-form.ts` | new: the schema factory |
| `organization/component/workspaces.svelte` | the list only, and a control that opens the dialog for the owner |
| `routes/organization/+page.svelte` | lists and openers; loses `useCreateWorkspace`, `useInviteMember`, `invited`, `copied` and `create` |
| `organization/setup.ts` | `SETUP_STEPS` is `connect`, `name`, `workspace`; `SetupField` gains `workspace`; `fieldsPresented` and the vocabulary guard keep their meaning |
| `organization/component/setup-walk.svelte` | three steps with corner back, position line, connect list, third step on the shared fields; `done` and the link go |
| `routes/organization/new/+page.svelte` | reads `holdsTursoAuthority` to open `connect` as granted; the third step's create calls the workspace mutation then `startup.standingChanged()` and `goto(THE_WAY_IN)` |
| `organization/component/join-screen.svelte` | corner back on every step, `onBack` replacing `onPasteAnother`; glyphs |
| `layout/component/startup-sign-in.svelte` | the held organization's name, username and password fields with glyphs, `onSignIn(username, password)`, a disconnect link while signed out. *This said the radio-group picker, then the select; both withdrawn 2026-09-13* |
| `tauri/src/sync/store.rs` | `organization: Option<HeldOrganization>` replaces `organizations` |
| `tauri/src/organization/store.rs` | `username_sealed` on `member`; the invitation without its sealed half; `members()` reads the new column |
| `tauri/src/organization/{join,invite,setup,session,link}.rs` | sign-in by username, connect, forget, validate and rename, the owner's username at creation, the link without an invitation half |
| `tauri/src/organization/command.rs` | `organization_connect`, `organization_disconnect`, `member_rename`; `organization_sign_in(username, password)`; `organization_join` and `organization_restore` removed; the forget on first `organization_state_get` |
| `platform/host.ts`, `platform/tauri.ts`, `organization/router.ts`, `api/context.ts` | the new and changed commands and types |
| `organization/component/join-screen.svelte`, `routes/organization/join/` | the connect screen |
| `organization/component/{invite-form,members,invitations,identity}.svelte` | username in, email and display name out; the result panel's third copy; a rename dialog on the members row |
| `layout/component/account-menu.svelte` | initials from the username |
| `layout/component/startup-no-workspace.svelte` | the shared fields and a verb glyph; owner-only sentence unchanged |
| `organization/component/change-password-form.svelte` | field glyphs and a verb glyph |
| `organization/query.ts` | `useCreateWorkspace` keeps its explicit-client parameter; nothing moves |

# Interfaces

- `startup.switchWorkspace(workspaceId: string): Promise<void>`, a no-op while
  `isSigningIn` or already loading; resolves once `ready` or `error` is set.
- `workspace-menu.svelte` props: `{ workspaces: OrganizationWorkspace[]; openId: string | null;
  memberCount: number; canInvite: boolean; canCreateWorkspace: boolean; refusal: { invite:
  string | null; workspace: string | null }; onSwitch: (id: string) => void }`. The refusal
  sentences are composed by the sidebar from the locale, so the menu draws and never decides.
- `setup-walk.svelte` props lose `created`, `linkCopied`, `onCopyLink`, `onContinue` for the done
  step; gain `holdsTursoAuthority: boolean` and `onCreateWorkspace(name): Promise<void>`;
  `onBack` stays and now fires on `connect` too.
- `join-screen.svelte`: `onPasteAnother` becomes `onBack`, fired on every step.
- `organizationDialog.open`, `openOrganizationDialog('invite' | 'workspace')`,
  `closeOrganizationDialog()`.
- Strings: `layout.workspaceMenu.{switchTo, open, inviteRefused, workspaceRefusedOwner,
  workspaceRefusedAuthority}`, `organization.setup.{workspaceTitle, workspaceDescription,
  position, back}`, `organization.setup.connect{Group, Account, Succession}` as the three
  shortened items, `organization.join.back`, in `en` and `ar`. `setup.doneTitle`, `setup.doneDescription`,
  `setup.linkLabel`, `setup.notYetSent` and `join.pasteAnother` are removed with their step;
  `setup.copyLink` and `setup.linkCopied` stay, read by the invite form and the organization link.

# Technical Approach

The order is by dependency, then by what a person can see soonest.

1. **The shared workspace form** (`workspace-form.ts`, `workspace-fields.svelte`), because the
   walk's third step and the dialog both need it and neither should be built on a form the other
   later replaces. The no-workspace surface takes it in the same change, since it is the third
   place that draws the same field.
2. **The walk**: steps, position line, connect list, third step, `holdsTursoAuthority`, the
   corner back on both walk steps. One ticket, because `setup.ts`, the component, the route, the
   strings and both tests move together and a walk half-moved is unusable.
3. **The join screen and the wall**: corner back on every join step; the wall's glyphs. Two
   tickets, since neither depends on the other. *The wall's ticket was cut for the picker; it
   carries the glyphs alone since 2026-09-13.*
4. **The switcher**: `switchWorkspace` in `startup.ts` with its tests, then the menu and the
   sidebar. One ticket; the method without the menu is unreachable and the menu without the
   method has nothing to call.
5. **The dialogs**: the store, the host, `invite-form.svelte` into `FormSurface`, the
   organization page's sections as lists with openers, the menu rows going live. One ticket,
   after 4, because the menu rows land in the same file the switcher reshaped.
6. **The glyph vocabulary** on whatever is left: change-password, and any button or field the
   tickets above did not already carry. Last, so it sweeps the finished screens rather than
   being redone as each moves.

*Added 2026-09-13, for requirements 17 to 25; Rust first, because every screen reads a fact it
changes:*

7. **The username in the organization database**: the schema, `MemberFacts`, `create_organization`,
   `invite_member`, validation and uniqueness, every reader of `email` and `display_name` in Rust,
   and the session facts the frontend types read. One ticket; a database half-moved opens nothing.
8. **One organization on the machine**: the record, `organization_connect`, `forget`,
   `organization_disconnect`, the startup check for the old shape. One ticket.
9. **Sign-in by username**: `organization_sign_in`, the invitation without its half, the link
   without its half, `join` and `restore` removed, expiry at sign-in. After 7 and 8.
10. **Rename**: `member_rename` and its permission. After 7; small, its own ticket so 9 stays
    readable.
11. **The connect screen**, after 8. **The wall**, after 9. **The forms and lists reading the
    username** (the walk's `name` step, invite and its result, members, pending accounts, identity,
    the page's sentences), after 7 and 9. **The avatar**, after 7. Four tickets, since each is one
    screen family with its own test file.
12. **The second sweep**: both locales read for every string added, the first run by hand on the
    human's wiped machine, `cargo test`. Last.

Prototyping happens inside 2, 3 and 4 wherever a shape is in question, on screen against the
human's own organization, and the ticket says so as a constraint.

# Integration

- `routes/+layout.svelte` renders `organization-dialogs.svelte` inside the providers, guarded on
  `shellState.railIsUp && shellState.organization?.session`.
- `sidebar.svelte` already reads the organization state and the remote-sync state; the switcher
  reads `workspace.remoteId` as the open id from the same query the rail's name comes from, so
  the marker and the name cannot disagree.
- The `done` step's own strings go and nothing else reads them; `copyLink` and `linkCopied`
  are shared with `invite-form.svelte` and `organization-link.svelte` and stay (grep on
  2026-09-12). The organization page's `OrganizationLink` is where the link lives and is
  untouched.
- `shell-surface.ts`'s `OPENS_SIGNED_OUT` is unchanged: the first run's third step runs signed
  in, on the same address, because the `name` step signed the owner in.

# Migration

None, by the human's decision on 2026-09-13 (spec requirement 17): `remote-sync.json` changes
shape (`organizations` to `organization`) and the organization database changes schema
(`member.username_sealed`, the invitation without its sealed half), and a machine holding either
old shape forgets everything at startup and opens on the first screen. The organizations on Turso
built under the old schema are left where they are and cannot be opened by this build. *This said
nothing on disk changes shape, which held until requirement 17.*

# Testing Strategy

Each number is the spec's acceptance criterion.

1. `setup-walk.svelte.test.ts` and `join-screen.svelte.test.ts`: per step, exactly one
   `getByRole('button', { name: back })`, its click calling `onBack`, and none on `done`'s
   replacement; `grep` in the ticket's gate for the removed button and link.
2. Once, by hand, on the human's account with the browser consent left open; recorded in the
   ticket's notes.
3. `setup.test.ts`: `SETUP_STEPS` and the third step's one field; `fieldsPresented` is `name`,
   `password`, `workspace`, and the vocabulary guard still finds no slug, group, token or url.
   `startup.test.ts`: `standingChanged` after a create opens the one workspace and reaches
   `ready`. Once by hand for the whole first run.
4. `setup-walk.svelte.test.ts`: the position line's text per step, both locales.
5. `setup-walk.svelte.test.ts`: three `li`, each with an `svg`, the dashboard link inside the
   first, no `p` outside the list; a word count over `en` in `setup.test.ts` against the three
   old sentences kept as a literal in the test.
6. `setup-walk.svelte.test.ts` with `holdsTursoAuthority: true`: the granted callout, continue
   and disconnect present, and `onConnect` never called.
7. `startup-sign-in.svelte.test.ts` with two organizations: the select naming the first, no
   `[role=radio]`, the password field present; and the unlock's glyph and the password field's
   muted addon. *This said two `[role=radio]` rows and no `select`; amended 2026-09-13.*
8. `startup-no-workspace` cases already in `startup-sign-in.svelte.test.ts`: the addon and the
   button glyph.
9. A new `workspace-menu.svelte.test.ts`: rows equal to `workspaces`, the marker on `openId`,
   selecting another calls `onSwitch` with its id. `startup.test.ts`: `switchWorkspace` drops
   the undrawn queries and invalidates the rest, calls `openWorkspace` with the id, runs the
   stages, sets `ready`, and a throwing open sets `error`. Once by hand between the human's two
   workspaces.
10. `workspace-menu.svelte.test.ts`: with `canInvite` false the row is `aria-disabled` and
    carries the refusal sentence; `grep -c LockIcon` is zero.
11. `workspace-menu.svelte.test.ts`: rerendering with a new `openId` keeps one
    `[data-workspace-menu]`. (The spec named a sidebar test; none exists, and the menu's own test
    is the check.)
12. `invite-form.svelte.test.ts` renders the dialog open and asserts the fields and, with
    `invited` set, the result panel; `grep -c "<form" routes/organization/+page.svelte` is zero;
    `workspace-menu.svelte.test.ts` asserts the two rows call the openers. (The spec named an
    organization page test; routes are not rendered under vitest here, and the grep is the
    check.)
13. `setup.test.ts` imports the schema factory and asserts the over-limit message equals the one
    the dialog's test reads.
14. Each screen's component test asserts `button[type=submit] svg` or the named button's `svg`;
    the continue arrow's class contains `rtl:rotate-180`.
15. Each screen's component test asserts `[data-slot=input-group-addon] svg` before the named
    input and the addon's class contains `text-muted-foreground`.
16. The gates, in each ticket.
17. Rust: a `RemoteSyncStore` deserialised from JSON carrying two `organizations` triggers
    `forget`; a replica created with the old `member` schema triggers it; after either the data
    directory holds no `org-*` or `ws-*` file and the record is default. `sync/store.rs` and
    `organization/mod.rs` tests on a temporary directory.
18. `join-screen.svelte.test.ts`: `paste` to `inspecting` to `onConnect(link)`; no password
    field on any step; `grep -c "restore" join-screen.svelte` is zero. Rust: `connect` writes the
    record with `member_id: None` and opens no vault.
19. `join.rs` (or `session.rs`) tests over a store with two members: right pair opens; wrong
    password, unknown username, and the other member's password each refuse with one sentence;
    a member with an open invitation has it consumed and `must_change_password` set; a lapsed
    invitation refuses by name.
20. Rust: `forget` on a temporary data directory holding an organization and two workspace
    replicas leaves none and clears the authority (the keyring behind a fake). Component tests:
    the wall's disconnect and the page's each open the confirm and call the port on confirm.
21. Rust: `validate_username` table test over the limits and the character set; uniqueness
    against a store with `alice` refuses `Alice`; `create_organization` refuses an invalid owner
    username. The walk's and the invite dialog's tests read the same message.
22. `invite-form.svelte.test.ts`: inputs `username`, `role`, the workspace checkboxes, no `email`
    or `displayName`; the result renders three copy controls.
23. Rust: rename by the owner re-signs and the members read shows it; rename to a taken name
    refuses; a member session refuses. `members.svelte.test.ts`: the rename row opens the dialog.
24. `account-menu` and `members` tests: the avatar fallback text is the first two characters of
    the username, upper-cased.
25. The strings, asserted in the organization page's section tests in both locales.

# Technical Risks

- **Deleting a replica the process still holds open.** `forget` runs with the vault closed and
  the workspace database released; on Windows a file still open cannot be deleted, so `forget`
  closes through the same path sign-out and `open_database` use and reports a file it could not
  remove rather than pretending. First sign: `org-*.db` surviving a disconnect.
- **The startup check reads a schema before the wall.** `PRAGMA table_info(member)` and
  `PRAGMA table_info(invitation)` on the held replica are local reads; they run before any
  pull, so an unreachable remote does not stop the check. A replica missing entirely counts as
  the old shape too, and so does one with usernames and the invitation's sealed half, the shape
  between tickets 10 and 11.
- **`accountInitials` on a username with one character.** Requirement 21's floor is three, so
  it cannot happen for a valid row; the helper still pads rather than throwing.

- **A switch while a sync is in flight.** `startWorkspaceSyncManager` may report a result for the
  old workspace after the cache is cleared. `applySyncOutcome` re-reads the remote-sync state,
  which by then names the new workspace, and a `received` outcome runs `announceReceived`, a
  reconcile over whatever is open; harmless, but it is a reconcile the new workspace did not
  need. The outcome therefore carries the workspace the dispatch ran for, read before it ran,
  and the handler drops a result whose workspace is not the one now open; the startup test
  covers a late outcome arriving after `ready`. First sign without it: a "received rows" toast
  right after a switch. *This said a flag the handler reads. A flag cannot tell a late report
  from a fresh one once `ready` is set again, so ticket 05 put the workspace on the report.*
- **The radio group inside the wall's `form`.** *Withdrawn with the picker on 2026-09-13; the
  select binds `organizationId` as it did before this effort.*
- **`FormSurface` under the sidebar's drawer breakpoint.** A heavy form is an edge sheet, and the
  sidebar presents as a drawer below `md`; both are `Dialog`s and stack by z-order. First sign:
  the invite sheet opening under the drawer on a narrow window. Checked by hand at 700px.
- **The walk's third step and `standingChanged`.** After the create, `#hasWorkspace` opens the
  workspace and `#enterApplication` runs; the route must `goto(THE_WAY_IN)` before or during
  that, or the application draws under `/organization/new`, which `OPENS_SIGNED_OUT` allows and
  the shell would keep. The route calls both in the order the `done` step's `next()` does today.
