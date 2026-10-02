---

---

# Question

What do well-made products' general, appearance, update and about screens look like when read
from their actual screenshots, and what card design does that suggest for rentable's general tab
(language, appearance, updates, diagnostics), in a shape the account, organization and workspaces
tabs can share?

Asked after the human's words of 2026-10-02: "in the settings the tabs remaine the same but each
section it's text its everyhthing is a card; so each follows a card ... the reasrch should be
looking at picture of desgins of such sections and as a whole ... my issue is with the ui and it's
how presented in the settings in each tab it's sections".

Builds on
[[efforts/846-the-settings-and-the-record-cards-are-rethought/evidence/research/how-production-apps-organize-a-settings-section]]
(cited as *prior file, finding N*), which read text pages only and listed "Screenshots of any
product" under *Not checked*. This file closes that gap for the general tab.

# What was read in the repository

At the run tree on 2026-10-02: `apps/desktop/src/lib/settings/component/{page,area,locale,appearance,updates,diagnostics}.svelte`,
`packages/design/src/lib/block/settings-{group,row}.svelte`, the primitive list under
`packages/design/src/lib/primitive/`, and the effort's spec (requirements 1 to 5) and plan.

- **observation.** General today is three blocks in one column (`area.svelte`, `data-general`,
  `flex-col gap-6`): an untitled group holding the language row and the appearance row with one
  footer line (`preferencesFooter`); *updates*, a titled group with a *current version* row and an
  *available version* row whose control holds install or restart and *check for updates*, then,
  outside the group, a separate bordered box for release date and notes and a hand-drawn progress
  bar; *diagnostics*, a titled group with one row (folder, path as value, *reveal*).
- **observation.** A group's title sits **above** the card as muted small text, and its footer
  line sits **below** the card (`settings-group.svelte`). The card holds only rows.
- **observation.** The design package has `item`, `collapsible`, `callout`, `badge`, `progress`,
  `toggle-group`, `select`, `switch`, `separator`, `button`, `tooltip`, `skeleton`. It has **no
  `card` primitive**; the card today is `Item.Group` with `rounded-2xl border bg-card`.
- **observation.** The update download draws its own bar (`h-2 rounded-full bg-muted`) rather than
  the `progress` primitive, and the release notes live in a second card detached from the row they
  describe.

# Screenshots viewed

All downloaded and viewed on 2026-10-02. None is copied into the repository. Products: Apple macOS
System Settings, Microsoft Windows 11 Settings and its settings controls, Linear, Raycast, Zed,
VS Code, Vercel, GitHub (8 products, 15 images).

1. **Apple, macOS Tahoe 26, Software Update, update available.**
   https://cdsassets.apple.com/live/7WUAS350/images/macos/tahoe/macos-tahoe-26-system-settings-general-software-update-update-now.png
   (from https://support.apple.com/en-us/108382). One rounded box per concern, stacked, about 20 px
   apart, no titles above them. The update box: the OS icon, the release name as the title with
   "26.1 · 7.18 GB" muted under it, *Update Tonight* and *Update Now* as two grey buttons at the
   trailing edge plus an info (i) button; a hairline, then the release description and a link
   inside the same box; another hairline, then "Once downloaded ... about 20 minutes. More Info..."
   as the box's own footer. Below: an *Installed* box (name leading, "macOS Tahoe 26.0.1" muted
   trailing), an *Automatic Updates* box ("On" plus (i)), and a box of legal text.
2. **Apple, same pane, up to date.**
   https://cdsassets.apple.com/live/7WUAS350/images/macos/tahoe/macos-tahoe-26-system-settings-general-software-update-check-for-update-mac-is-up-to-date.png
   The update box becomes a **status header**: a green rounded square with a check, "Your Mac is
   up to date." as title, "macOS Tahoe 26.1" muted below, one button, *Check for Update*, trailing.
   The installed version is not a separate row here; it is the status line's subtitle.
3. **Apple, macOS Tahoe 26, Wi-Fi > Advanced sheet.**
   https://cdsassets.apple.com/live/7WUAS350/images/macos/tahoe/macos-tahoe-26-system-settings-wi-fi-advanced-more-options-auto-join-remove-from-list.png
   (from https://support.apple.com/en-us/102480). Bold group title **above** a box ("Require
   administrator authorization to"); a one-row box per unrelated fact ("Wi-Fi MAC address" with
   the value muted trailing, in a box of its own); a table-like box for known networks with a
   per-row ellipsis menu holding *Remove From List*. Behind it, the main pane's first box is the
   Wi-Fi header: icon, title, a description sentence, the switch trailing.
