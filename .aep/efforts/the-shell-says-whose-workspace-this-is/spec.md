---
aep: 2.7.0
owner: repository
date: 2026-08-20
kind: spec
status: accepted
---

# feat(shell): the account is in the sidebar, and settings only configures

## Problem

Since #571 this application is an account before it is anything else: signing in is what mints
the token the workspace replicates with, and signing up is what brings the workspace into being.
The chrome never says so. **The sidebar's header is a static mark and the product's name, its
footer is one link called settings, and between them nothing names who is signed in or what
workspace is open.** A person signed in on the wrong Google account, which is one mis-click on a
consent screen, finds out by opening a settings page and reading the third row of the first
group. The two rows of the shell that are on screen at every moment are spent on a logo and a
link to a page.

**Two of settings' five groups are not settings.** The account group answers *who am I* and
offers the way out; the workspace group leads with a 12-unit avatar panel carrying the workspace
name, a status badge, and the account's email address again. Neither configures anything. The
email is on that page twice, once per group, which is the thing
[[efforts/surfaces-the-overhaul-left-behind]] closed on: *no figure is stated twice on the page*.
It came back because the account group was added after that criterion was checked.

**The two groups also make settings the only door.** Signing out lives there, the workspace's
name lives there, syncing now lives there, so the page has become the place identity is handled
as well as the place preferences are set, and it reads as a drawer rather than a screen.

**The sign-in card was rewired on 2026-08-20 and not designed.** #628 gave it the three
situations, the notice box and the mark above the title, which is what it needed to stop lying
about what had failed. What it presents is the shared surface's defaults: a 20-unit icon, a
title, a callout, and a full-width button, at the same weight as a settings load failure. It is
the first screen anybody sees and the only screen some people ever see, and it does not look
like the front of a product.

## Goal

The shell says whose workspace is open and who has it open, and each of those two facts offers
what belongs to it from the control that states it. Settings holds what configures the
application and nothing else. The sign-in card reads as the front door rather than as a state the
application got stuck in.

## Scope

- The sidebar header: the mark row becomes a control naming the open workspace, and the menu it
  opens.
- The sidebar footer: the settings link becomes a control naming the signed-in person, and the
  menu it opens.
- The settings page: which groups it holds, in what order, and how the surviving workspace
  controls present.
- The sign-in card's presentation, and the one change to the shared standalone surface that its
  brand placement needs.
- **The account's picture, fetched once at sign-in and kept locally**, which is Rust-side work
  this effort would not otherwise have. See *Scope added during refinement*.
- The translations all of it needs, in both locales.

## Requirements

1. **The shell names the open workspace at the top and the signed-in person at the bottom**, as
   two controls. Expanded, each carries a glyph, a name and a second line. Collapsed to the icon
   rail, each is its glyph alone and still opens its menu. Inside the drawer band, below the
   shell breakpoint where there is no rail, both appear in the drawer with their expanded
   content.
2. **Each control holds what is true about the thing it names.** The workspace control: the
   workspaces this account has, with the open one marked, and the way to make another. The
   account control: who this is, the way to settings, and the way out. **Neither menu holds the
   other's contents**, and signing out is reached from the account control and nowhere else.
3. **The workspaces the account has are listed, and the open one is marked.** Today an account
   owns exactly one, so the list is one row. **Selecting it closes the menu and changes nothing
   else**, which is what selecting the workspace you already have open means. Nothing switches,
   because there is nothing to switch to.
4. **Creating another workspace is offered, reachable, and inert.** The row carries the `+`, is
   reachable by keyboard, announces itself as unavailable to assistive technology, and states why
   in visible text on the row rather than in a tooltip. Activating it does nothing.
5. **The product's mark stays in the shell and the product's name leaves it.** The mark becomes
   the workspace control's glyph; `rentable` as a word survives in the window title and on the
   sign-in card, and appears nowhere in the sidebar. *Decided 2026-08-20: the alternative was a
   third permanent row in a shell that starts at 480 tall.*
6. **The account's picture is drawn from a local copy, fetched once when the account signs in.**
   The shell never reaches Google to draw a row, so the row is identical online and offline.
   Where no picture was obtained, or the fetch failed, initials stand in and nothing retries
   until the next sign-in.
