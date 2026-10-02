---

---

# Question

How do well-designed products draw an organization, team or workspace settings page, judged from
actual screenshots, and what card layout would that suggest for rentable's organization tab (sync,
signature or seal, Turso account, roles, members, leaving), coherent with the general, account and
workspaces tabs?

Asked after the human's words of 2026-10-02: "the tabs remaine the same but each section it's text
its everyhthing is a card ... the reasrch should be looking at picture of desgins of such sections
and as a whole". Builds on
[[efforts/846-the-settings-and-the-record-cards-are-rethought/evidence/research/how-production-apps-organize-a-settings-section]]
(cited as *prior file*), which read text pages only and marked every visual claim *unverified*.
This file is the pictures that file lacked. It does not repeat its HIG, Microsoft, Android or
GOV.UK findings.

# Method and sources

Each image below was downloaded on 2026-10-02 into the session scratchpad (not the repository) and
looked at. The *page* is where the image is published; the *image* is the file itself. Dates are
when read; product UIs change, so each finding is true of that image, not of the product today.

| # | Product | Image (source URL) | Published on |
| --- | --- | --- | --- |
| L1 | Linear, Workspace settings | `webassets.linear.app/images/ornj730p/production/903aa378bb458c634ef798c0aff3dda591da05ea-2344x1694.png` | https://linear.app/docs/workspaces |
| L2 | Linear, Team permissions | `webassets.linear.app/images/ornj730p/production/2dfa78eee5af719095be345826537353c6d8f27b-1414x748.png` | https://linear.app/docs/members-roles |
| L3 | Linear, Security & Access (sessions) | `webassets.linear.app/images/ornj730p/production/709f9a7c9139ac1a2eae0dc6494b1f04d7a29acf-1848x1264.png` | https://linear.app/docs/security-and-access |
| L4 | Linear, workspace menu | `webassets.linear.app/images/ornj730p/production/978e5db54e597de0441d6a8cf8e6dd650a237aed-1264x673.png` | https://linear.app/docs/workspaces |
| V1 | Vercel, Delete Project | `7nyt0uhk7sse4zvn.public.blob.vercel-storage.com/docs-assets/static/docs/concepts/projects/delete-project-light.png` | https://vercel.com/docs/projects/managing-projects |
| V2 | Vercel, account Email | `.../docs-assets/static/docs/accounts/account-emails-2-light.png` | https://vercel.com/docs/accounts |
| V3 | Vercel, Authentication | `.../docs-assets/static/docs/accounts/authentication-page-light.png` | https://vercel.com/docs/accounts |
| V4 | Vercel, integration needing action | `.../docs-assets/static/docs/integrations/dashboard/action-required-for-changed-permissions-light.png` | https://vercel.com/docs/integrations/install-an-integration/manage-integrations-reference |
| G1 | GitHub, organization People | `raw.githubusercontent.com/github/docs/main/assets/images/help/organizations/view-list-of-people-in-org-by-role.png` | GitHub Docs repository, `assets/images/help/organizations/` |
| G2 | GitHub, member row actions | `.../help/organizations/member-manage-access.png` | same |
| N1 | Notion, Workspace settings | `images.ctfassets.net/spoqsaf9291f/36DSq2EcSv3Q9uUUnRXdMo/9f8e7900ef53569a84c8625097bcc271/Workspace_settings_-_hero.png` | https://www.notion.com/help/workspace-settings |
| E1 | Neon, organization menu | `raw.githubusercontent.com/neondatabase/website/main/public/docs/changelog/new_org_account_settings.png` | Neon website repository, changelog images |
| E2 | Neon, project Settings General | `.../public/docs/changelog/new_project_settings.png` | same |
| E3 | Neon, delete confirmation | `.../public/docs/changelog/confirm_delete.png` | same |
| S1 | Supabase, Replication (pipelines) | `raw.githubusercontent.com/supabase/supabase/master/apps/docs/public/img/database/replication/pipelines-actions-menu.png` | Supabase repository, docs images |
| S2 | Supabase, paused project | `.../apps/docs/public/img/guides/platform/paused-90-day.png` | same |
| S3 | Supabase, Replication (2021 UI) | `.../apps/docs/public/img/blog/feb/manage-replication.png` | same |
| C1 | Clerk, iOS Organization profile | `raw.githubusercontent.com/clerk/clerk-docs/main/public/images/ui-components/ios-organization-profile-view-v2.png` | Clerk docs repository |
| T1 | Tailscale, Machines (inside a blog hero, small) | `cdn.sanity.io/images/w77i7m8x/production/2c5ef78ebffcdae62bff4256038f524444b631d6-2304x1188.png` | https://tailscale.com/blog/easier-building-with-tailscale |

Products viewed: **Linear, Vercel, GitHub, Notion, Neon, Supabase, Clerk, Tailscale** (eight).

