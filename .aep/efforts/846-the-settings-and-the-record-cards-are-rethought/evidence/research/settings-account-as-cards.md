# Question

How do well-designed products draw an account, sign-in and security, and devices or sessions
screen as cards, judged on screenshots rather than text; and what card design follows for
rentable's account tab (ownership offer, signed in as, password, machines, sign out of this
machine) that stays coherent with the general, organization and workspaces tabs?

Asked for the human's words of 2026-10-02: "the tabs remaine the same but each section it's text
its everyhthing is a card ... the reasrch should be looking at picture of desgins of such
sections and as a whole ... my issue is with the ui and it's how presented in the settings in each
tab it's sections".

Builds on, and does not repeat,
[[efforts/846-the-settings-and-the-record-cards-are-rethought/evidence/research/how-apple-and-google-present-account-security-and-membership]]
(text sources; its *Not checked* list asked for screenshots) and
[[efforts/846-the-settings-and-the-record-cards-are-rethought/evidence/research/how-production-apps-organize-a-settings-section]]
(layout and disclosure; its finding 4 covers sessions lists from text).

# Sources

Every image below was downloaded on 2026-10-02 to the session scratchpad and viewed. None is
copied into the repository. *Official* means the product's own documentation or blog;
*press* means a third-party article's screenshot of the real product, weaker for dating.

| # | Product | Screen | Image URL | Kind |
| --- | --- | --- | --- | --- |
| S1 | Linear (desktop) | Security & Access, sessions and passkeys | https://webassets.linear.app/images/ornj730p/production/709f9a7c9139ac1a2eae0dc6494b1f04d7a29acf-1848x1264.png (on https://linear.app/docs/security-and-access) | official |
| S2 | Linear | Preferences, grouped rows | https://webassets.linear.app/images/ornj730p/production/4f79d61790a704d7e47e00611e8615a30f932979-2084x1633.png (on https://linear.app/docs/account-preferences) | official |
| S3 | Apple, macOS 27 System Settings | Apple Account pane, Devices | https://cdsassets.apple.com/live/7WUAS350/images/apple-account/macos-27-golden-gate-system-settings-apple-account-devices.png (on https://support.apple.com/en-us/102649) | official |
| S4 | Apple, account.apple.com | Devices | https://cdsassets.apple.com/live/7WUAS350/images/apple-account/macos-27-golden-gate-safari-account-apple-com-devices.png (same page) | official |
| S5 | Apple, macOS 26 System Settings | Sign-In & Security | https://cdsassets.apple.com/live/7WUAS350/images/apple-account/macos-tahoe-26-system-settings-apple-account-sign-in-security.png (on https://support.apple.com/en-us/101567) | official |
| S6 | Google Account (web, 2025 redesign) | Home; Data & privacy | https://9to5google.com/wp-content/uploads/sites/4/2025/11/Google-Account-web-redesign-1.jpg and `-2.jpg` (on https://9to5google.com/2025/11/28/google-account-web-redesign/) | press, 2025-11 |
| S7 | Google Account (Android, M3 Expressive) | home list | https://9to5google.com/wp-content/uploads/sites/4/2025/07/Google-Account-Material-3-Expressive-2.jpg (on https://9to5google.com/2025/07/16/google-account-expressive-redesign/) | press, 2025-07 |
| S8 | GitHub | GitHub Mobile sessions | https://user-images.githubusercontent.com/1666363/201753607-d1a325bb-9b20-4e5c-85f8-30afb1ae451d.png (on https://github.blog/changelog/2022-11-16-new-session-and-device-management-settings-page/) | official, 2022 |
| S9 | GitHub | Your passkeys list | https://github.blog/wp-content/uploads/2023/07/key_list.png (on https://github.blog/2023-07-12-introducing-passwordless-authentication-on-github-com/) | official, 2023 |
| S10 | Vercel | Account: Email; Authentication | https://7nyt0uhk7sse4zvn.public.blob.vercel-storage.com/docs-assets/static/docs/accounts/account-emails-2-light.png and `authentication-page-light.png` (on https://vercel.com/docs/accounts) | official |
| S11 | Vercel | Delete Project card | https://7nyt0uhk7sse4zvn.public.blob.vercel-storage.com/docs-assets/static/docs/concepts/projects/delete-project-light.png (on https://vercel.com/docs/projects/managing-projects) | official |
| S12 | Discord (desktop) | User Settings, Sessions | https://static0.xdaimages.com/wordpress/wp-content/uploads/2022/06/Discord-log-out-other-sessions-screenshot-1-1024x636.jpg (on https://www.xda-developers.com/discord-log-out-sessions-other-devices/) | press, 2022 (Canary build) |
| S13 | Microsoft, WinUI 3 Gallery | Settings page of SettingsCards | https://learn.microsoft.com/en-us/windows/apps/design/app-settings/images/appsettings-layout-navpane-desktop.png and `appsettings-about.png` (on https://learn.microsoft.com/en-us/windows/apps/design/app-settings/guidelines-for-app-settings) | official |
| S14 | Slack (web) | Sign out all other sessions | https://cdn.mos.cms.futurecdn.net/58Czf7ep3bTPgbsegKxNoS.jpg (on https://laptopmag.com/how-to/log-all-devices-out-slack-account) | press, older UI, undated |