7. **Settings holds only what configures the application.** The account group is gone from it,
   and what remains of the workspace group is the part that is an operation on data rather than a
   statement of identity.
8. **No surface states a figure twice within itself, and no figure crosses from the shell to
   settings.** The email, the version, the locale and the sync status each have exactly one home.
   **The one exception is named**: the workspace's name and the person's name are the same string
   today, so the top row and the bottom row will read alike, and the second line of each is what
   distinguishes them. See Constraints.
9. **The workspace's replication state, and the control that syncs now, stay in settings**, in a
   group about the workspace's data rather than its identity, beside the transfer pair.
10. **The sign-in card presents as a login page.** The mark and the product's name sit **above**
    the card, centred; the card's own header is centred; the notice sits between that header and
    the way in; the way in is one provider button carrying that provider's glyph. Nothing else is
    on the card except the way to sign in as somebody else.
11. **Both locales, and Arabic is not a second-class one.** Every new surface is checked
    right-to-left, and each menu opens on the side away from the rail, which is the left in
    Arabic.

## Acceptance criteria

1. At 640 wide and up, expanded, collapsed and in the drawer, the sidebar's top row names the
   open workspace and its bottom row names the signed-in person. Collapsed, each is a single
   glyph that still opens its menu.
2. Neither menu holds the other's contents: no sign-out and no settings entry in the workspace
   menu, no workspace list and no create entry in the account menu.
3. The workspace menu lists exactly the workspaces the account has, with the open one marked.
   Selecting the marked row closes the menu, and the workspace, the route and the replica are
   unchanged afterwards.
4. The create row takes keyboard focus in menu order, reports itself as disabled to assistive
   technology, carries the `+`, and shows its reason as text on screen with no pointer on it.
   Activating it by pointer or by keyboard changes nothing.
5. Signing out is reachable from the account control in two moves, and a search of the tree finds
   no other surface offering it.
6. `rentable` appears nowhere in the rendered sidebar, in either locale, and the mark does.
7. With the machine offline from launch, both sidebar rows draw exactly as they do online,
   including the picture, and no request leaves the application to draw them. An account whose
   sign-in obtained no picture draws initials, in both states.
8. The settings page has no account group and no sign-out control, and the account's email
   address appears on it at most once.
9. The version, the account email, the locale and the sync status each appear exactly once across
   the two sidebar controls and the settings page taken together. The workspace name appears in
   the workspace control only, and the person's name in the account control only.
10. Sync status and the control that syncs now are reachable in settings, in one group with the
    transfer pair, and settings is reachable from the account menu.
11. On the sign-in card: the mark and `rentable` render above the card and outside it; the title
    and its line are centred; the notice is between the header and the button; the button carries
    Google's glyph. The other six screens that render through the shared surface are unchanged,
    which is checkable by their markup being untouched above the card.
12. Every surface in this effort holds from 640x480 upward with no horizontal scrollbar, in
    English and in Arabic, with each menu opening away from the rail in both.

## Constraints

- **The sign-in card stays on the shared standalone surface**, which [[rules/interface]], under
  *Application surfaces*, requires and #628 confirmed. **The block gains one outer slot** so a
  screen can place a mark above the card; the sign-in screen is the only caller, and a screen
  passing nothing renders exactly what it renders today. *Decided 2026-08-20: the alternative was
  keeping the mark inside the card, which is not the shape `login-03` has and reads as a dialog.*
- **No switcher is built, and the accepted spec now says so in those words.**
  [[efforts/a-workspace-follows-its-user]] is accepted and its acceptance criterion 2 read *a
  search of the tree finds no workspace list, no switcher*, which made a rendered list of length
  one a violation. **On 2026-08-20 the human decided the prohibition is on the mechanism**, and
  that criterion was rewritten to forbid anything that selects or creates a workspace while
  naming what is open as compatible. This effort builds no mechanism: the row is a statement, and
  selecting it closes a menu.
