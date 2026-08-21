---
aep: 2.7.0
owner: repository
date: 2026-08-22
kind: spec
status: accepted
---

# feat(app): permissions cross the boundary, and the workspace page reads as one

*Renamed 2026-08-22, at the human's direction, from
`the-interface-knows-what-a-member-may-do`. That name was written before requirement 9 was folded
in and describes only the permission half; the sync section being redrawn is not about what a
member may do. The two-part form follows
[[efforts/settings-and-the-workspace-finish-what-they-offer]], which is this repository's
precedent for an effort with a rider on it. The seven branches already cut keep the old slug —
renaming those would mean rewriting the stack, which is not worth it.*

## Problem

**The control plane has a permission mechanism that nothing can see.**
`membership.permissions` is a single `INTEGER`, `workspace/permission.ts` names six administrative
acts against bit indices, `permits` reads one out, and `ADMINISTRATION_BY_ROLE` grants a default
set per role. All of it has existed since the control plane had permissions at all. **Until #703
nothing but its own test had ever called `permits`**, and #703 is one route.

**The desktop has never been told any of it.** Checked rather than assumed, 2026-08-21:

- `wireWorkspace` in `server/server.ts` sends `id`, `name`, `ownerAccountId`, `createdAt` and
  `updatedAt`. No membership, no permissions, on any route.
- `RemoteSyncWorkspace` in `sync/store.rs` has no permissions field, and neither does
  `RemoteSyncState`.
- No TypeScript file under `apps/desktop/src/` mentions permissions at all.