Products viewed: **Linear, Apple (System Settings and account.apple.com), Google Account, GitHub,
Vercel, Discord, Microsoft (WinUI), Slack** (8).

Repository, read at `56b59fff`: `apps/desktop/src/lib/organization/component/settings-account.svelte`,
`organization/session/component/{identity,machines}.svelte`,
`packages/design/src/lib/block/settings-{group,row}.svelte`, the primitive list in
`packages/design/src/lib/primitive/`, and the effort's spec (requirements 1, 2, 8 to 11) and plan
(*The settings area: one shared group and row*).

# Findings (what the pictures show)

## 1. Card anatomy

- **observed (S2, Linear).** Group title in plain text *outside* and above the card; the card is a
  rounded, 1px-bordered, slightly raised surface holding rows split by inset hairlines. Each row:
  title (regular weight), one muted description line under it, control at the trailing edge,
  vertically centred. No leading icons. A lone setting gets a card of its own (*Interface theme*).
- **observed (S13, Microsoft).** Section header in bold text outside; *each setting is its own
  card*, 4px apart: leading outline icon, title, one muted description line, trailing control
  (dropdown, switch with its state word, buttons). An expander's header shows the value
  (version number) beside the chevron.
- **observed (S5, S3, Apple).** Bold group heading outside, often with a one- or two-line muted
  description under it (*Email & Phone Numbers*, *Recovery Methods*); a rounded, borderless,
  tinted card of rows. The *Password* row: name, a muted sub-line *Last Changed October 6, 2017.*,
  and a trailing grey *Change Password…* button. An add act is a button at the card's foot,
  right-aligned, inside the card.
- **observed (S10, S11, Vercel).** The *title and description are inside the card*: bold title,
  a paragraph, a nested list box or body, then a **footer band** of a darker muted fill across
  the card's full width holding either a hint (*Emails must be verified...*) or the act. On
  *Delete Project* the footer holds a solid red *Delete* at the trailing edge; the body names
  what ends (*permanently deleted, including its deployments and domains... can not be undone*).
- **observed (S1, S9, Linear and GitHub).** A list card with a **header bar inside the card**:
  a count or title at the start (*19 other sessions*, *Your passkeys*) and the list's act at the
  end (*Revoke all*, *Add a passkey*).
- **observed (S6, Google).** Section heading and description outside; rows in white rounded
  cards, leading icon, title, a state chip (*On* with a check) under the title, no trailing
  control on these rows (the row opens a page). A suggestion banner is its own one-row card at
  the top of the page.
- **interpretation.** Two families: *title outside, rows inside* (Apple, Linear, Microsoft,
  Google) and *title inside, footer band* (Vercel). Every product puts the one-line explanation
  next to the title, not in every row, except Linear and Microsoft, which give each row its own
  description line.

## 2. Who is signed in

- **observed (S4, account.apple.com).** A large circular avatar, the name in bold, the Apple ID
  muted under it, at the head of the left column, above the section links. No role, no button.
- **observed (S3, macOS).** Avatar, name and *Apple Account* sit in the window's sidebar as the
  first, selected item; the pane itself does not repeat them.
- **observed (S6, Google).** The home page centres a large avatar with a camera badge, the name
  in a large type size, then a search box and shortcut chips (*My password*, *Devices*).