- **The workspace's name is the person's display name**, set once at sign-up from Google's
  profile and never re-derived (`workspaceForAccount`, `apps/control-plane/src/server/server.ts`
  passes `account.displayName`). **This is the sharp edge of the two-control shape**: the top row
  and the bottom row print the same string for every account that exists today. Neither control
  may assume those two are different words, and the second line of each is what has to carry the
  difference. Deriving a different name for the interface is out of scope, so the second lines are
  the whole lever.
- **The two controls cannot be empty.** `+layout.svelte` renders the frame with
  `showNavigation={startupState === 'ready'}`, and reaching `ready` means admission passed, which
  means an account is held and a workspace is open. The startup path also writes the state into
  the `settingsKeys.remoteSync` cache before the shell mounts, so there is no first frame with
  nothing to draw. **Neither control gets an empty state, and that is a consequence of the gate
  rather than an omission.**
- **The IPC surface grows by exactly one thing**, the local picture. Everything else these
  surfaces draw is already in `RemoteSyncState`: display name, email, and the workspace's name.
  No control-plane route and no workspace schema change is part of this.
- **The sidebar primitive family is owned, not generated.** [[efforts/shell-presentation-spec]]
  set that constraint and it holds: these controls are written by hand, and re-adding the family
  through the generator would discard them.
- **640x480 upward, both locales**, which is the standing window range and is not moved here.
  Below the shell breakpoint the navigation is a drawer rather than a rail, which is that same
  effort's decision and is why requirement 1 names three states rather than two.
- The visual work names its reasoning. [[rules/interface]], under *The visual reference*,
  requires a decision that leans on the book to cite the section it leans on.
- **`sidebar-07` is the shape the human named, both halves of it**, and it is read as source
  rather than recalled. Its `team-switcher.svelte` is the header control: a large sidebar button
  holding a filled 8-unit square with the mark in it, the name over a smaller second line, and a
  chevron pushed to the end; its menu is a labelled group of rows, each with a bordered 6-unit
  glyph, then a separator, then a muted row carrying a bordered `+`. Its `nav-user.svelte` is the
  footer control: the same button with an 8-unit avatar instead of the square, opening a menu
  whose first item repeats that pair as a label, then separated groups, then the way out last.
  `login-03` is the card: the mark and the product name centred above the card, a centred title
  and one line under it, and the provider as an outline button carrying that provider's glyph.
  **What is taken is presentation. None of them brings its content** — no upgrade row, no
  billing, no notifications, no keyboard shortcuts on the workspace rows, no email and password
  field, and no terms line.

## Scope added during refinement

**The picture is now this effort's, and it was not in the draft.** The draft assumed the shell
would render `avatarUrl` straight from `RemoteSyncState`, which is a Google-hosted URL taken from
the OIDC `picture` claim (`apps/desktop/tauri/src/sync/google/profile.rs`). On 2026-08-20 the
human chose to fetch it once at sign-in and keep it locally instead, over drawing it from Google
and over initials alone.

What that adds, stated plainly because it is what makes this effort bigger than three surfaces:

- A fetch on the sign-in path in Rust, which must not fail a sign-in when it fails itself.
- Bytes at rest beside the account, with a size bound and a content type not trusted from the
  response alone.
- A way for the webview to draw a local file, which is a decision `/plan` owns.
- A sign-out, and a sign-in as somebody else, that remove it. It is personal data belonging to an
  identity the machine no longer holds.

None of that is designed here. It is named so the sizing is honest and so `/plan` cannot treat it
as a detail of a Svelte component.

## Out of scope

- **Creating a second workspace.** The row is inert by requirement, and the mechanism behind it
  is the organization work in requirement 14 of [[efforts/a-workspace-follows-its-user]].
- **Switching between workspaces**, for the same reason: there is nothing to switch to, and
  building the mechanism before the second workspace exists is building against a guess.
- **Renaming a workspace, or deriving a different name for it in the interface.** If the name
  reads badly beside the person's, that is worth its own decision and its own effort.
- **Inviting anybody, membership, or per-workspace permissions.**
- **What signing in does.** The admission ladder, the session window, the three situations and
  the retry path all landed in #628 and are not touched. This changes what that card looks like,
  and it adds one fetch after the sign-in has already succeeded.