So a surface on the desktop cannot ask whether this member may do a thing, and every surface that
offers an administrative act does one of two things instead. **The rename offers it to
everybody** (#706): the control plane refuses a member without the flag, and the desktop draws the
control for anybody and finds out afterwards. **Everything else is inert** — the invite row, the
create-workspace row and the workspace switcher are placeholders that explain they cannot act,
which is a different defect wearing the same clothes.

**What it costs is not visible today and arrives all at once.** An account owns one workspace and
is its only member, so *offer it to everybody* and *offer it to the owner* are the same behaviour.
The day a route adds a second member, every one of those surfaces is wrong simultaneously, and
each one gets fixed separately by whoever reaches it first, in whatever way they reach for.

**A refusal that only ever arrives from the server is a control that looked available and then
said no.** That is the shape #706 ships with, and it is acceptable for one control on a
one-member workspace. It is not a pattern to repeat six times.

*This is requirement 14 of [[efforts/a-workspace-follows-its-user]] beginning: "organization
workspaces — several members on one workspace, and permissions per workspace — are not built, and
nothing built here forecloses them", confirmed by the human on 2026-08-19 as the next body of work
rather than as a hypothetical. It is the permissions half of it. The members half is not here.*

## Goal

Every surface that offers an administrative act knows whether this member may take it, from one
answer that crossed the boundary once, named the same way on both sides. A control the member may
not use is not drawn as one they may. And `/workspace`, which is the page where that first
happens, reads as one page rather than as two pages joined at a separator.

## Scope

- **The package the vocabulary moves into**, and the control plane moving onto it rather than
  keeping a copy beside it.
- **What the control plane says about the asking account's membership**, and on which answers.
- **How that crosses to the desktop**: the wire, the Rust store, `RemoteSyncState`, the query the
  surfaces already read.
- **How a surface asks**, on the TypeScript side: the vocabulary, and the check.
- **The component that gates a subtree** on named permissions.
- **The desktop procedure that requires one**, beside `procedure.member`.
- **The surfaces that already offer an administrative act**, adopting it.
- **The sync section on `/workspace`**, redrawn in the language the rest of that page is drawn in.
- The translations any refusal needs, in both locales.

## Requirements

1. **The control plane says what the asking account may do in the workspace it answered with.**
   Every identifying answer already carries the workspace; this adds what the asking account's
   membership permits in it. `/account/sign-in` and `/session/refresh` are those answers.

   **It is the asking account's own row and nobody else's.** This is not a members listing and does
   not become one: the route already reads that row to authorize, and what changes is that the
   answer says what it found.

2. **The desktop carries it, and it is not a credential.** It crosses the Tauri boundary with the
   rest of `RemoteSyncState`, the way the session's moments already do
   ([[rules/credentials]], under *Client boundary*). A permission is a fact about what an account
   may ask for, not a thing that lets anybody ask.

3. **There is one vocabulary and it lives in one package.** *Directed by the human on 2026-08-21.*
   The flag table, the mask arithmetic and the check move to a workspace package that both
   applications depend on, the way `@rentable/workspace-migrations` is already depended on by both.
   A surface names an act — the same name the control plane names — and never a number, a bit
   index or a role.

   **The wire carries the number, and the package is what makes that safe.** Both ends read it
   through the same `permits`, so there is no second copy of the mapping to drift, and Rust carries
   it between them without interpreting it at all. A list of names was the alternative, and it
   existed only to avoid the second copy the package removes.

   **A role is not a permission and a surface never asks about one.** `ADMINISTRATION_BY_ROLE` is
   how a membership row is *granted* its flags; what a member may do is the flags themselves, which
   is why the column is stored rather than computed from the role on read — and requirement 8 is
   the first time that distinction has anything riding on it.

4. **A component gates a subtree on named permissions**, and renders it only where the member holds
   all of them. **Otherwise it does one of two things and the caller says which**: the subtree is
   absent, or it is present and unavailable. *Directed by the human on 2026-08-21: some actions
   should not appear, and some are best shown as unavailable.*

   **The caller chooses on what absence would cost a reader.** A control whose absence leaves a
   surface that still reads as complete is absent. A control whose absence would leave a row
   describing an act that is not there, or a surface that reads as broken rather than as
   restricted, stays and is unavailable. **An unavailable control says why**, or it is a dead
   control with better manners, which is the defect the inert placeholders already have.

5. **A desktop procedure can require a permission**, beside `procedure.member`. A surface that
   hides a control is a courtesy; the procedure behind it is what makes hiding it honest.

6. **The control plane stays the authority and nothing here weakens it.** Every check added on this
   side is a second opinion offered earlier, never the one that decides. A client is a thing a
   person can edit.

7. **The surfaces that already offer an administrative act adopt it.** The rename on `/workspace`
   is the one that exists. The invite row, the create-workspace row and the workspace switcher are
   inert placeholders and stay inert; what changes is that they stop being the reason there is no
   mechanism.

8. **Renaming a workspace belongs to the owner, and `administrator` loses the flag.** *Decided by
   the human on 2026-08-21: "rename is for owner only."*
   `ADMINISTRATION_BY_ROLE.administrator` carries `renameWorkspace` today, which has been harmless
   only because no workspace has ever had a second member. The default drops it.

   **The column stays the truth and this changes only the default.** A workspace that wants an
   administrator who may rename it grants the flag on the row, which is the distinction requirement
   3 keeps: the role is what a membership is created with, not what it may do.

9. **The sync section on `/workspace` is redrawn in the page's own language.** *Directed by the
   human on 2026-08-21, into this effort rather than into a ticket of its own.*

   **It is here because this effort is what puts a reader in front of that page.** Requirement 7
   brings the gate onto `/workspace`, and requirement 4 decides there what a control the member may
   not use looks like. The sync section is the loudest thing on that page and is drawn in a
   different language from the one that gate will be drawn in, so settling the second without the
   first leaves the page holding two.

   **It is the only section on the page that did not come from the page.** Identity, members and
   transfer are each a `Field.Field` row, and so is every section of the settings page this one
   left — locale, updates, ending-soon, diagnostics. Sync is a `rounded-2xl border bg-muted` inset
   panel that splits into two columns at `lg`. That is the shape it had as a group on the settings
   page, carried across unchanged when the workspace got a page of its own.

   **It answers three questions the page has already answered.** It draws an avatar and the
   workspace's name two sections below `identity.svelte`, which draws both. It draws the signed-in
   account's email one section below `members.svelte`, which draws that account with its picture,
   its display name and its role. And its avatar is the account's initials where there is an account
   and the workspace's where there is not, so one circle stands for two different things depending
   on state.

   **It says its own sentence three times and then contradicts it.** `syncAutomationTitle` and the
   opening clause of `syncAutomationDescription` are the same sentence; `syncWorkspaceDescription`
   is a third telling of it in the right-hand column. The description ends *there is nothing to do
   here*, directly above the button that does the thing.

   **The badge reads `synced` for a machine that has never reached anything.** It decides from
   `workspace.lastError`, the account's `lastError` and the account's `status`, and falls through to
   *synced* on everything else. `controlPlaneReady` and `session` sit on the same state object and
   it reads neither, so a build given no control plane and a machine holding no session both report
   as synced.

   **What the section is for is one status and one control** — whether this machine is reaching the
   workspace, and a way to make it check now. It keeps that, in the page's row language, and stops
   restating the page around it.

   **Its strings move under `workspace.*`.** Eight `settings.sync*` keys are read by this component
   and by nothing else, on a page whose every other string is `workspace.*` bar one:
   `settings.transferDescription`, which is the same leftover one section down and moves with them.
   Half a page's strings filed under the name of the page they used to be on is how this section got
   here.

## Acceptance criteria

1. An identifying answer from the control plane carries what the asking account may do in the
   workspace it names, and a control-plane test drives it against membership rows built with
   different flag sets. *(R1)*
1a. The answer names the asking account's permissions and nobody else's, and no route added here
    returns another member's row. *(R1)*
2. On a signed-in machine, the desktop's remote-sync state carries the same set the control plane
   sent, and a Rust test covers a state written from an answer that carried them and one that did
   not. *(R2)*
2a. No session token and no workspace token appears anywhere this adds, and the diagnostics file
    gains no permission set and no workspace name. *(R2)*
3. A `node:test` drives the check: a member holding a named act passes, one holding none of it is
   refused, and one holding some of a set is refused for the set. *(R3, R4)*
3a. No surface under `apps/desktop/src/` reads a bit index, a mask, or a role in order to decide
    what to draw. A search for one finds nothing. The arithmetic exists, in the package, and is
    reached through a named act. *(R3)*
3b. The flag table is defined once. A search across both applications finds no second name-to-bit
    mapping, and the control plane's own reads go through the package rather than past it. *(R3)*
4. The gating component renders its subtree for a member who may act. For one who may not, it is
   absent where the caller asked for absent and present-and-unavailable where the caller asked for
   that, and the unavailable case carries its reason. Driven by a test rather than by looking.
   *(R4)*
5. A procedure declared as requiring an act refuses a caller whose membership does not carry it,
   with the refusal the rest of the API already uses, and a test drives both sides. *(R5)*
6. The control plane refuses a request the client would have hidden, when it is made anyway, and a
   test makes it anyway. *(R6)*
7. The rename control on `/workspace` is drawn for a member who may rename and not for one who may
   not, and the procedure behind it refuses the second either way. *(R7, R5)*
8. `ADMINISTRATION_BY_ROLE.administrator` does not carry `renameWorkspace` and `owner` does, with
   the permission test naming both rather than asserting a total. A control-plane test drives an
   administrator's rename being refused as `not_permitted`, and the same membership row with the
   flag granted directly being allowed. *(R8)*
9. The sync section is drawn in the same row language as the sections above it, and the bordered
   inset panel and its two-column split are gone. *(R9)*
9a. It draws neither the workspace's name, nor an avatar, nor the signed-in account's email. A
    search of the component finds no read of `workspace.name`, and no read of the account past what
    its status needs. *(R9)*
9b. Its status reports what the state says: a build with no control plane, and a machine holding no
    session, do not read as *synced*. Driven by a test over those states rather than by looking.
    *(R9)*
9c. No `settings.sync*` key is left in either locale, and `settings.transferDescription` has moved
    with them. *(R9)*

10. Both locales, right to left checked as each surface is built, from 640x480 upward with no
    horizontal scrollbar. Carried as a line on every ticket that draws anything rather than as a
    ticket of its own.

## Constraints

- **The storage does not change: one `INTEGER` column, up to 53 flags.** *Directed by the human on
  2026-08-21, after being shown the alternative.* Decision 04 chose one column over four
  alternatives, `maskOf` uses addition rather than `|` because JavaScript's bitwise operators
  coerce to signed 32-bit and silently truncate above bit 30, and `HIGHEST_USABLE_BIT = 52` is
  guarded by a test that fails at the 54th flag. Six flags are defined, so the ceiling is not near.

  *The alternative was named and rejected: segments — an array of ints, `[segment, flag]` pairs, 32
  bits each, no ceiling — which is how `support-app` does it and is what the human pointed at. It
  costs a migration on the column, a rewrite of `maskOf` and `permits`, and reopens decision 04, and
  it buys headroom past 53 flags that this repository has no use for. **Not reopened without a
  47th flag.***

- **The vocabulary is a workspace package, not a file copied into each application.** *Directed by
  the human on 2026-08-21.* `@rentable/workspace-migrations` is the precedent and the shape to
  follow: `private`, unversioned, depended on as `workspace:*` by both applications. It is also the
  precedent for the awkward part — that package is deliberately plain JavaScript with a hand-written
  `.d.ts`, because the control plane resolves it from compiled output in `build/` and the desktop
  resolves it from source under `tsx`, and a package with a build step of its own would have to
  satisfy both.

  **That premise is wrong, and it was found by running it rather than by reading it.** Nothing
  consumes `apps/control-plane/build/` — its own README says the build exists so a task proves the
  package compiles to something runnable, and `pnpm start` runs the service from source under
  `tsx`. So *the control plane resolves it from compiled output* describes an artifact with no
  reader, and the shape it forced on `workspace-migrations` was bought for a consumer that does not
  exist. **The permission package is TypeScript source and has no build step**, decided by the human
  on 2026-08-21; *Technical approach* has what was measured, and the condition that would reopen it.

- **The vocabulary stays administrative acts, and gains no per-record permissions.** Decision 05
  settled that membership grants full access to a workspace's data: a disconnected client writes to
  a replica, so anything finer would be a promise enforced by a server it is not talking to. There
  are no view, create, update or delete flags to have, and a request for them is a request to
  reopen decision 05.

- **Every `invoke` goes through the Tauri facade**, and no component or router calls one directly
  ([[rules/api-layer]], under *Where things live*).

- **Nothing here adds an application-own screen.** A member who may not act meets a control that is
  absent or a refusal on a surface that already exists.

- **A refusal names its reason in the control plane's own vocabulary**, as `not_permitted` already
  does, and what a reader is told is the desktop's to word.

- **A permission set is not a credential and is not filed like one.** It crosses the boundary with
  the state; the session token stays in Rust.

## Out of scope

- **Inviting a member, removing one, and changing a role.** Three flags with the same amount of
  nothing behind them, and each needs a control-plane route this does not add. They are requirement
  14's remaining half. **This effort is what they will be gated by, not what builds them.**
- **A control-plane route that lists a workspace's members.** Requirement 1 answers with the asking
  account's own row, which the route already reads to authorize. A listing is a different route
  with a different question and it is [[efforts/the-shell-says-whose-workspace-this-is]]'s
  exclusion, not reopened here.
- **Several workspaces per account, and switching between them.** Nothing to switch to.
- **Editing a role, or editing permissions from the interface.** This effort reads what a member
  may do. Granting it is the invite and role work above.
- **Per-record permissions.** Decision 05, above.
- **Organizations.** The owner column stays an account.
- **Retrofitting every existing surface.** Requirement 7 covers the surfaces that already offer an
  administrative act, which today is one. A surface that offers none gains no gate.

## Assumptions

- **The asking account has exactly one membership relevant to an answer**, because an account owns
  one workspace and every identifying answer names that one. The shape requirement 1 chooses has to
  survive an account with several, which requirement 14 brings, but it does not have to carry
  several today.
- **Nothing on the desktop currently branches on a role.** Checked as far as
  `workspace/component/members.svelte`, which draws `workspace.roleOwner` as a label; not proven
  exhaustively.

## Open questions

- ~~**How the permission package is built and consumed.**~~ Settled 2026-08-21 by the human, on the
  evidence in *Technical approach*: TypeScript source, consumed directly by both. The premise the
  Constraint above rests on turned out to be wrong, and it is corrected where it stands rather than
  left for a reader to trip over.
- ~~**Where the answer sits in `RemoteSyncState`.**~~ Settled 2026-08-21 by the human: on the
  workspace. *Data model* has the shape, and what the two alternatives would have cost.
- ~~**What the sync section keeps, and in what shape.**~~ Settled 2026-08-21 by the human: a row
  with a status badge, the automation callout gone and its sentence become the row's own
  description. *Components* has the ladder the badge reads from.
- **Where an unavailable control's reason is worded.** Requirement 4 has it say why, and it says so
  before any request is made, so there is no control-plane refusal to word. Whether that sentence
  is per-act, per-surface, or one sentence about not having permission is a question the first two
  callers will answer better than this file can. **Still open, deliberately**: this effort ships one
  caller, and one caller cannot settle it.
- **Whether a gate should tell *not yet* apart from *not permitted*.** *Raised 2026-08-22 while
  building #716; not settled, and no ticket is cut for it, because deciding it is decision work
  and only what follows the decision produces a branch.*

  `permissions` collapses three states into one `0`: the answer said nothing, the store predates
  the field, and this member administers nothing. *Data model* and *Integration* chose that
  deliberately, and it is right for the first two in isolation — a client that has not been told
  what a member may do should not be drawing the controls.

  **What was not weighed is what the collapse costs once a caller picks `absent`.** The rename on
  `/workspace` does, for good reasons of its own, so an owner whose machine has not reached the
  control plane since launch watches the control disappear with no explanation. That is nearer
  requirement 4's own *reads as broken rather than as restricted* than to *restricted* — and it is
  requirement 4's rule being applied to a state requirement 4 did not have in mind.

  Two readings, and the choice is not obvious. **It is already honest**: renaming needs the control
  plane, so a machine that cannot reach one cannot rename, and hiding the control says so. **Or it
  is a third state and should say so**: *not yet* is not *not permitted*, and a gate that cannot
  tell them apart cannot draw the difference. The second means an `Option`-shaped answer on the
  desktop side rather than a number that is zero when absent, which reaches `RemoteSyncWorkspace`,
  `Identity` and the gate — so it is a change to this spec rather than a hardening of what it
  built.

## Risks

- **A client-side check reads as enforcement.** The moment a control disappears for the right
  reason, it is tempting to stop refusing on the server, and the refusal is the only half that
  cannot be edited by the person it refuses. Requirement 6 and its criterion exist to keep the
  server's half tested independently of the client's.
- **The mechanism is being built for members who do not exist yet.** Every criterion here is
  checkable today only by writing a membership row by hand, because no route makes a second member.
  A mechanism whose only exercise is its own tests is the shape #703 already flagged: nothing in
  production had ever consulted a permission flag, so nothing had ever had the chance to surface its
  defects.
- **The package is one copy only for as long as nobody reaches past it.** Requirement 3 removes the
  drift by putting the table in one place; what would put it back is a convenience — a literal bit
  in a test, a mask inlined where importing felt heavy, a Rust constant that reads the number
  instead of carrying it. Nothing fails when a second copy appears and disagrees: a renamed flag
  reads as a permission nobody holds. Criterion 3b is the check, and it is worth keeping cheap
  enough to run again later.
- **Rust is a third language on the path and must stay uninterested.** It carries the number
  between the wire and `RemoteSyncState`, and the moment it decides anything from it, the
  vocabulary has a home the package cannot reach.

## Architecture

**One package, two applications, and a language in the middle that never opens it.**

```
packages/workspace-permission/          the vocabulary: names, bits, maskOf, permits,
        index.ts                        EVERY_ADMINISTRATION, ADMINISTRATION_BY_ROLE,
                                        HIGHEST_USABLE_BIT
              |                                        |
   workspace:* |                                       | workspace:*
              v                                        v
  apps/control-plane                            apps/desktop (TypeScript)
    workspace/workspace.ts   permits() on every act       api/context.ts   Identity.permissions
    server/server.ts         the number onto the wire     api/trpc.ts      procedure.permitted
                                                          workspace/component/permitted.svelte
              |                                                        ^
              |  JSON: workspace.permissions, a number                 |  RemoteSyncState
              v                                                        |
                        apps/desktop/tauri (Rust)  -- carries, never reads
                        control.rs  IdentifiedWorkspace.permissions
                        store.rs    LearnedWorkspace / RemoteSyncWorkspace.permissions
```

**The number crosses twice and is interpreted once at each end.** The control plane reads it out of
the membership row with `permits`; the desktop reads it out of `RemoteSyncState` with the same
`permits`, from the same file. Rust holds an `i64` between them and has no vocabulary for it, which
is requirement 3's *Rust must stay uninterested* made structural rather than remembered.

**Nothing new crosses the credential boundary.** The permission set is a fact about what an account
may ask for, and it travels with `RemoteSyncState` exactly as the session's three moments already
do ([[rules/credentials]], under *Client boundary*). The session token stays in Rust and is not
touched here.

## Components

**`packages/workspace-permission/` — new.** `index.ts` is the whole package. It is
`apps/control-plane/src/workspace/permission.ts` moved, unchanged in content: `ADMINISTRATION`,
`Administration`, `HIGHEST_USABLE_BIT`, `EVERY_ADMINISTRATION`, `maskOf`, `permits`,
`ADMINISTRATION_BY_ROLE` — with one edit, requirement 8's removal of `renameWorkspace` from
`ADMINISTRATION_BY_ROLE.administrator`.

Its `Role` import comes from the control plane's schema today, and that import cannot come with it:
the package must not depend on either application. **`Role` is redeclared in the package as its own
union**, and the control plane's schema type is held to it by a type-level assertion in the control
plane, so a role added to the database and not to the package fails a typecheck rather than a test.

`permission.test.ts` moves with it, to `packages/workspace-permission/tests/permission.test.ts`,
which is [[rules/testing]]'s layout. The comment on the flag table that points at
`./permission.test.mjs` is corrected in the move, which closes #708 — whose own path is also wrong:
the file is at `apps/control-plane/src/workspace/tests/permission.test.ts`, not
`apps/control-plane/tests/`.

**`apps/desktop/src/lib/workspace/component/permitted.svelte` — new.** Requirement 4's gate. It
takes the acts, reads the workspace's permissions off the remote-sync query, and renders one of
three things.

```svelte
<Permitted acts={['renameWorkspace']} otherwise="absent">
	<RenameButton />
</Permitted>

<Permitted acts={['inviteMember']} otherwise="unavailable" reason={$LL.workspace.notPermitted()}>
	<InviteButton />
	{#snippet unavailable()}<InviteButton aria-disabled="true" />{/snippet}
</Permitted>
```

*Corrected 2026-08-21 while building #716: the permitted subtree was written as an explicit
`{#snippet children()}`, which this repository lints as `svelte/no-useless-children-snippet`. It is
default content. `unavailable` stays a named snippet, having no other spelling.*

**`otherwise` is required and has no default**, which is requirement 4's *the caller says which*
turned into something the compiler asks for. A default would make one branch the one you get by not
thinking, and the spec's rule for choosing is about what absence costs a reader rather than about
which branch is safer.

**`reason` is required where `otherwise` is `unavailable`**, through a discriminated prop type
rather than a runtime check, so requirement 4's *an unavailable control says why* cannot be skipped
by forgetting it.

**It lives with the workspace rather than in `design/block/`.** [[rules/frontend]] under
*Components* puts app-level composites — shared by concepts — in `design/block/`, and domain UI with
its domain. Every act in the vocabulary is an administrative act on a workspace, and today every
caller is on `/workspace`. **The condition for moving it is a caller outside the workspace domain**,
and it is one file move when that arrives.

**`apps/desktop/src/lib/workspace/component/sync.svelte` — rewritten.** Requirement 9. One
`Field.Field orientation="responsive"`, matching `identity.svelte`, `members.svelte` and
`transfer.svelte`. `Field.Content` holds a `Field.Description` and a `Badge`; the button sits in the
row's control slot. The inset panel, the two-column split at `lg`, the avatar, `getAvatarLabel`,
`getInitials`, the workspace name and the account email all go.

The badge reads a ladder rather than a fallthrough, and it is written out here because the
fallthrough is the defect:

| When | Badge says | Tone |
| --- | --- | --- |
| `!controlPlaneReady` | syncs nowhere | `secondary` |
| `workspace.lastError`, the account's `lastError`, or the only account row is `needsReconnect` | needs reconnect | `error` |
| `!googleSignInReady` | cannot sign in | `secondary` |
| no signed-in account, or `session === null` | not signed in | `secondary` |
| `account.status === 'pending'` | awaiting authorization | `secondary` |
| otherwise | synced | `default` |

**The first two rows are why this is ordered rather than a set of independent checks.** A build with
no control plane and a workspace carrying a stale `lastError` should say the first: there is nothing
to reconnect to. The code today reaches neither row and answers *synced*.

*Two corrections, both made while building #711 and both the repository's rather than this file's.*
**`cannotSignIn` was `warning` here and is `secondary`**: the tone vocabulary has `warning` and the
`Badge` primitive does not, and adding a variant to a shared primitive is a change to
`design/primitive/` that belongs to whoever needs it. **And the `needsReconnect` row named
`account.status`, which cannot be read that way**: `signedInAccount` skips a row whose status is
`needsReconnect`, so asking the signed-in account about that status always answers `undefined`. The
row has to be found on `accounts`. The section this replaces had the same shape and so reached
`needsReconnect` only from a `lastError`, which is a second defect in it that criterion 9b did not
know to ask for.

**`apps/desktop/src/lib/i18n/{en,ar}/index.ts`.** The eight `settings.sync*` keys and
`settings.transferDescription` move under `workspace.*`, and the ladder's four new labels are added.
`i18n-types.ts` and `i18n-svelte.ts` are generated — `pnpm i18n` after the locale files change
([[rules/frontend]], under *i18n*), never edited by hand.

## Interfaces

**The wire.** `wireWorkspace` in `apps/control-plane/src/server/server.ts` gains one member.

```
{ id, name, ownerAccountId, permissions, createdAt, updatedAt }
```

`wireWorkspace` takes a `Workspace` record and has no membership to read, so it takes the number as
a second argument rather than reaching for one: `wireWorkspace(record, permissions)`. Both call
sites already hold the account that is asking.

- **`identify`** (`POST /account/sign-in` and `POST /session/refresh`, one handler) calls
  `membershipOf(plane.db, workspace.id, account.id)` after `workspaceForAccount`. That function is
  already extracted and already reads exactly this row.
- **`rename`** (`POST /workspace/:id/name`) already has the read, inside
  `workspaceThisAccountMay`, which returns the `Workspace` and throws away the `Membership` it read
  to get there. It returns both instead, so the rename's answer carries the permissions without a
  second query.

**A missing membership row answers `0` and does not refuse.** `identify` is the sign-in route, and
throwing there would lock an account out of the application over a row that `createWorkspace`'s
transaction is what guarantees. Zero is the value `ADMINISTRATION_BY_ROLE.member` already carries
and it means the same thing: a member who administers nothing.

**The desktop procedure.** `apps/desktop/src/lib/api/trpc.ts` gains a middleware factory, and
`procedure` gains a builder beside `member` and `public`.

```ts
requirePermission: (...acts: Administration[]) => t.middleware(...)

procedure.permitted = (...acts: Administration[]) =>
	t.procedure.use(middleware.log).use(middleware.requireIdentity).use(requirePermission(...acts));
```

**It composes on `member` rather than replacing it**, so a permitted procedure is a member procedure
that asks one more question, and the narrowing `requireIdentity` does downstream survives.

The refusal is `FORBIDDEN`. [[rules/api-layer]] under *Errors* makes anything that is not
`BAD_REQUEST` surface as a generic failure, and that is the right outcome: a caller who reached a
procedure the interface would not have drawn for them has gone around the interface, and there is no
sentence worth writing for that. It matches `requireIdentity`'s `UNAUTHORIZED`, one middleware up.

**`Identity` gains `permissions: number`**, in `apps/desktop/src/lib/api/context.ts`.
`actingIdentity` already calls `host.remoteSync.getState()` and already picks the account out of the
answer; the workspace's permissions are on the same object, from the same call. **No second read,
and no new capability in the context** — [[rules/api-layer]] under *Where things live* keeps
business configuration out of it, and this is a fact about who is acting, which is what `Identity`
is for.

## Data model

**No migration, on either database.** `membership.permissions` is unchanged: one `INTEGER`, the
Constraint's 53 flags, the same six defined. Requirement 8 changes a default applied when a row is
written, not a row that exists — and no row exists with `administrator` on it, because no route
creates one.

**Rust carries `i64`.** `apps/desktop/tauri/src/sync/control.rs`:

```rust
pub(crate) struct IdentifiedWorkspace {
    pub id: String,
    pub name: Option<String>,
    /// what the asking account may do in it. `None` where the answer did not say.
    pub permissions: Option<i64>,
}
```

`apps/desktop/tauri/src/sync/store.rs`: `LearnedWorkspace` gains `permissions: Option<i64>` beside
`name`, which is the field it is modelled on — both are *what an identifying answer carried and a
mint did not*. `RemoteSyncWorkspace` gains `permissions: i64`, which `#[serde(default)]` makes `0`
on a store written before this change.

**`i64` and not `u64`, and the reason is the wire rather than the values.** JSON has one number
type; `serde_json` reads a JSON number into `i64` and writes one back, and every value below 2^53 is
exactly representable as the `f64` JavaScript will hold it in. The column's own ceiling is
`HIGHEST_USABLE_BIT = 52`, so the whole range sits inside that, and `u64` would buy nothing while
adding a conversion at the boundary.

**On the workspace, not beside the account.** *Decided by the human on 2026-08-21.* It matches the
wire, where the permissions arrive inside the workspace object, and it slots beside
`LearnedWorkspace.name`, which already exists as the carrier for what a call learned about the
workspace. The alternatives and what they cost: beside the account says whose the permissions are
but cannot say which workspace they are about, which is the direction requirement 14 goes; a
`RemoteSyncMembership` struct is honest to what the thing is and costs a third serde shape for a
relation with exactly one row today.

**`RemoteSyncState` on the TypeScript side follows the Rust struct**, in
`apps/desktop/src/lib/platform/host.ts`: `RemoteSyncWorkspace.permissions: number`.

## Technical approach

### How the package is built, and what was measured

**TypeScript source, consumed directly by both applications.** *Decided by the human on 2026-08-21.*

```json
"exports": { ".": { "types": "./index.ts", "default": "./index.ts" } }
```

The three candidates were run against this repository's real configurations on 2026-08-21 rather
than reasoned about. A throwaway package holding the flag table was resolved from
`apps/control-plane/node_modules/` and from `apps/desktop/node_modules/`, imported from a source
file in each, and every command each application actually runs was executed against it. Both probes
were removed and the tree checked clean afterwards.

| | TS source | TS with a build step | JS + hand-written `.d.ts` |
| --- | --- | --- | --- |
| control-plane `pnpm check` | pass | pass, once built | pass |
| control-plane `pnpm build` | pass, emits, no `rootDir` error | pass, once built | pass |
| `node apps/control-plane/build/*.js` | **fails** | runs | runs |
| control-plane tests, `node --import tsx --test` | pass | pass, once built | pass |
| desktop tests, `node --import tsx --test` | pass | pass, once built | pass |
| desktop `pnpm check`, `svelte-check` | pass, 9640 files, 0 errors | pass, once built | pass |
| desktop `pnpm build:web`, Vite | pass, the arithmetic is in the bundle | pass, once built | pass |
| the flag names authored once | yes | yes | **no** |
| build ordering added to turbo or pnpm | none | **a `build` task, `dependsOn` on `test`** | none |

The one failure is `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`: Node refuses to strip types from a
file under `node_modules`, so a compiled `build/main.js` importing a TypeScript package cannot be
executed. **`tsc` itself is unbothered** — it typechecks the package's source, emits only the
application's own files, and does not apply `rootDir` to what it resolved from `node_modules`, which
is the failure this probe was built to look for and did not find.

**That failure costs nothing today, and the reason is written down rather than assumed.**
`apps/control-plane/README.md` says `pnpm build` exists so that a task proves the package compiles
to something runnable, and that nothing consumes the output; `pnpm start` runs the service from
source under `tsx`. The property being given up belongs to an artifact with no reader.

**Removal condition, and it is a state rather than an intention: the day anything executes
`apps/control-plane/build/`.** At that point the package gains a `build` script emitting `.js` and
`.d.ts`, and `exports` points at them. **Nothing else changes, because the source is already
TypeScript** — which is the asymmetry that decided this. TypeScript source converts into the
build-step option later without a rewrite; plain JavaScript with a hand-written `.d.ts` does not.

**What the third option would have cost is a second list of the flag names**, in `index.d.ts`, to
recover `Administration` and the `as const` narrowing that `keyof typeof` gives for free. Not a
second name-to-bit mapping, so criterion 3b survives it — but a second place a flag has to be added
and renamed, inside the package the effort exists to make the only place. Risks already names that
failure: a renamed flag reads as a permission nobody holds.

### The order the work goes in

1. **The package, and the control plane onto it.** Move `permission.ts` and its test out, redeclare
   `Role`, add the type-level assertion, repoint the control plane's importers, drop
   `renameWorkspace` from `ADMINISTRATION_BY_ROLE.administrator`. Criteria 3, 3b, 8. **Nothing else
   starts before this**, and it is the only ordering constraint in the effort.
2. **The wire.** `wireWorkspace` takes the number, `identify` reads the membership, the rename hands
   back what it already read. Criteria 1, 1a.
3. **Rust.** `IdentifiedWorkspace`, `LearnedWorkspace`, `RemoteSyncWorkspace`, and the parse.
   Criteria 2, 2a.
4. **The desktop's vocabulary.** `host.ts`'s type, `Identity.permissions`, `requirePermission`,
   `procedure.permitted`. Criteria 5, 6.
5. **The gate.** `permitted.svelte`. Criterion 4.
6. **The rename adopts it**, on `/workspace`, and `remoteSync.rename` becomes
   `procedure.permitted('renameWorkspace')`. Criterion 7.
7. **The sync section**, and the strings. Criteria 9, 9a, 9b, 9c. **Dependent on none of 2 through
   6**, which is what makes requirement 9 a rider on this effort rather than something wedged into
   it. It touches no file the other six touch.

## Integration

**The control plane and the desktop ship separately, so the wire has to survive both orders.** A
desktop built before this change reads an answer carrying `permissions` and ignores it, because
`WireWorkspace` deserializes with `#[serde(default)]` and drops what it does not declare — the
mechanism `control.rs:1289` already records having been bitten by. A desktop built after this change
reading an older control plane's answer gets `None`, which becomes `0`, which draws every gated
control as absent or unavailable. **That is the safe direction and the honest one**: a client that
has not been told what a member may do should not be drawing the controls.

**The reverse is what requirement 6 is for.** A desktop that draws a control it should not draw is
refused by the control plane, which never stopped checking.

## Testing strategy

Every criterion against where it is checked. [[rules/testing]] fixes the layout on both sides.

| Criterion | Where | What drives it |
| --- | --- | --- |
| 1, 1a | `apps/control-plane/src/server/tests/server.test.ts` | sign-in and refresh against membership rows written with different masks; the answer names one account's permissions and the route list gains nothing |
| 2 | `apps/desktop/tauri/src/sync/store.rs`, `mod tests` at its foot | a state written from an answer that carried permissions, and one that did not, the second landing on `0` |
| 2a | `apps/desktop/tauri/src/sync/control.rs`, `diagnostics/record.rs` | no token in anything added; no diagnostic event carries a permission set or a workspace name |
| 3, 3a, 3b | `packages/workspace-permission/tests/permission.test.ts`, plus a search | a member holding an act, one holding none, one holding some of a set; the 54th-flag guard moves unchanged; the searches for a second mapping and for a bit index under `apps/desktop/src/` are run and their output quoted |
| 4 | `apps/desktop/src/lib/workspace/component/tests/permitted.test.ts` | the three branches, and that the unavailable branch carries its reason |
| 5, 6 | `apps/desktop/src/lib/sync/tests/router.test.ts` and the control-plane server test | the procedure refuses a caller without the act; the control plane refuses the same request made anyway |
| 7 | the router test, and the in-application pass | the control is drawn for a member who may and not for one who may not |
| 8 | `packages/workspace-permission/tests/permission.test.ts` and the control-plane workspace test | the two roles named rather than a total asserted; an administrator's rename refused as `not_permitted`, and the same row with the flag granted directly allowed |
| 9, 9a, 9c | `apps/desktop/src/lib/workspace/component/tests/sync.test.ts`, plus a search | the row shape; no read of `workspace.name`; no `settings.sync*` key left in either locale |
| 9b | the same test | the ladder, driven over a state with no control plane and a state with no session |
| 10 | the in-application pass, carried per ticket | both locales, RTL, 640x480 upward |

**Criterion 3b's search is a command whose output is quoted, not a claim.** It is the check Risks
says is worth keeping cheap enough to run again later, and a search reported as *nothing found*
without the command is not that check.

**The `Host` fixture is shared, never written out.** `platform/tests/testing.ts` builds a whole
`Host` and the remote-sync payloads it speaks in; a `RemoteSyncState` hand-written with a
permissions field is the shape [[rules/testing]] names as most of what #561 turned out to be. The
fixture gains the field once.

## Technical risks

**The type-level assertion on `Role` is the seam this plan adds, and the one most likely to be
skipped.** The package cannot import the control plane's schema, so it declares its own `Role`, and
two declarations of one union is exactly the drift requirement 3 exists to remove — in the one place
the package cannot reach. The assertion is what makes a role added to the database and not to the
package a typecheck failure. **Without it this is a second copy with nothing watching it**, and it
belongs on the ticket rather than being left to review.

**The build the probe broke is a build nobody runs, which is also why nobody would notice.**
`turbo.json` defines `build:web`, `test` and `test:rust`; the control plane's `build` is reachable
only through the root's `pnpm build`, and the README's claim that `turbo run build` proves anything
is stale, since turbo refuses a task it has no definition for. So the property being given up is one
no gate is checking, and the removal condition above is the only thing that will surface it.

**A ladder is a fallthrough with more branches, and its last row is still `otherwise`.** The badge is
better than what it replaces because it consults `controlPlaneReady` and `session`. It is not proof
against the next field added to `RemoteSyncState` and not read here. The test drives the two states
that are wrong today; it does not pin the shape against a state nobody has invented yet.

**Nothing in production will consult a permission until an invite route exists.** Risks says it
already. The plan does not solve it, and the mitigation is that the mechanism is exercised by
membership rows written by hand in tests rather than left to be exercised first by a user.