- **not found.** No screenshot shows a role or an organization beside the person's name; none of
  these products has rentable's *member of an organization with a role* in the identity block.
- **interpretation.** Identity is drawn as a *header*, larger than a row, led by an avatar: never
  as a settings row like any other.

## 3. Devices and sessions inside a card

- **observed (S1, Linear).** *This* session is a **separate one-row card** above the list: desktop
  icon, *Linear Desktop on macOS*, then a green dot and *Current session* · location. The other
  sessions sit in a second card with the header *19 other sessions* and *Revoke all* (plain text
  button, not red). Rows: a small square-tiled icon by client (browser glyph or monitor), name,
  muted meta line *Dublin, L, IE · Last seen 33 minutes ago*. No per-row button visible (the doc
  says revoke on hover). *Show all* at the foot truncates the list.
- **observed (S12, Discord).** Small caps sub-headings *CURRENT SESSION* and *OTHER SESSIONS*
  inside one pane; rows of large device glyph, name in caps, meta line *IP · 3 hours ago*; the
  per-row act behind a `⋯` menu (*Log Out of Session* in red with an arrow icon). The bulk act is
  its **own block at the end**: heading *LOG OUT OF ALL OTHER SESSIONS*, the consequence (*You'll
  have to log back in on all your devices.*), and a **red-outlined** button.
- **observed (S9, GitHub passkeys).** Per row: glyph, name, a bordered pill badge *Used from this
  device* beside the name (blue pill *Synced* for others), meta line *Added on Jun 7, 2023 | Last
  used less than an hour ago*, and trailing icon buttons, the delete one with a **red** trash glyph.
- **observed (S8, GitHub Mobile sessions).** One bordered card per device; facts as labelled
  lines (*Registered*, *Last accessed*); a small red-text *Revoke* button at the trailing top.
- **observed (S3, S4, Apple).** Devices are rows with a product picture, the user's device name,
  and the model under it; *this* Mac is marked only by the sub-line *This MacBook Pro 14"*. Each
  row has a chevron to a detail; no remove act on the list. On the web the same devices are a
  2 by 2 grid of tile cards (name, model, picture at the trailing top).
- **observed (S14, Slack, older UI).** The bulk act is a page section with an icon in the error
  colour by its heading, a bulleted list of what it does, **This will not reset your password.**,
  a password field and a red solid button.
- **interpretation.** Common to all: the meta (last seen, added) sits *under the name*, never in
  a right-aligned column; *this* device is marked by a word (badge, coloured status, or sub-line)
  and placed first or apart; the bulk act spares the current one and says so.

## 4. Where destructive acts sit, and their colour

- **observed.** Red is used by GitHub (trash glyph, *Revoke* text), Discord (red-outline bulk,
  red menu item), Vercel (solid red in the footer band), Slack (solid red). Linear's *Revoke all*
  is not red. **Apple's sign-out is never red**: on macOS a plain grey *Sign Out…* button at the
  bottom-leading corner of the pane, after the last card and outside it (S3); on the web a blue
  pill at the top-trailing corner (S4).
- **observed.** Every product puts the bulk or final destructive act last, under or after the
  list it affects; Linear alone puts it in the list card's header.
- **interpretation.** The spec's error tone for *sign out of this machine* (requirement 2) is
  stricter than Apple's own sign-out, which is neutral. Recorded, not resolved: the spec is the
  human's.

## 5. Layout and spacing

- **observed.** S1, S2, S5, S13 are single columns about 550 to 900px wide in a wider window;
  vertical rhythm is about 8 to 12px between title and card and 24 to 40px between groups. S4
  is the only grid, and it is a grid of *device tiles* (homogeneous items), not of settings groups.
- **not found.** No screenshot shows two different settings groups side by side in a grid. The
  plan's two-column grid has the human's request behind it, not a product precedent (the prior
  file found the same from text).

# Recommendation for the account tab

*Inference from the findings; the orchestrator and the human decide.*

## One card anatomy for all four tabs

Proposed for the orchestrator to reconcile with the sibling researchers:

1. **Card** = one rounded bordered `bg-card` surface (`settings-group`, an `Item.Group`; the design
   package has no shadcn `card` primitive and does not need one).