- **The other six screens on the shared surface.** The block gains a slot; none of them passes
  it, and none of them changes.
- **Settings' own loading and failure branches**, and the route error boundary.
- **A settings navigation with a detail pane, or settings split into sidebar destinations.**
  Both were rejected with reasons in [[efforts/surfaces-the-overhaul-left-behind]] and neither is
  reopened here.
- **The four primary destinations.** They do not move, change icon, or gain a fifth.
- **Refreshing the picture when it changes at Google.** It is fetched at sign-in and that is all;
  a person who changes their photo sees it after signing in again.

## Settled during refinement, 2026-08-20

- **A one-row workspace list is a statement, not a switcher**, and acceptance criterion 2 of the
  accepted workspace effort was rewritten rather than worked around.
- **Sync status, the sync-now control and the transfer pair stay in settings.** The menu was the
  alternative for sync and it loses for a reason worth keeping: it puts an operation that can
  fail, and that has an error to report, behind a control people open to change screens.
- **The mark goes above the card on the sign-in screen**, and the shared block gains the slot
  that allows it.
- **The picture is cached locally at sign-in.** See *Scope added during refinement*.
- **The product's name leaves the sidebar** and the mark stays.
- **The locked create row is reachable, announced and inert**, with its reason as visible text.
- **Selecting the open workspace closes the menu**, rather than the row being inert. Decided here
  rather than asked: a menu in which nothing at all can be activated looks broken, and closing on
  selection is what the block already does. Cheap to change if it reads wrongly.

## Assumptions

- The person asking for this named `sidebar-07` as the fit, and read its two halves as the split:
  the workspace on top, the account underneath. That is taken as the decision it sounds like, so
  signing out moves to the footer control rather than staying in settings.
- One row for the workspace list is acceptable as a presentation. If it reads as a broken
  switcher on screen, requirement 3 is what changes, not the code.

## Open questions

- **What the two second lines say.** They are the only thing telling two rows apart while the
  names collide. The footer's is almost certainly the email, following `nav-user`. The header's
  has no obvious answer: `team-switcher` puts the plan there and there is no plan here. Settling
  it: on screen, against a real account, with `pnpm prototype`, rather than by argument.
- **Where the webview reads the local picture from.** A file path plus Tauri's asset protocol, a
  data URL in the state payload, or bytes over a command. `/plan` decides, and the answer changes
  what `RemoteSyncState` carries.

## Risks

- **The top row and the bottom row read as the same row twice**, because today they carry the
  same name. It shows up immediately against a real account, and it is the first thing to look at
  once both controls are on screen. The mitigation is the second lines, and the fallback is that
  requirement 1 gets a different shape rather than the code getting a workaround.
- **The one-row list reads as a switcher that does not work**, which no description settles.
  Judged on screen against a real account.
- **The picture fetch fails a sign-in.** The worst outcome available here, because sign-in is the
  only way into the application. Detected by making the failure path explicit and by testing a
  sign-in with the fetch made to throw, rather than by watching the happy path.
- **The picture is stored and never removed** when the identity is given up, leaving a person's
  photo on a machine they signed out of.
- **The account row is deleted from settings before the sidebar control can show it**, leaving a
  build where nothing says who is signed in. Detected by ordering the work so the control lands
  first.
- **The block's new slot is used by a second screen later**, and the sign-in card stops being the
  only one with a brand above it. That is drift rather than a bug, caught in review, and the
  slot's own documentation is where it is prevented.

## Architecture

Three seams, and only one of them is deep.

**The shell gains two controls and no new data path.** Both read `useFetchRemoteSyncState()` from
`$lib/settings/query`, whose key the startup path already primes: `+layout.svelte` writes the
state into `settingsKeys.remoteSync` before it sets `startupState = 'ready'`, and the frame
renders navigation only at `ready`. So the controls draw from cache on their first frame, and the
constraint that they cannot be empty is a property of that ordering rather than of a guard inside
them.

