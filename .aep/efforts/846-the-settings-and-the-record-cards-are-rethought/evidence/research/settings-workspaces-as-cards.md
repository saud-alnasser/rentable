---

---

# Question

How do well-designed products present a directory of workspaces (projects, teams, teamspaces,
vaults, databases) as cards inside settings or a dashboard, judged from their own screenshots, and
what would that make of rentable's *workspaces* settings tab? Asked for the human's words of
2026-10-02: "in the settings the tabs remaine the same but each section it's text its everyhthing is
a card; so each follows a card; for each section do a resaerch how it's done the reasrch should be
looking at picture of desgins of such sections and as a whole".

Builds on, and does not repeat,
[[efforts/846-the-settings-and-the-record-cards-are-rethought/evidence/research/how-production-apps-organize-a-settings-section]]
(guideline text: one column per Microsoft, disclosure rules, destructive acts last) and
[[efforts/846-the-settings-and-the-record-cards-are-rethought/evidence/research/how-apple-and-google-present-account-security-and-membership]].
That file recorded visual claims as *unverified* because it read text only; this one reads the
pictures.

The brief asked for a recommendation; the researcher role returns findings. The last section is
therefore labelled a *proposal derived from the findings*, for the orchestrator to accept or not.

# Sources

All fetched 2026-10-02 and viewed as images. Dates are the source's own where it gives one; a
screenshot shows the product as it was when the image was made, not necessarily today.

| # | Product | Image (source URL) | Page it sits on |
| --- | --- | --- | --- |
| S1 | Linear, Teams | https://webassets.linear.app/images/ornj730p/production/2aa78477eeb62feb13b2bc41395ee5c69464a763-1771x948.png | https://linear.app/docs/teams |
| S2 | Linear, team overview | https://webassets.linear.app/images/ornj730p/production/1be99fe3cc12b90fb1705763e8e25ff45a9c84a2-1806x911.png | https://linear.app/docs/teams |
| S3 | Vercel, team overview (project cards, search, sort) | https://assets.vercel.com/image/upload/contentful/image/e5382hct74si/5HdVfQrnRQXKdcojeH2tDF/4a261412a8dc267d01157b9a67dc89e2/Dashboard_Update_-_Light.png | https://vercel.com/changelog/improved-team-overview-page |
| S4 | Vercel (ZEIT era), team overview cards | https://assets.vercel.com/image/upload/contentful/image/e5382hct74si/1yEIHWymDtJ3dhUOGi89nL/d82fe683bdb0e8531aecc0145d98fd9b/dashboard-4_1.png | https://vercel.com/blog/dashboard-redesign |
| S5 | Vercel (ZEIT era), projects grid | https://assets.vercel.com/image/upload/contentful/image/e5382hct74si/4BvkLIPzWFgSIAbnuSgdFA/7484e0bb14b9e56f13316849cc7a655b/projects-4_1.png | https://vercel.com/blog/dashboard-redesign |
| S6 | Notion, teamspace menu in the sidebar | https://images.ctfassets.net/spoqsaf9291f/5PnqfTLNf758vzEsX8FzJS/2b8bf35f314df7fbb0bb82efcb7af944/manage_teamspaces.png | https://www.notion.com/help/manage-teamspaces |
| S7 | Notion, page context menu | https://images.ctfassets.net/spoqsaf9291f/7A2upEzKQCUKunD2y1AWwr/2f427c0d64ef5dcc8273e86f5ea426e3/workspace-owner-teamspaces.png | https://www.notion.com/help/manage-teamspaces |
| S8 | 1Password.com, a vault's details | https://support.1password.com/img/1password-com-edit-vault-details-opb.png | https://support.1password.com/create-share-vaults/ |
| S9 | 1Password app, edit vault | https://support.1password.com/img/edit-vault-desktop.png | https://support.1password.com/create-share-vaults/ |
| S10 | 1Password 8, export | https://support.1password.com/img/export-op8.png | https://support.1password.com/export/ |
| S11 | GitHub, organization people list | https://docs.github.com/assets/cb-34919/images/help/organizations/view-list-of-people-in-org-by-role.png | https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-your-membership-in-organizations/viewing-peoples-roles-in-an-organization |
| S12 | Turso, database list icons | https://turso.tech/images/blog/we-built-a-brand-new-turso-web-app/schema-vs-regular-database-icons.png | https://turso.tech/blog/we-built-a-brand-new-turso-web-app |
| S13 | Turso, database settings card | https://turso.tech/images/blog/we-built-a-brand-new-turso-web-app/database-settings.png | same |
| S14 | Slack, workspace switcher | https://slack.zendesk.com/hc/article_attachments/32816748338579 | https://slack.com/help/articles/1500002200741-Switch-between-workspaces |
| S15 | Supabase, transfer project card | https://supabase.com/docs/img/guides/platform/project-transfer-overview--light.png | https://supabase.com/docs/guides/platform/project-transfer |
| S16 | Supabase, database settings cards | https://raw.githubusercontent.com/supabase/supabase/master/apps/docs/public/img/guides/integrations/bracket/001_supabase_dashboard.png | Supabase repository, docs image (integration guide) |
| S17 | Neon, organization projects | https://raw.githubusercontent.com/neondatabase/website/main/public/docs/manage/org_projects.png | https://neon.com/docs/manage/organizations (Neon's website repository) |
| S18 | Apple HIG, info button in a list | https://developer.apple.com/tutorials/images/com.apple.HIG/info-button-in-list@2x.png | https://developer.apple.com/design/human-interface-guidelines/lists-and-tables |