**Looked for and not found as images:** GitHub's *Danger zone* (GitHub Docs no longer publish that
screenshot; its text is in the prior file), Vercel team General and Members pages, Slack admin,
Figma team settings, Stripe Team (its doc page carried only icons), Turso's own dashboard (its docs
repository holds no dashboard screenshots), Apple System Settings (the HIG JSON points to
illustrations, not screenshots, and Apple's support images could not be fetched). Apple's settings
look is therefore cited from text only, via the prior file.

# Findings (what each picture shows)

## 1. Card anatomy: a bordered box of rows, title above or inside

- **observation (L1).** Linear's Workspace page is one centred column about 790 px wide. Each
  group is a 1 px bordered, lightly rounded (about 8 px) box; rows inside are separated by hairline
  dividers. A row is: name (about 14 px, medium) with an optional muted one-line description under
  it, and its control or value at the trailing edge (a logo chip, an input, a select, a muted value
  "United States"). Group titles ("Time & region", "Danger zone") sit **above** the box in plain
  medium text, about 48 px of space between groups. No row icons.
- **observation (L2).** Same anatomy with a title and a muted subtitle above the box ("Team
  permissions / Choose who can..."), every row a name, a description and a select.
- **observation (V2, V3).** Vercel draws the title (about 20 px, bold) and its one-sentence
  description **inside** the card, then the content (a nested list of rows with badges and a `...`
  menu; or a row of buttons), then a **footer band** in a muted fill across the card's bottom that
  carries one hint line ("Emails must be verified...") and, in V1, the card's act at the trailing
  end.
- **observation (N1).** Notion's workspace settings are not cards: labelled fields with helper
  text, hairline separators, and an Update / Cancel pair at the foot (a save step).
- **observation (E2).** Neon's project settings lay two fields side by side (ID | name, each with
  copy or Save), then a section title and paragraph with a status glyph and word ("Protected")
  beside its act. This is the only side-by-side layout seen, and it is fields in a form, not cards.
- **not found.** No screenshot viewed shows a settings section laid as a multi-column grid of
  cards. Every settings page viewed (L1, L2, L3, V1 to V3, N1, E2) is one column, 750 to 1000 px.
  The grid in spec requirement 1 has the human's word behind it and no product picture.

## 2. A connection or status drawn as a card

- **observation (V4).** Vercel draws a connection needing attention as a row: a circular glyph,
  name and subtitle on the leading side; on the trailing side a two-line coloured status ("Action
  Required / Permissions have changed") and one primary button ("Review"). The state is words in
  colour, not only a dot.
- **observation (S1).** Supabase draws replication state twice: a diagram card per destination
  with a small green dot after its name, and a table whose STATUS column is a pill in words
  ("RUNNING" green, "STOPPED" grey), with "Caught up" or "15.99 MB" as lag. Per-row acts sit in a
  `...` menu, *Delete destination* last with a trash glyph, after a separator.
- **observation (S2).** Supabase's paused project: a large status glyph, a one-line state
  ("currently paused"), consequence text, an inset callout box with the deadline, then the primary
  act and a secondary act. The state leads; the explanation and the act follow beneath.
- **observation (E1).** Neon puts a status pill "● All OK" at the trailing edge of a menu row.
- **observation (L3).** Linear marks the current session with a green dot and green words
  "Current session" on its own card, separate from the list of others.
- **inference.** Across S1, S2, V4, E1, L3 a status is a glyph and a coloured word together,
  leading or trailing the row, with the act next to it and any explanation below. This matches
  spec requirement 12 and the prior file's finding 5.

## 3. Member lists in settings

- **observation (G1, G2).** GitHub: a search field, then *Export* and a green *Invite member* at
  the trailing edge, **above** a bordered list. The list has a header strip ("Members", filters
  "2FA", "Role") and one row per person: avatar (about 48 px), name and handle, then muted facts
  ("2FA ✓", "Private", "Owner", "0 teams"), and a `...` menu last.
- **observation (L3).** Linear's session list: a card whose header row says the count ("19 other
  sessions") with the bulk act ("Revoke all") at its trailing edge, rows of glyph, name and a
  muted "place · last seen" line, and "Show all" at the foot.
- **inference.** Both put the controls that act on the whole list (search, add, revoke all) in a
  strip at the head of the list, and the record rows below. rentable's tray over record cards is
  this pattern already; wrapping it in a further card would nest boxes (the prior file's HIG
  *Boxes*: do not nest).

## 4. The danger zone

- **observation (L1).** Linear: a plain title "Danger zone" over an ordinary bordered card (no
  red border, no red fill); one row "Delete workspace / Schedule workspace to be permanently
  deleted" with the act as red text "Delete..." at the trailing edge. Last on the page.
- **observation (V1).** Vercel: a card titled "Delete Project" with its consequence sentence
  ("permanently deleted... can not be undone"), a preview of what goes, and a solid red *Delete* in
  the footer band.
- **observation (S1).** Supabase: the delete is the last menu item, after a separator, with a
  trash glyph.
- **observation (C1).** Clerk: *Leave organization* and *Delete organization* in their own group
  below the rest, each with a leading glyph, separated from *Members* by space; neither is red in
  this picture (both use the same exit glyph).
- **observation (E3).** Neon's delete confirmation asks the name typed; *Delete* stays a dimmed
  red until it matches.
- **inference.** Every product puts the destructive act last and on its own; the tone sits on the
  act (red text or red button), not on the card's border. Clerk shows the failure the spec names in
  its problem: two different acts with one glyph and one tone.

## 5. Machines

- **observation (T1, small).** Tailscale's Machines page is a table: machine name, chips under it
  ("Subnets", "Exit Node", "SSH", "Expired Jul 24, 2026"), addresses, version and OS columns, and a
  count chip "6 machines" over it. Last-seen detail was not legible at this size.

# What this suggests for rentable (inference, for the orchestrator and the human to decide)

**Card anatomy for all four tabs.** One card = `settings-group` drawn as `Item.Group` (rounded,
1 px border, `bg-card`):
1. a header inside the card: title (text-sm, medium, foreground), optional trailing `badge`
   (for example *owner*) (Vercel V2/V3, spec addendum "each card holding its own title");
2. rows, each `settings-row`: muted leading glyph, name, value or state, trailing control, and a
   `beneath` slot for a callout and its act (L1, V4);
3. the `end` slot after a separator, holding error-tone rows (L1, S1);
4. one muted footer line inside the card at its foot (Vercel's band, without the fill).

Directories are not cards: their title takes the card title's type, the tray sits beneath it, and
the record cards follow (G1, L3), so no box nests in a box.

**Grid.** Two columns from two 340 px minimums, one below, start-aligned, source order; full span
for status that carries problems, for growing lists, and for the leaving card. At 900 to 1300 px
the content should stay capped near 1000 px (the prior file's Microsoft finding; L1 is about 790).

**Organization tab, in order:**

| Card | Span | Rows | Primitives |
| --- | --- | --- | --- |
| sync | full, first | state glyph and coloured word with *reached 2 minutes ago* under it, *sync now* trailing; a problem's `callout` and act beneath, never folded; machine detail in the existing `detail-disclosure` | item, callout, button, collapsible (existing) |
| Turso account (owner) | half | *connected on this machine* as glyph and word; not held: *reconnect* with icon; *forget* in `end` | item, badge, button, dialog |
| signature or seal | half | preview as the value, *replace* trailing; *remove* in `end`, confirmed | item, avatar-sized image, button, dialog |
| roles | full | title, tray, record cards (unchanged) | existing |
| members | full | title, tray, record cards (unchanged) | existing |
| leaving | full, last | owner: *hand over ownership* (neutral), then `end`: *disconnect this machine*, *delete organization* last; member: *disconnect this machine* alone; each row carries its consequence as an `Item.Description` line | item, button, dialog |

A member sees no Turso card, so the seal card stands alone at half width, start-aligned.

```
 sync ─────────────────────────────────────────────────────────────┐
 │ (✓) up to date                                    [↻ sync now]  │
 │     reached 2 minutes ago                                       │
 │ [! callout: the problem and its act, when there is one]         │
 │ this machine and turso keep the same records.                   │
 └─────────────────────────────────────────────────────────────────┘
 turso account      [owner] ┐  signature or seal ─────────────────┐
 │ (db) connected on this   │  │ (stamp) [seal preview] [replace] │
 │      machine             │  │ ─────────────────────────────── │
 │ ──────────────────────── │  │ (x) remove                (red) │
 │ (unlink) forget    (red) │  │ printed on receipts and sheets. │
 └──────────────────────────┘  └──────────────────────────────────┘
 roles                  [search] [sort] [+]
 [ role card ] [ role card ] ...            (one column, unchanged)
 people                 [search] [sort] [+]
 [ member card ] ...
 leaving ──────────────────────────────────────────────────────────┐
 │ (⇄) hand over ownership       another member takes the org [›]  │
 │ ─────────────────────────────────────────────────────────────── │
 │ (⎋) disconnect this machine   a new link brings you back  (red) │
 │ (bin) delete organization     nothing brings it back      (red) │
 └─────────────────────────────────────────────────────────────────┘
```

# Open

- Whether the leaving card keeps a heading word like *leaving* or Linear's *danger zone*; no
  picture settles it, and Clerk shows none.
- Whether a lone half card (member's seal) should span instead; no source viewed speaks to it.
- Apple's own settings look was not seen in a picture here; HIG precedence rests on text.