**The picture becomes a fact this application holds rather than a URL it points at.** Fetched
once on the sign-in path in Rust, kept in the remote-sync store as a data URL, and handed to
TypeScript as one more field on the account. Nothing in the webview reaches Google, which is what
makes requirement 6 true offline.

**The shared standalone surface learns one thing**: what to draw above the card, and whether its
header is centred. Both are opt-in and the other six screens pass neither.

### The picture, and the two ways it could have worked

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **A. Data URL in the store** (recommended) | No new file, no new command, no protocol configuration. The bytes live in `store.json` beside the account they belong to, so the three places that already write `NeedsReconnect` are the three places that clear them. Removal is a field assignment | `store.json` grows by a few kilobytes per account and is rewritten on every commit. The payload crosses IPC on every `getState` | A large or hostile response inflates the store. Bounded by a size cap and a content-type allowlist, both checked before the bytes are kept | One field, one fetch, one clear. Nothing to garbage collect |
| **B. Sidecar file plus the asset protocol** | The store stays small, and the bytes are read only when drawn | Needs `app.security.assetProtocol` enabled with a scope, which is absent entirely today: `csp: null` is the whole security block. Needs a path, an orphan-cleanup pass, and `convertFileSrc` on the TypeScript side | A file outlives the account it belonged to, which is a person's photo left on a machine they signed out of. That is the failure this effort's own risk list names | Two lifecycles to keep in step, and a Tauri configuration surface this repository does not otherwise use |
| **C. No cache, initials only** | Nothing to build. The row is deterministic and identical everywhere | Loses the picture, which is what makes a shell row read as a person rather than as a label | None | None |

**A is recommended, and the human chose it on 2026-08-20.** The deciding argument is removal
rather than size: a picture that must
disappear when an identity is given up wants to live in the record that already has three
enumerated places where that happens, and B buys a smaller `store.json` at the cost of a second
lifecycle that has to be kept in step with it.

C remains available and is not a lesser answer, only a different product decision. Choosing it
deletes this whole seam and leaves an effort of three surfaces.

## Components

**New, in `src/lib/layout/component/`** — the application shell's own components live in `layout`
rather than `design/block/`, per [[rules/frontend]] under *Components*:

- `workspace-menu.svelte`. The header control. Its trigger is a `Sidebar.MenuButton size="lg"`
  holding a filled `size-8` rounded square with the application mark in it, then the workspace
  name over a second line, then `ChevronsUpDownIcon` pushed to the end. Its menu carries a
  `Label` naming the group, one `Item` per workspace with a bordered `size-6` glyph and a check
  on the open one, a `Separator`, and the create row.
- `account-menu.svelte`. The footer control. The same button with an `Avatar.Root size-8` in
  place of the square, the display name over the email, and the same chevron. Its menu repeats
  the avatar, name and email as a `Label`, then a `Separator`, then the settings entry, then a
  `Separator`, then signing out.

**Changed**:

- `layout/component/sidebar.svelte`. The header renders `workspace-menu` in place of the mark and
  the product name; the footer renders `account-menu` in place of `links(secondaryDestinations)`.
  The `links` snippet and the primary navigation are untouched.
- `layout/destination.ts`. **`secondaryDestinations` stays.** `palette.svelte` searches
  `[...primaryDestinations, ...secondaryDestinations]`, so deleting it would take settings out of
  the command palette, which nothing asked for. Only the sidebar stops rendering it, and its doc
  comment is what says so.
- `sync/account.ts` gains `accountInitials(account)`, moved out of
  `settings/component/sync.svelte` where it is a private helper today. One implementation,
  because the avatar fallback and anything later wanting initials want the same answer.
- `design/block/standalone-surface.svelte`. `lead` is replaced by `brand`, rendered **outside**
  the card above it and centred, and an `align?: 'start' | 'center'` decides the header block's
  alignment. `lead` has exactly one caller, added by #628 on 2026-08-20, so this is a rename of
  something a day old rather than a break in a shared contract.
- `layout/component/startup-sign-in.svelte`. Passes `brand` and `align="center"`, and the
  provider button becomes `variant="outline"` carrying Google's own glyph as an inline path.