Repository, read on this branch: `apps/desktop/src/lib/organization/component/settings-workspaces.svelte`,
`organization/workspace/component/directory.svelte`, `organization/workspace/acts.ts`,
`organization/workspace/component/app-database-records.svelte`,
`organization/component/directory-tray.svelte`, `packages/design/src/lib/block/record-card.svelte`,
the list of `packages/design/src/lib/primitive/`, and the effort's `spec.md` (requirements 1, 15 to
17) and `plan.md` (*The settings area*, *The section is a grid of group cards*, *The workspace card*).

# Findings

## 1. Grid or list: both, and the choice follows how much each item says

- **observed (S1, Linear Teams).** A full-width table, one row per team: a coloured icon tile, the
  name, a *Membership* column holding a small bordered badge with a check and the word *Joined* on
  the team the reader belongs to, and an identifier column. A count beside the title (*Teams 5*), a
  *Filter* control above. No card per team.
- **observed (S17, Neon projects).** A table inside one rounded bordered container: name (bold),
  region, created at, storage, version, integrations, and a vertical-ellipsis button at the end of
  every row. Above it, the page title with *New Project* (filled) and *Import database* (outline)
  at the end; a usage summary card of four stat tiles sits between.
- **observed (S11, GitHub people).** A list in one bordered box: avatar, name and handle, then
  facts in a line (*2FA* with a check, a lock icon with *Private*, the role word *Owner*, *0 teams*),
  and a horizontal ellipsis at the end. Search at the start of the toolbar, *Invite member*
  (filled, green) at its end.
- **observed (S3, Vercel 2023).** Project cards in a column beside a usage card: a round avatar,
  the name, the domain beneath in muted text, a grey chip with the repository, then the last
  commit message and *Just now on main* with a branch icon. Above: a search field with a `/` key
  hint, a filter-and-sort button whose menu has *Filter by* and *Sort by: Activity / Name* with a
  check on the chosen one, and a list / grid toggle. **source (Vercel docs, via the prior
  search).** "You can use the toggle to change the view between a grid view and list view."
- **observed (S5, Vercel 2020).** Two cards side by side at about 1200 px: a large preview on top,
  then the name (large, bold), an outline *Visit* button at the heading's end, two status lines
  (green dot, domain, a *Production* or *Latest* chip, age), avatars at the end, and a footer
  strip with the repository. S4 shows the same card in one column beside an activity feed.
- **observed (S12, Turso).** A list: a rounded square icon tile per database (a stack for a
  regular database, a document for a schema database) and the name, rows divided by a hairline.
- **observed (S18, Apple).** An inset grouped list: one rounded white container on a grey ground,
  rows divided by inset hairlines, the title at the start and a trailing info button.
- **interpretation.** Where an item carries many comparable facts (Neon, GitHub, Linear) the
  products use a table or list in one container; where an item is a place one goes into, with two
  to four facts, they use cards (Vercel). Rentable's workspace says three things (open here,
  members, access) and is a place one enters, which is the card case, and there are few of them.

## 2. Marking the current or joined item

