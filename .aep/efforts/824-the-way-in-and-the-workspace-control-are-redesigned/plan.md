---
use-when: "building a ticket in effort 824 and the approach is not obvious from the spec"
---

# Architecture

Two decisions were put to the human on 2026-09-12 and both went to the recommendation. Everything
else follows the seams the code already has.

## A switch runs the sign-in path, under the loading surface

`startup.ts` gains one method, `switchWorkspace(workspaceId)`. It refuses while a switch or a
sign-in is in flight, sets `state: 'loading'`, clears the query cache, calls
`ports.organization.openWorkspace(id)`, then `#enterApplication()`, which is what every way
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
member. `#rememberSession()` is not called; the cache is cleared and `#continue()` refills the
remote-sync snapshot, and `cache.rememberRemoteSync` is called after it so the rail's query reads
the new workspace without waiting for a refetch.

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

## The wall's picker is a radio group

Several organizations render as `RadioGroup` items, one per organization, each carrying the name
and the role, the password field under the group. Selection semantics come from the primitive
(arrow keys move the choice, one is always chosen); the row's look is settled on screen against
the human's own two organizations, which is the constraint the spec sets. One organization keeps
the current text line. Nothing else on the wall moves.

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
| `layout/startup-ports.ts` | no new port: `organization.openWorkspace` and `cache.clear` exist |
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
| `layout/component/startup-sign-in.svelte` | the radio-group picker; glyphs |
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
3. **The join screen and the wall**: corner back on every join step; the picker on the wall.
   Two tickets, since neither depends on the other.
4. **The switcher**: `switchWorkspace` in `startup.ts` with its tests, then the menu and the
   sidebar. One ticket; the method without the menu is unreachable and the menu without the
   method has nothing to call.
5. **The dialogs**: the store, the host, `invite-form.svelte` into `FormSurface`, the
   organization page's sections as lists with openers, the menu rows going live. One ticket,
   after 4, because the menu rows land in the same file the switcher reshaped.
6. **The glyph vocabulary** on whatever is left: change-password, and any button or field the
   tickets above did not already carry. Last, so it sweeps the finished screens rather than
   being redone as each moves.

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

Nothing on disk changes shape. `remote-sync.json`'s `workspace.remoteId` is already what
startup reopens; a switch writes it through `workspace_open` as today.

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
7. `startup-sign-in.svelte.test.ts` with two organizations: two `[role=radio]` rows, name and
   role in each, the password field present, no `select`.
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

# Technical Risks

- **A switch while a sync is in flight.** `startWorkspaceSyncManager` may report a result for the
  old workspace after the cache is cleared. `applySyncOutcome` re-reads the remote-sync state,
  which by then names the new workspace, and a `received` outcome runs `announceReceived`, a
  reconcile over whatever is open; harmless, but it is a reconcile the new workspace did not
  need. The outcome therefore carries the workspace the dispatch ran for, read before it ran,
  and the handler drops a result whose workspace is not the one now open; the startup test
  covers a late outcome arriving after `ready`. First sign without it: a "received rows" toast
  right after a switch. *This said a flag the handler reads. A flag cannot tell a late report
  from a fresh one once `ready` is set again, so ticket 05 put the workspace on the report.*
- **The radio group inside the wall's `form`.** The wall's `unlock()` reads `chosen`; the picker
  must bind to `organizationId` the way the select does, or the password unlocks the first
  organization regardless of the row. Criterion 7's test presses the second row and asserts
  `onSignIn` gets its id.
- **`FormSurface` under the sidebar's drawer breakpoint.** A heavy form is an edge sheet, and the
  sidebar presents as a drawer below `md`; both are `Dialog`s and stack by z-order. First sign:
  the invite sheet opening under the drawer on a narrow window. Checked by hand at 700px.
- **The walk's third step and `standingChanged`.** After the create, `#hasWorkspace` opens the
  workspace and `#enterApplication` runs; the route must `goto(THE_WAY_IN)` before or during
  that, or the application draws under `/organization/new`, which `OPENS_SIGNED_OUT` allows and
  the shell would keep. The route calls both in the order the `done` step's `next()` does today.