- `routes/settings/+page.svelte`. The account group and its separator are deleted.
- `settings/component/sync.svelte`. The inset panel loses the avatar, the workspace name and the
  email. What stays is the status badge, the automation callout, the last error and the sync-now
  control.

**Deleted**: `settings/component/account.svelte`. Its one behaviour, signing out, moves to
`account-menu.svelte` unchanged, including its refusal to do anything with the state it gets
back.

## Interfaces

**Rust to TypeScript.** `RemoteSyncAccount` gains `avatar_image: Option<String>`, a complete
`data:` URL, and **`avatar_url` stops crossing**. The TypeScript view of this payload already
omits two members the Rust side carries, for the reason `host.ts` gives above
`RemoteSyncWorkspace`: a field nothing may use is a field something eventually uses. The remote
URL stays in the store, because it is what a later refresh would fetch.

**Within Rust.** `GoogleSignInCompleteInput` gains `avatar_image: Option<String>`, filled by the
sign-in path and stored verbatim. `complete_google_sign_in` stays a store operation and performs
no network call, which is what keeps `session.rs` free of the transport.

**No new Tauri command.** Signing out is `signOutOfGoogle` from `$lib/sync/sign-in`, which
`account.svelte` already calls today; the caller moves and the call does not change.

## Data model

`StoredAccount` in `sync/store.rs` gains:

```rust
/// the account's picture, as a complete `data:` URL, or nothing.
#[serde(default)]
pub avatar_image: Option<String>,
```

`#[serde(default)]` is not decoration: `store.json` on an installed machine has no such key. The
value is written in one place and cleared in three, and those three are the ones `store.rs`
already enumerates as writing `NeedsReconnect`: signing out, being superseded by a sign-in as
somebody else, and a refresh that failed.

**Bounds, checked before anything is kept**: the response's content type must be one of
`image/png`, `image/jpeg`, `image/webp` or `image/gif`, and the body must be at most 256 KB.
Google's `userinfo` picture is an `=s96-c` URL and answers in single-digit kilobytes, so the cap
is two orders of magnitude clear of the real case and exists for the response that is not the
real case.

## Technical approach

**The fetch happens in `sign_in.rs`, immediately after `read_google_profile`, and cannot fail the
sign-in.** It is the same act as reading the profile: the picture is one of the four claims that
read returns, so the two together are one code path and one place a reader looks. It is given a
timeout of its own, short enough that the worst case is a sign-in a few seconds slower rather
than one that hangs, and every failure resolves to `None`.

The client comes from `http.rs`, because [[contexts/desktop/remote-sync]] under *Boundaries* says
network clients are built in one place, and one built any other way panics on a missing crypto
provider rather than failing.

**The alternative considered and rejected**: fetching after `complete_google_sign_in` has already
returned, as a genuinely separate best-effort step. It matches *what follows a sign-in is
best-effort* more literally and costs the sign-in nothing. It loses because the picture would
then arrive after the shell had drawn, so the first frame after a first sign-in shows initials
that silently become a photo, and because a second write path into the account row is a second
place to keep correct for a field written once.

**The locked create row is `aria-disabled` rather than `disabled`.** bits-ui's `disabled` sets
`data-disabled`, which the item's own classes turn into `pointer-events-none`, and it takes the
row out of the highlight order, which is exactly what requirement 4 rejects. The row instead
carries `aria-disabled="true"`, `closeOnSelect={false}` and an `onSelect` that calls
`preventDefault()`, all three verified against `bits-ui@2.18.1`'s `MenuItemPropsWithoutHTML`. Its
reason is a muted second line on the row, not a tooltip.

**Each menu opens away from the rail, and the side is computed rather than fixed.** The content
primitive already sets `dir` from the locale, but `side` is physical in bits-ui, so
`side={direction === 'rtl' ? 'left' : 'right'}`, and `side="bottom"` where
`useSidebar().presentsAsDrawer` is true. That property is the shell's own, declared in
`design/primitive/sidebar/context.svelte.ts`, and it is the same one the drawer crossing uses.

**The mark is monochrome on the sign-in button.** `login-03` inlines a single-path Google glyph
drawn in `currentColor`, and this application has a dark mode, so the coloured mark would need a
light plate under it in one theme and not the other. The glyph is inlined in the component rather
than added to an icon package.