- **observed (S14, Slack).** In the workspace switcher the current workspace's icon tile carries a
  dark ring a few pixels outside it; the others carry none. Each entry is the icon tile, the name,
  and a second muted line. An *add* entry (a plus in a grey tile) and a sidebar-mode entry follow
  after a separator.
- **observed (S1, Linear).** Membership is a badge with a check *and* the word *Joined*, in its own
  column; teams the reader has not joined show nothing there.
- **observed (S17, Neon).** The current organization is named in the top bar with a plan chip
  (*LAUNCH*) and a chevron; the project list marks none as current.
- **interpretation.** The two marks found are a ring (shape only, Slack) and a worded badge
  (Linear). Only the worded one says what it means without being learned, which is the property
  the spec's requirement 16 asks for (*open on this machine* in words).

## 3. What a card carries, and the icon on it

- **observed.** Every product puts an identifying glyph before the name: Linear's coloured tile
  (S1), Turso's kind icon in a tile (S12), Slack's workspace icon (S14), Vercel's avatar (S3),
  GitHub's avatar (S11). Facts sit in muted, smaller text under or after the name; chips carry
  short categorical words (*Production*, *Latest*, repository, *Joined*).
- **observed (S3, S5).** Vercel's card heading has the name and one act at its end (*Visit*); the
  facts come in short lines beneath, each led by a dot or an icon.
- **interpretation.** Rentable's current tile (name heading, then one fact per line led by an icon)
  already matches the Vercel shape. What it lacks against these pictures is a leading glyph for
  the workspace itself; the plan's `building` glyph for the section is the available one.

## 4. How acts are reached

- **observed (S6, Notion).** A teamspace's `...` button, shown on its sidebar row, opens a menu:
  *Add pages* (with a submenu chevron), *Add members*; a separator; *Teamspace settings*,
  *Duplicate teamspace* (with a muted second line explaining it), *Leave teamspace*, and
  *Archive teamspace* in red, last.
- **observed (S7, Notion).** The page context menu (right-click) is the same kind of list: *Delete*,
  *Duplicate* with its shortcut, *Copy link*, *Rename* with its shortcut; a separator; *Move to*;
  a separator; a muted footer *Last edited by ... Today at 5:14 PM*.
- **observed (S11, S17).** GitHub and Neon reach a row's acts from an ellipsis at its end.
- **observed (S8, 1Password.com).** A vault's own page carries its acts as rows in rounded cards
  beneath the name form: *View Vault*; then *Import Data* and *More Actions* with an ellipsis, in
  one card divided by a hairline. Import is an act *of the vault*, reached from it.
- **observed (S10, 1Password 8).** Export is a sheet: the account, a password field, a choice of
  format with a muted line under each, and a blue info callout (*Make sure to save unencrypted files
  in a safe location ...*) above *Export Data*.
- **interpretation.** The ellipsis on the item and the same list on right-click (Notion) is the
  pattern rentable's record card already has. Notion groups acts by separators and puts the
  destructive one last and red; 1Password puts import on the vault, as requirement 15 puts export
  and import on the workspace card.