4. **Windows 11 Settings Home.**
   https://blogs.windows.com/wp-content/uploads/prod/sites/44/2023/06/settings-homepage-1024x758.png
   (from https://blogs.windows.com/windows-insider/2023/08/24/announcing-windows-11-insider-preview-build-22621-2262-and-22631-2262-beta-channel/).
   **The one screenshot found of settings laid as a grid of cards**: two columns of unequal-height
   cards, start-aligned per column. Each card carries its **own title inside it** ("Recommended
   settings", "Personalize your device", "Cloud storage", "Never lose access to your account"),
   a description line under the title, then either rows (glyph, name, chevron) separated by
   hairlines, or a body (a usage bar, "0 used of 1.0 TB (0%)") and **one button at the card's
   foot** (*View details*, *Add now*). The right column's cards lead with a coloured glyph above the
   title; one has an "Active" badge at the top trailing corner. Above the grid, a strip of status:
   the device with *Rename*, and "Windows Update · Last checked: 59 minutes ago" with its icon.
   The *Color mode* row inside "Personalize your device" holds a dropdown (Light). This is a home
   page of shortcuts, not a pane of preferences; the Windows panes themselves are single column
   (prior file, finding 1).
5. **Windows Community Toolkit, SettingsCard.**
   https://devblogs.microsoft.com/ifdef-windows/wp-content/uploads/sites/61/2022/11/SettingsCard.png
   (from https://devblogs.microsoft.com/ifdef-windows/windows-community-toolkit-labs-experiments-are-here/).
   One card, one row: outline glyph leading, header, smaller description under it, "On" and a
   switch trailing. Low-contrast border, 4 to 8 px radius, about 68 px tall.
6. **Windows, a SettingsCard in dark.**
   https://user-images.githubusercontent.com/24302614/169622596-f8f41b96-a99b-48ff-a480-6280e3bca2c5.png
   (from https://github.com/CommunityToolkit/Labs-Windows/discussions/129). Same anatomy in dark:
   the card is a slightly lighter fill than the page, no visible border.
7. **Windows app settings, About expander.**
   https://learn.microsoft.com/en-us/windows/apps/design/app-settings/images/appsettings-about.png
   (from https://learn.microsoft.com/en-us/windows/apps/design/app-settings/guidelines-for-app-settings).
   Section header "About" above; one card: app icon, app name, copyright muted; "Version
   11.2603.9.0" muted trailing, then a chevron. Collapsed, the version still shows. *Help* and
   *Feedback* sit below as links outside the card.
8. **Windows app settings, App theme.**
   https://learn.microsoft.com/en-us/windows/apps/design/app-settings/images/appsettings_mode.png
   Section header "Appearance & behavior"; one card: palette glyph, "App theme", "Select which app
   theme to display"; the control is a dropdown of Light, Dark, Use system setting.
9. **Linear, Preferences.**
   https://webassets.linear.app/images/ornj730p/production/4f79d61790a704d7e47e00611e8615a30f932979-2084x1633.png
   (from https://linear.app/docs/account-preferences). Page title, then section titles ("General",
   "Interface and theme") as plain text **above** each card. A card is rows split by inset
   hairlines; each row is title plus a muted one-line description, the control trailing (select,
   switch, a text-button "Customize"). **No glyphs on rows.** *Interface theme* sits in a card of
   its own just below its section's card, about 16 px apart, a single row. One column, content
   about 880 px wide.
10. **Raycast, Settings > Account (macOS).**
    https://fz1sd71lwhbqy6sh.public.blob.vercel-storage.com/raycast/images/app/basics/mac-settings-account.png
    (from https://manual.raycast.com/settings). Sidebar with coloured icon tiles; the pane: a
    centred identity header (avatar, name, handle and email), then section titles above cards:
    "Subscriptions" (rows with title, two-line description, "Active" in green text trailing) and
    "Account" (*Manage Account* with an external-link arrow; **Sign Out in red text as the last row
    of the same card**). One column.
11. **Raycast, Settings > Advanced.**
    https://fz1sd71lwhbqy6sh.public.blob.vercel-storage.com/raycast/images/app/basics/mac-basics-settings-advanced.png
    Cards of two rows under titles "Export", "Connection"; each row title plus muted description,
    control trailing (select, password field, switch, *+ Add File* button). A long description is
    truncated with **"Show more"** inline rather than folding the row.
12. **Zed, settings UI prototypes.**
    https://images.zed.dev/blog/settings-ui/prototypes.webp (from https://zed.dev/blog/settings-ui).
    Tabs across the top for scopes; a tree of categories at the start; the pane is one column of
    rows under small uppercase section labels ("PROJECT PANEL", "TERMINAL") with hairlines; **no
    cards at all**, title plus description, control trailing (switch, select, stepper).
13. **VS Code, Settings editor.**
    https://code.visualstudio.com/assets/docs/configure/settings/settings-editor-user-tab.png
    (from https://code.visualstudio.com/docs/configure/settings). Search, *User / Workspace* tabs,
    "Last synced: 0 secs ago" at the trailing end of the tab row; a document of settings: bold
    category heading, setting name, description, control **below** the description. No cards.
14. **Vercel, Delete Project.**
    https://7nyt0uhk7sse4zvn.public.blob.vercel-storage.com/docs-assets/static/docs/concepts/projects/delete-project-light.png
    (from https://vercel.com/docs/projects/managing-projects). The web dashboard card: **bold title
    inside the card**, a description sentence, a separator, a body (what will be deleted), and a
    **grey footer band** holding the act at the trailing end (red *Delete*).
15. **GitHub, Appearance > Theme preferences.**
    https://docs.github.com/assets/cb-49593/images/help/settings/theme-mode-drop-down-menu.png
    (from https://docs.github.com/en/get-started/accessibility/managing-your-theme-settings). Page
    heading with a rule, a paragraph, a label with a select and helper text beside it, then
    **visual preview tiles** for each theme. No card around the controls.

# Findings

*observation* = what the pictures show. *interpretation* = what follows, labelled.

## 1. Two families of settings card, and the split is by platform

- **observation.** Desktop and OS panes (Apple 1 to 3, Windows 5 to 8, Linear 9, Raycast 10 and
  11) put the **group title outside, above the card**, and fill the card with **rows**: name (with
  or without a description) leading, value or control trailing, inset hairlines between rows.
- **observation.** Web dashboards and home pages (Windows Home 4, Vercel 14) put the **title and
  description inside the card**, with a body and **an action footer** at the card's foot.
- **observation.** Editors (Zed 12, VS Code 13) and GitHub 15 use no cards: a document of rows.
- **interpretation.** The human's "everything is a card", read with "cards and section of grids",
  matches family two (title inside), and only that family was seen laid in a grid (Windows Home
  4). Family one stacks in one column in every picture seen.

## 2. Status leads; the version is a subtitle, not a row

- **observation.** Apple's update box is a status header: icon tile, a sentence of state ("Your Mac
  is up to date."), the version muted beneath, one act trailing (2). With an update, the header
  names the release, its size beneath, the acts trailing, and the notes and duration live **inside
  the same box** below hairlines (1). The installed version gets its own one-row box only when an
  update is offered.
- **observation.** Windows Home shows update status as "Last checked: 59 minutes ago" (4); the
  Windows About card shows the version on the collapsed header (7).
- **interpretation.** rentable's *available version: unknown* row answers a question with a
  non-answer. The pictured pattern says the state in a sentence ("up to date", "version x is
  available", "checking...", "restart to finish") and puts the version beneath it.

## 3. Glyphs: per row on Windows and rentable; per card or none elsewhere

- **observation.** Windows rows carry an outline glyph (5, 6, 8). Apple panes put an icon on the
  card's header row only (1, 2, 3), none on plain rows. Linear, Raycast, Zed show no row glyphs.
  Windows Home puts one coloured glyph at the top of a card (4).
- **interpretation.** A glyph per card header (and per row where rows are distinct things) is
  consistent with Apple and Windows; spec requirement 1 asks for a glyph per row, which Windows
  supports and Apple does not contradict.

## 4. Destructive acts: last, red text, in the card

- **observation.** Raycast's *Sign Out* is red text, last row of its card (10); Apple's *Remove
  From List* is in a per-row menu (3); Vercel's *Delete* is a red button in the card's footer band
  (14). None was folded away.

## 5. Disclosure is rare and small

- **observation.** Only Windows About shows a chevron expander, version visible when closed (7).
  Raycast truncates a long description with an inline "Show more" (11). Apple shows release notes
  open inside the update box (1). No picture folds a whole group.

## 6. Density and type

- **observation.** Card radius about 8 to 12 px (Apple larger), cards 12 to 20 px apart, rows 44 to
  68 px with 16 to 24 px padding; titles regular or medium weight at body size, descriptions one
  step smaller and muted, values muted at the trailing edge (all of 1 to 11). Dark cards are a
  lighter fill than the page with little or no border (6, 9, 10, 11).

## 7. Appearance controls

- **observation.** Windows uses a dropdown (8, and 4's Color mode); Linear a select with a swatch
  (9); GitHub preview tiles (15). Apple's Appearance pane was not viewed (see *Not found*).
- **interpretation.** rentable's three-button segmented choice with glyphs is a valid shape (prior
  rule, *Field kinds*); nothing seen argues for replacing it.

# Proposal, for the orchestrator to decide

*Inference from the findings; the choice is the orchestrator's and the human's.*

**One card anatomy for all four tabs** (call it the *settings card*), family two since the human
asked for cards in a grid:

```
+-------------------------------------------------+
| [glyph] Title                    [badge|status] |  header: Item.Media + title (text-base,
|         one muted line: what this card is for   |  medium) + description; optional badge
|-------------------------------------------------|  trailing (Windows Home 4, Apple 2)
| [g] Row name               value   [control]    |  rows: settings-row as today, inset
| [g] Row name               value   [control]    |  hairlines (Apple 1, Linear 9)
|-------------------------------------------------|
| footer (optional): note, progress, or one act   |  Vercel 14, Windows Home 4, Apple 1
| [end rows: destructive, error tone, always last]|  Raycast 10
+-------------------------------------------------+
```

That moves today's group title and footer line **into** the card (settings-group gains a header
and a footer slot; title and footer outside are retired). Grid: two columns from about 720 px of
content width, one below; start-aligned, source order; growing lists and end-only cards span both
(spec requirement 1 as amended). Cards 16 px apart.

**General as cards** (three cards):

1. **Display** card: glyph `sun-moon`; title *display*;
   description *how rentable looks on this machine*; rows *language* (toggle-group) and
   *appearance* (toggle-group with glyphs). Half width.
2. **Updates** card: header is the status (Apple 2): glyph tile `package` (tone by state: neutral
   checking, success up to date, info available), title the state sentence, the current version
   muted beneath (`dir="ltr"`, tabular), *check for updates* trailing. When a release stands: a
   row *version x.y · date* with *download and install* (or *restart*), release notes in a
   `collapsible` labelled *what's new* (closed; Windows 7, prior file), and a `progress` primitive
   in the footer while downloading (indeterminate without a length; no motion under reduced
   motion). Half width, beside Display.
3. **Diagnostics** card: glyph `folder`; title *diagnostics*; description *where this machine
   records what went wrong*; one row, the path (ltr, truncated with a `tooltip` for the whole) and
   *reveal in folder*. Full width, so the path has room.

```
 1000 px content
+----------------------------+  +----------------------------+
| (sun-moon) display         |  | (check) up to date         |
| how rentable looks here    |  |  version 0.14.2  [check]   |
|----------------------------|  |----------------------------|
| (lang) language [en | ar ] |  | (download) 0.15.0 · oct 1  |
| (sun) appearance[sys|l|d]  |  |       [download & install] |
+----------------------------+  | > what's new               |
                                |  [=====-----] 48%          |
                                +----------------------------+
+-------------------------------------------------------------+
| (folder) diagnostics   where this machine records failures  |
|  C:\Users\...\logs                     [reveal in folder]   |
+-------------------------------------------------------------+
```

Primitives: `item` (rows and header), `toggle-group`, `button` with glyph, `badge` only if a state
needs a word chip, `collapsible`, `progress`, `separator`, `tooltip`, `callout` for a failed check
only if a toast is judged too fleeting (today's announcement stays a toast). No save step; the
toggles apply at once (spec requirement 4).

# Confidence

- High on what the 15 pictures show; each was viewed.
- Medium on the grid: one picture (Windows Home 4) shows settings cards in two columns, and it is
  a home page of shortcuts, not a preferences pane; every preferences pane seen is one column.
- Medium on the status-header pattern transferring to an app updater: Apple's is an OS updater.

# Not found or not viewed

- Apple's macOS Appearance pane and General > About: the Mac user guide pages fetched served no
  image URLs in their HTML.
- Things 3, Arc, Notion, Slack, Figma, 1Password, Obsidian, Chrome: their help pages served no
  settings screenshot in fetched HTML; not viewed.
- Microsoft support's Windows Update and Colors images: the media URLs returned HTML, not images.
- Design galleries (nicelydone, saasframe, refero): not reached; they serve images behind script.