2. **Header, inside the card** (Vercel S10/S11, Linear S1 header bar): a leading muted glyph, the
   **title** (`text-sm font-medium`), and the **one line** of explanation under it in muted text.
   An optional **header value** at the trailing edge (a count, a status word), never an act that
   ends something.
3. **Body**: rows (`settings-row`, `Item.Root size=sm`), inset hairlines between them. Row = glyph,
   name, **meta under the name** (`Item.Description`), badge beside the name where a row is marked,
   control at the trailing edge. A one-row card may drop the header and let its row speak (S2's
   *Interface theme*, S13).
4. **End**: after a full-width separator, the acts that end something, each a row in the error
   tone with a ghost destructive button carrying its icon and its word. No filled band: the tone,
   not a background, says *danger*, so the card stays calm (Apple restraint, S3/S5).
5. **Explanation never repeats** in every row; it lives once in the header.

## Account cards, in source order

| Card | Span | Body | End |
| --- | --- | --- | --- |
| Ownership offered (only when one stands) | full | a `callout` (info tone) inside the card: *{owner} offered you the organization*, the consequence line, **accept** (`crown`, solid primary: the one invited act on the tab) | |
| You (identity) | half | **header, not row**: `avatar` with initials (size-12), username in `text-base font-medium`, `badge` with the role, organization name muted under it | |
| Password | half | row: `key-round`, *password*, outline **change…** (`key-round`) | |
| Machines | full | header *machines* + count *3 signed in* as header value; this machine first with `badge` *this machine*; each row `laptop`, name, meta *last seen 2 min ago · added 12 sep*; others carry ghost error **sign out** (`log-out`); a not-updated row says so in its meta and its button is refused with the tooltip, as today | **sign out all other machines** (`log-out`), confirmed, naming them |
| This machine | full | | **sign out of this machine** (`log-out`), unconfirmed, one footer line *signing in again brings you back* |

Never folded: the offer, the machines list (no *Show all*, unlike S1; requirement 9), every end
act. `collapsible` has no use on this tab: nothing here is detail few readers need.

## Wireframe (about 1100px content width, two columns of 340px+)

```
+----------------------------------------------------------------------+
| (crown) ownership offered                                             |
| [i] sara offered you the organization. you become its owner.  [accept]|
+----------------------------------------------------------------------+
+--------------------------------+ +-----------------------------------+
| (AS)  ahmad                    | | (key) password                    |
|       [member]  al-nasser rent | |   used to sign in on every   [change…]
|                                | |   machine                         |
+--------------------------------+ +-----------------------------------+
+----------------------------------------------------------------------+
| (laptop) machines                                     3 signed in     |
|   every computer signed in as you                                     |
|----------------------------------------------------------------------|
| [] office-pc   [this machine]                                         |
|    last seen now · added 2 sep                                        |
|----------------------------------------------------------------------|
| [] home-laptop                                         (->) sign out  |
|    last seen 3 weeks ago · added 14 jul                               |
|======================================================================|
| (->) sign out all other machines                       (->) sign out  |
+----------------------------------------------------------------------+
+----------------------------------------------------------------------+
| (->) sign out of this machine                          (->) sign out  |
|   signing in again brings you back; the organization stays here      |
+----------------------------------------------------------------------+
```

Below the two-column width the identity and password cards stack, identity first. In Arabic the
whole grid mirrors (logical `start`/`end` only; the meta's `·` order follows the reading
direction; usernames and machine names in `<bdi>`).

## Changes from today's code this implies

- `identity.svelte` stops being a `settings-row` and becomes a header with `avatar` (finding 2).
- `machines.svelte` moves *this machine*, *last seen* and *added* from the end-aligned value
  column to a meta line and a badge under and beside the name (finding 3).
- `settings-group.svelte` draws title and footer line inside the card with a header slot for a
  value (already planned: *gains `span?: 'full'` and draws its title and footer inside the card*).

# Open

- Apple draws its own sign-out neutral (S3, S4); the spec draws it in the error tone. Which wins
  is the human's (requirement 2 stands until changed).
- Whether rentable knows when a password was last changed (Apple's sub-line, S5) was not checked;
  if it does, it is the password row's meta.
- The Discord (S12) and Slack (S14) screenshots are press captures of older builds; their
  current UI was not seen. Figma, Notion, 1Password, Stripe and Raycast help pages gave no
  usable screenshots of these screens (illustrations only, or images blocked), so they are not
  findings.