- **not found.** No product viewed shows an act *disabled with its reason* in these menus; every
  one simply omits what the reader may not do (Notion's member view is not pictured). Rentable's
  rule of showing refusals with the reason is its own and has no picture against it.

## 5. The settings card itself (for coherence with the other tabs)

- **observed (S15, Supabase).** A section heading (*Transfer Project*, medium) and a muted
  sentence sit above a bordered rounded card; inside, one row: a small leading icon, a title, a
  muted two-line description, and an outline button (*Transfer project*) at the end.
- **observed (S16, Supabase).** *Database Settings* holds a card titled *Connection info* in its
  header, then label-and-value rows (label at the start, a read-only field with a *Copy* button at
  the end). The next card (*Database password*) is a single row: title, muted description, and an
  outline button at the end.
- **observed (S13, Turso).** A card titled *Configuration* in a header divided from its rows; each
  row a bold title, a muted description, and a switch at the end, rows divided by hairlines.
- **observed (S2, Linear team overview).** Groups (*Team sync notes*, *Processes*) are titled with
  a disclosure triangle and a trailing hairline, not boxed; a side column lists *Members* (avatar
  stack and *110*) and *Go to* links.
- **interpretation.** Supabase and Turso, the two database products, converge on one anatomy: a
  card with a header (title, optional description) and rows of *icon, title, muted description,
  control at the end*, divided by hairlines. This is the shape `settings-group` and `settings-row`
  in the plan already describe, which makes it the natural shared anatomy for all four tabs.

## 6. The callout for records left by an earlier version

- **observed (S10).** 1Password's warning about the exported file is a tinted info callout with an
  icon, inside the flow, above the act it concerns.
- **observed (S5).** Vercel's card footer *Continuously deploy with our Git integration.* carries a
  muted *Dismiss* at its end: an offer that can be put away.
- **not found.** No product viewed shows an import-of-leftover-data offer on a directory; the two
  pictures are the nearest shapes.

## 7. What is true of rentable today (from the code)

- The directory draws `RecordCard` with `layout="tile"` in a single `flex-col` (`directory.svelte`),
  so the tiles stack one per line at every width.
- `acts.ts` declares `workspace.edit`, `workspace.members`, `workspace.export`, `workspace.import`
  and `workspace.delete`. There is no *open* (switch) act among them; the brief's list
  ("open, rename") does not match the declaration. Whether switching belongs on the card is an
  open question (the workspace control of effort 843 owns switching).
- The callout component (`app-database-records.svelte`) already uses the `callout` primitive with
  `archive-restore`, and its comment places it between the tray and the cards.

# Proposal derived from the findings (not a decision)

**One anatomy for all four tabs, named *settings card*.** A `settings-group` card: rounded, `bg-card`,
the record card's ring and raised shadow; a header with a title (`text-sm font-medium`) and an
optional one-line muted description; rows built on `item` (leading icon, name, muted value or
description, control at the end as an outline `sm` button), divided by hairlines; destructive rows
last after a separator. (S13, S15, S16, S18.) A directory is the same card with a tray in its header
and record tiles as its body, so the workspaces tab is one full-span settings card.

**The workspace tile** (S3, S1, S12, S6):

- heading: a `building` icon in a small muted tile, the name (`text-sm font-medium`), and, on the
  open one only, a `badge` (variant secondary) with the disc and *Open on this machine*, the words
  doing the marking (Linear's worded badge, not Slack's ring); the ellipsis at the end;
- facts, `text-xs` muted, one to a line, icon first: members (`users`), the reader's access
  (`crown`, `pencil`, `eye`, `user-cog`);
- acts in the dropdown and the context menu alike, grouped by separator: *Edit*, *Members*; *Export*
  (`file-down`), *Import* (`file-up`); *Delete* last in the destructive tone; refused acts stay
  listed with their reason;
- the grid: tiles in `columnsFor(width, 300, 12, 3)`, so two columns at about 900 px and three at
  about 1300 px, source order kept; no list/grid toggle (few workspaces); no *add* tile, since the
  tray's *New workspace* is the one create.

**The callout** stands between the tray and the grid, full width, `callout` variant info with
`archive-restore`, its sentence naming the open workspace, *Bring in* (outline) and *Not now*
(ghost) at its end (S10, S5).

```
+- Workspaces ------------------------------------------------------------+
|  Workspaces                                                              |
|  Each workspace keeps its own records and members.                       |
|  [ Search workspaces...      ]  [Sort v]               [+ New workspace] |
|                                                                          |
|  (i) Records from an earlier version are on this machine. Bring them     |
|      into Riyadh holdings?                     [Bring in]  [Not now]     |
|                                                                          |
|  +-------------------------+ +-------------------------+ +-------------+ |
|  | [B] Riyadh holdings  [.]| | [B] Jeddah towers    [.]| | [B] Dammam  | |
|  |  (o) Open on this machine| |  users  2 members       | |  ...        | |
|  |  users  4 members       | |  eye    You may read    | |             | |
|  |  pencil You may edit    | |                         | |             | |
|  +-------------------------+ +-------------------------+ +-------------+ |
+--------------------------------------------------------------------------+
```

(`[B]` the building tile, `[.]` the ellipsis, `(o)` the disc. The badge may sit in the heading at
three columns only if the name keeps room; at two columns it reads as the first fact line, as today.)

# Open questions

- Whether the open workspace's badge belongs in the heading or as the first fact line is a
  width question for the screenshots on real data, both languages.
- Whether a workspace card should carry *open here* (switch) as an act; it is not declared today.
- No viewed product shows a refused act with its reason; the look of that entry stays rentable's.
- Not reached: Figma (help centre pages returned no screenshots or 402/404), Raycast (manual pages
  carry only logos), Arc (no images in the help page), PlanetScale (no images in the page fetched).