### The tickets

| # | Ticket | Blocked by | Carries |
| --- | --- | --- | --- |
| 01 | feat(sync): the account's picture is kept on this machine | — | the fetch in `sign_in.rs`, the store field, the clearing on the three paths, the payload change, the fixture, the Rust tests |
| 02 | feat(shell): the sidebar names the workspace and the account | 01 | both controls, the sidebar's header and footer, `accountInitials`, the translations, the locked create row |
| 03 | feat(settings): settings configures and nothing else | 02 | the account group deleted, `sync.svelte` reshaped, the strings removed |
| 04 | feat(layout): the sign-in card reads as a login page | — | the block's `brand` and `align`, the card, the Google glyph |

**01 goes first because 02 draws what it produces**, and 03 follows 02 for the reason this
effort's own risk list gives: deleting the account group before the control exists leaves a build
where nothing says who is signed in. 04 shares no file with the other three and can be built at
any point.

## Integration

- `platform/tests/testing.ts` builds the `RemoteSyncAccount` fixture and carries `avatarUrl: null`
  today. It becomes `avatarImage: null`, and every test using it keeps compiling because that
  shape is shared rather than hand-written per file.
- `settings/component/sync.svelte` holds `getInitials` privately; that function leaves the file
  and its remaining caller imports it from `$lib/sync/account`.
- The i18n locales gain a `layout.workspaceMenu` and a `layout.accountMenu` group, and lose
  `settings.groupAccount`, `settings.accountDescription` and `settings.accountSignedInAs`.
  Regenerating the types is part of the ticket that moves them, not a follow-up.
- Nothing in the control plane, the workspace schema, or the migrations is touched.

## Testing strategy

| Criterion | Checked by |
| --- | --- |
| 1, 2, 12 | By hand, on screen, at 640, at 700 and above the breakpoint, expanded and collapsed, in both locales. There is no component-rendering harness here and adding one is not this effort's work |
| 3 | By hand: selecting the marked row closes the menu, and the route, the workspace name and the replica are unchanged after it |
| 4 | By hand with the keyboard alone, and by inspection of the rendered attributes: `aria-disabled` present, `disabled` absent, the reason in the accessibility tree as text |
| 5, 6, 8, 9 | A search of the tree, which is what makes each of them cheap: one `signOutOfGoogle` caller, no `app.name` inside the sidebar, one email in settings |
| 7 | A Rust test per outcome, against the loopback server in `sync/google/test/server.rs` that the profile read is already tested against: a picture kept, a wrong content type refused, an oversized body refused, and a connection failure leaving `None` **with the sign-in still completing**. Then by hand with the machine offline from launch |
| 10 | By hand: settings reachable from the account menu, sync and transfer in one group |
| 11 | By hand for the card, and by `git diff` for the claim that the other six screens are unchanged |

The Rust tests are the load-bearing ones, and the fourth of them is the point: the failure that
matters is a picture fetch taking a sign-in down with it, and it is invisible on a happy path.

## Technical risks

- **The store's tolerance for a field arriving.** The new key is absent from every `store.json`
  written by the current build, so it must load with `#[serde(default)]` and no
  `deny_unknown_fields` anywhere on that path. Checked before the field is added rather than
  after, against the store's existing load test.
- **`side` is physical and the check is visual.** Nothing type-checks a menu opening off the
  window edge in Arabic. It is on the by-hand list for that reason.
- **`Avatar.Image` with a `data:` URL.** bits-ui resolves an image's loading state before showing
  it, and a data URL loads synchronously. If the primitive's status machine leaves a frame of
  fallback, the row flickers initials on every mount. Detected on screen; the fallback, if it
  happens, is a plain `<img>` with the initials behind it.
- **The sign-in card's three situations.** Requirement 10 describes the `noAccount` presentation.
  The other two keep the extra control #628 gave them, sitting under the provider button. The
  requirement is not narrowed by this; it is what it always meant, and it is written here so an
  implementer does not delete a retry button to satisfy a sentence.
