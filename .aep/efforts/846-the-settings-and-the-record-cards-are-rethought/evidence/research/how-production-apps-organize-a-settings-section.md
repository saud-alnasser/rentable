---

---

# Question

How do production-grade, well-designed applications organize a settings area within one section,
and where do they use disclosure (collapsibles, expanders, "Advanced" and "Details" buttons) rather
than always-visible groups, cards and grids? Mapped onto rentable's four settings sections (general,
account, organization, workspaces) and the primitives in `packages/design/src/lib/primitive/`.

Asked after the human's two remarks of 2026-10-02: "maybe settings in a section tab does not need
to be sequential linear maybe they are cards and section of grids" and "it feels you are not
utilizing all primitives in the ui components; why not use collapsibles and follow how production
grade well-designed apps designs on settings and how they organize it".

Builds on
[[efforts/846-the-settings-and-the-record-cards-are-rethought/evidence/research/how-apple-and-google-present-account-security-and-membership]]
and does not repeat it. Its findings 1 (devices), 2 (connections), 3 (leaving), 4 (sync status)
are cited here as *prior finding N*.

# Sources

All read 2026-10-02. HIG pages read through their JSON data endpoint
(`developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`), as the prior
file did. Apple Mac user guide pages carried macOS 27 as their default version on that date.

- HIG Disclosure controls: https://developer.apple.com/design/human-interface-guidelines/disclosure-controls
- HIG Layout: https://developer.apple.com/design/human-interface-guidelines/layout
- HIG Lists and tables: https://developer.apple.com/design/human-interface-guidelines/lists-and-tables
- HIG Settings: https://developer.apple.com/design/human-interface-guidelines/settings
- HIG Popovers: https://developer.apple.com/design/human-interface-guidelines/popovers
- HIG Boxes: https://developer.apple.com/design/human-interface-guidelines/boxes
- HIG Buttons: https://developer.apple.com/design/human-interface-guidelines/buttons
- Mac user guide, Wi-Fi settings on Mac: https://support.apple.com/guide/mac-help/mh11935/mac
- Mac user guide, Users & Groups settings on Mac: https://support.apple.com/guide/mac-help/mtusr001/mac
- Microsoft Learn, Guidelines for app settings (Windows, WinUI), ms.date 2026-04-08: https://learn.microsoft.com/en-us/windows/apps/design/app-settings/guidelines-for-app-settings
- Microsoft Learn, SettingsExpander (Windows Community Toolkit), ms.date 2024-11-07: https://learn.microsoft.com/en-us/dotnet/communitytoolkit/windows/settingscontrols/settingsexpander
- Android Open Source Project, Android settings design guidelines, last updated 2025-02-27: https://source.android.com/docs/core/settings/settings-guidelines
- GitHub Docs, Deleting a repository: https://docs.github.com/en/repositories/creating-and-managing-repositories/deleting-a-repository
- GitHub Docs, Viewing and managing your sessions: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/viewing-and-managing-your-sessions
- Vercel Docs, Managing projects, last updated 2026-08-11: https://vercel.com/docs/projects/managing-projects
- Linear Docs, Workspaces: https://linear.app/docs/workspaces
- Linear Docs, Security and access: https://linear.app/docs/security-and-access
- Stripe Docs, Web Dashboard (settings categories): https://docs.stripe.com/dashboard/basics
- Notion Help, Account settings: https://www.notion.com/help/account-settings
- GOV.UK Design System, Details: https://design-system.service.gov.uk/components/details/
- GOV.UK Design System, Accordion: https://design-system.service.gov.uk/components/accordion/
- Nielsen Norman Group, Progressive Disclosure (Jakob Nielsen, 2006-12-03): https://www.nngroup.com/articles/progressive-disclosure/
  (usability research firm's own article; primary for its claim, older)

Repository, read at `4650e1fd` on this branch: the spec and plan of effort 846, ticket 21,
[[rules/interface]] (*Tone*, *Form surface* on the 838 folding groups, *Error* on the detail
disclosure, *Switching sections*), `packages/design/src/lib/block/settings-{group,row}.svelte`,
`packages/design/src/lib/primitive/{collapsible,item}/`, `packages/design/src/lib/tokens.css`
(*Reduced motion*), `apps/desktop/src/lib/error/component/detail-disclosure.svelte`, and the
sections' components under `apps/desktop/src/lib/{settings,organization}/component/`.

Text pages give no screenshots. Visual claims are recorded only where a source states them in
words; where this file states what a product looks like without such a source, it says
*unverified*.

# Findings

## 1. A section's layout: one column is what every guideline found prescribes

- **source (Microsoft, Windows app settings).** "Present content from top to bottom in a single
  column, scrollable if necessary." "Use a scrollable layout with a constrained max width (around
  1000–1100 px)." "Group related settings under section headers using the **BodyStrong** text
  style." Settings are built from `SettingsCard` ("a **Header**, an optional **Description**, an
  optional **HeaderIcon**, and an action control ... aligned to the right side of the card") and
  `SettingsExpander`.
- **source (Microsoft, SettingsExpander, settings page example).** The reference page is one
  `StackPanel` with `MaxWidth="1000"`, cards 4 px apart, a section header before each run of cards,
  and an *About* expander at the end.
- **source (Android, AOSP).** "Place frequently used settings at the top of the screen. Limit the
  number of settings on one screen." "If a screen has many settings, they can be grouped and
  separated by a divider ... dividers are now used to cluster settings in a group, rather than
  separating individual settings. If the settings in a group are closely related, you can add a
  group heading."
- **source (HIG Settings, macOS).** A settings window has a toolbar of panes "that each contain a
  group of related settings". **source (HIG Lists and tables).** "the grouped style uses headers,
  footers, and additional space to separate groups of data." **source (HIG Layout).** "Group related
  items ... you might use negative space, container shapes, or separator lines." "Align elements to
  make them easier to scan." **source (HIG Boxes).** Keep a box "relatively small in comparison with
  its containing view"; do not nest boxes, "use padding and alignment" for subgroups.
- **source (Vercel).** The project's General settings page is read top to bottom: "find the **Pause
  Project** section above **Delete Project**"; "At the bottom of the **General** page, you'll see
  the **Delete Project** section."
- **source (Stripe).** "The Dashboard's settings are broken into three categories: Personal,
  Account, and Product", each a list of links to its own settings page. The settings home is an
  index of destinations, not a page of controls.
- **source (HIG Layout).** "Keep functionality the same as size classes change ... you can change
  the amount of functionality that's visible onscreen as the amount of space changes."
- **not found.** No primary source read here recommends laying a section's groups of settings
  controls out as a multi-column grid of cards. The only grid-like settings surfaces found are
  index pages of destinations (Stripe's settings home, by its text). The Google Account home and
  Security page are commonly described as cards; no Google text page states their layout
  (*unverified*, as the prior file also noted).
- **interpretation.** The human's request for "cards and section of grids" has no guideline
  behind it and one explicit guideline against it (Microsoft). It is not forbidden by Apple, whose
  text speaks of groups and boxes and is silent on columns. A grid is defensible where the groups
  are independent, short, and of similar height, and where source order is reading order (the
  plan's rejection of masonry keeps that).

## 2. What is disclosed on demand, and the rules for it

- **source (HIG Disclosure controls).** "Use a disclosure control to hide details until they're
  relevant. Place controls that people are most likely to use at the top of the disclosure
  hierarchy so they're always visible, with more advanced functionality hidden by default."
  "Provide a descriptive label ... like 'Advanced Options.'" For a disclosure *button*: "Place [it]
  near the content that it shows and hides" and "Use no more than one disclosure button in a single
  view."
- **source (HIG Layout).** "Use progressive disclosure ... Use disclosure triangles, menus, or
  nested views to reduce how much content to initially display."
- **source (Apple, Wi-Fi settings, macOS 27).** The pane shows the Wi-Fi switch and the current
  network with its status; "Click Details to change or view the settings below" (per-network
  settings); "Click Advanced to change or view the settings below" (known networks, MAC address,
  administrator requirements). Removal: "Forget This Network" from a More button.
- **source (Apple, Users & Groups, macOS 27).** "Click [the Info button] next to a user name to view
  details and make changes." **source (HIG Lists and tables).** "Use an info button only to reveal
  more information about a row's content."
- **source (Microsoft).** "Use a `SettingsExpander` when a setting has sub-options that should be
  revealed on demand. The expander shows a primary action control on the header row and additional
  `SettingsCard` items inside ... Avoid nesting expanders deeper than one level." "Combine
  less-used settings into a `SettingsExpander` so that common settings can each have their own
  `SettingsCard`." The *About* expander: "The collapsed header row should show your app name, icon,
  and version number"; expanded, links, feedback, dependencies, legal text.
- **source (Microsoft, SettingsExpander).** An expander has "the same properties as a Card": its
  own header, description, icon and control, plus `Items`, an `ItemsHeader` and an `ItemsFooter`
  (the sample puts an "Add a device" button in the footer).
- **source (Android).** "Settings that are not frequently used should be hidden. Use 'Advanced'
  only when there are at least 3 items to hide. Here, the subtext shows the titles of the settings
  that are hidden. The subtext should be only one line."
- **source (GOV.UK, Details).** "Use the details component to make a page easier to scan when it
  contains information that only some users will need." "Do not use the details component to hide
  information that the majority of your users will need." Research: some users do not open it,
  thinking it leaves the page; some voice-control users struggle with it.
- **source (GOV.UK, Accordion).** "Do not use an accordion for content that all users need to
  see"; "Well-written and structured content ... can remove the need to use an accordion"; avoid
  nesting accordions.
- **source (NN/g).** "Initially, show users only a few of the most important options. Offer a
  larger set of specialized options upon request." The split must be right and "It must be obvious
  how users progress"; more than two levels of disclosure "typically suffer poor usability".
- **interpretation.** Every source agrees on the test: disclose what *few* readers need, keep what
  *most* need or what reports a condition in view, label the disclosure by what it holds, keep it
  to one level. Microsoft's expander adds a shape: the collapsed header still carries the setting's
  value or control, so collapsing hides detail and never the state.

## 3. Destructive acts: at the end, on the page, not folded away

- **source (GitHub).** "On the 'General' settings page ... scroll down to the 'Danger Zone' section
  and click **Delete this repository**", then three confirmations including typing the name.
- **source (Vercel).** *Delete Project* is a section "at the bottom of the **General** page";
  confirmation by typing the project name. *Pause Project* sits above it; resuming "does not ask
  for confirmation".
- **source (Linear).** Deletion lives in Settings > Workspace > General; an emailed code, then a
  48-hour window any admin can cancel. The page does not use a "Danger zone" heading.
- **source (Android).** "negative actions are gray" (clearing data, uninstalling, deleting);
  positive actions take the theme colour. **source (HIG Buttons).** "a destructive button uses the
  system red color"; never give it the primary role. Apple and Android disagree on colour; the
  spec's constraint takes Apple.
- **not found.** No source read here places a destructive act inside a collapsed section. Every
  product found keeps it visible at the end of the page or the item's detail.

## 4. Lists of devices and sessions

- **source (Linear).** "See your current session along with a list of other active sessions, with
  the location and date last seen for each"; more detail (IP, first sign-in) by clicking an entry;
  revoke one by hovering and choosing *Revoke access*; "**Revoke all**" removes "all other sessions
  and keep[s] your current one active".
- **source (GitHub).** Web sessions and GitHub Mobile sessions are two lists; details behind "See
  more"; "Revoke session" per web session, "Revoke" beside each mobile device.
- **source (Microsoft, SettingsExpander).** A list of items may live inside an expander with an
  `ItemsFooter` for the list's act.
- **prior finding 1.** Google lists each device with last activity and signs out one at a time;
  Apple lists devices on the account page and removes one from its detail.
- **interpretation.** The pattern is: row shows identity and last seen at a glance; secondary facts
  are one step away (click, *See more*); the list is never truncated by age; the bulk act sits at
  the list's foot and spares the current session.

## 5. Status: on the row, in words, never folded

- **source (Android).** For a setting's summary: "show the status to highlight the value of the
  setting. Show the specific details instead of just describing the title." Graphs and usage data
  "can be shown in the entity header".
- **source (Apple, Wi-Fi).** The current network and its status sit at the top of the pane, above
  *Details* and *Advanced*.
- **source (Microsoft).** "Add a descriptive message if one of the controls is disabled. Use the
  `Description` property ... to explain why the setting is unavailable."
- **prior finding 4.** Apple names sync state with a coloured status and a reason.
- **interpretation.** Status belongs to the always-visible layer. A disclosure may hold the
  *explanation's* machine detail, never the state.

## 6. Applying a change

- **source (Microsoft).** "When a user changes a setting, the app should immediately reflect the
  change — don't require a confirmation button."
- **source (HIG Popovers).** "Always save work when automatically closing a nonmodal popover."
- **observation.** Vercel's and Linear's per-card *Save* footers, which the brief recalled, were not
  confirmed in any text page read; Vercel's text only shows confirmation dialogs for pause and
  delete. Spec requirement 4 (no save step) agrees with Microsoft.

## 7. What rentable already has

- **observation (repository).** The design package holds `collapsible` (bits-ui
  `Collapsible.Root/Trigger/Content`, no styling of its own) and `item` (`Item.Root`, `Media`,
  `Content`, `Title`, `Description`, `Actions`, `Header`, `Footer`, `Group`, `Separator`).
  `settings-group.svelte` is an `Item.Group` card with a title above and one footer line below,
  and an `end` slot after a separator; `settings-row.svelte` is one `Item.Root`.
- **observation (repository).** Two disclosures already ship: the error's machine detail, closed,
  drawn only while open (`error/component/detail-disclosure.svelte`, [[rules/interface]] *Error*,
  effort 832 requirement 23), and the roles' permission groups, each folding
  (`role/component/permission-switches.svelte`, `access/component/tailoring.svelte`;
  [[rules/interface]] *Form surface*, effort 838 ticket 57, citing HIG *Disclosure controls*).
- **observation (repository).** `tokens.css` *Reduced motion* turns off every `data-state`
  animation and every transition globally, so a bits-ui collapsible already has no motion under
  reduced motion. Its trigger is a `button` with `aria-expanded`, and its content is controlled by
  `open`.

# Mapping onto rentable

*Inference from the findings above, labelled as such. Which of it to adopt is the orchestrator's
and the human's call.*

## The test applied to each group

A group may fold only if (a) most readers do not need it on most visits (GOV.UK, NN/g, Android),
(b) it reports no condition the reader must see (finding 5), (c) it is not a destructive act
(finding 3), and (d) its collapsed header still shows its value or state (Microsoft expander). Read
against the plan's settings table, **few of rentable's groups pass**: the section already holds only
what the HIG calls general, infrequently changed settings, there are no advanced options of the
Android "three or more" kind, and most groups are one or two rows. The honest answer to "use
collapsibles" is a handful of places, not a pattern across the area. Folding more would hide what
the spec requires to be visible.

**Where folding would hide something the reader needs at a glance, and must not be done:**

- **Sync** (organization). Its state, last reached, and any problem with its act are the reason the
  group exists (requirement 12; prior finding 4; finding 5). Never inside a collapsible.
- **The Turso account when not held here** (organization). A reconnect the owner must take.
- **The ownership offer** (account), when one stands. An act waiting on the reader.
- **The machines list** (account). Rows sort by last seen, so a "show more" fold would hide the
  oldest machine, which the spec names as the one a reader most needs to end (requirement 9).
  Linear, GitHub, Google and Apple show the whole list.
- **Leaving** and every other *end* row. No product found folds a danger zone; the HIG keeps
  commands in the main interface.
- **The earlier-records callout** (workspaces). An act the reader has to take once.
- **A download in progress** (updates). Progress is status.

## Per section

Grid: `settings-grid` as planned (one column below two 340 px columns, two above, start-aligned,
source order). *Full* means the group spans both columns.

**General** (three short, independent groups: the case where a grid fits best).

| Group | Place | Disclosure | Primitives |
| --- | --- | --- | --- |
| language and appearance | half, first | none: two rows, both used | `item` rows, `toggle-group` |
| updates | half | **release notes in a `collapsible`** under the available-version row, labelled by what it holds (*what's new in {version}*), closed by default; the version, the act and the download's `progress` stay visible. Microsoft's *About* expander is the model: version on the collapsed header | `item`, `button`, `collapsible`, `progress` |
| diagnostics | half | none: one row (Android's three-item floor) | `item`, `button`, `tooltip` for a long path |

**Account** (order fixed by requirement 8).

| Group | Place | Disclosure | Primitives |
| --- | --- | --- | --- |
| ownership offered, when one stands | full, first | none (an act waiting) | `item`, `button`, `callout` if it needs a tone |
| signed in as | half | none | `item`, `avatar`, `badge` for the role |
| password | half | none | `item`, `button`, `dialog` (the change form, as now) |
| machines | full | none on the list. A row's facts beyond name, last seen and added (none today) would go behind the row, as Linear and GitHub do; with only the spec's three facts there is nothing to hide. *Sign out all other machines* in the group's `end`, as Microsoft's `ItemsFooter` and Linear's *Revoke all* | `item` rows with `badge` (*this machine*), `button`, `tooltip` for the refused single sign-out, `dialog` to confirm, `empty` when there is no other machine, `skeleton` while loading |
| this machine | full, last | none | `item` end row, error tone |

**Organization.**

| Group | Place | Disclosure | Primitives |
| --- | --- | --- | --- |
| sync | half, first | **state, last reached, sync now and the problem's callout stay visible.** Only the machine's own words behind a refusal fold, through the existing `detail-disclosure` | `item`, `badge` or the state glyph with its word, `button`, `callout`, `collapsible` (existing detail) |
| Turso account, owner only | half | none: one row whose state is the point | `item`, `button`, `dialog` for forget |
| signature or seal | half | none: one row with its preview | `item`, `button`, `dialog` |
| roles | full | the permission groups already fold inside a role (838); the directory itself does not fold | as now |
| members | full | none | as now |
| leaving | full, last | none (finding 3) | `item` rows, end rows in the error tone, `dialog`, `tooltip` for the refused handover |

With sync, Turso and the mark the section has three half-width groups; an owner's first row pairs
sync with Turso, a member's pairs sync with the mark (Turso is owner only). Sync with a callout
open grows taller than its neighbour; start alignment keeps the neighbour its own height.

**Workspaces.** The earlier-records callout (full, above) and the directory (full). Nothing to pair
in two columns, so the grid changes nothing here. No disclosure: each card's acts, export and import
included, stay in its menus by [[rules/interface]] *Record card actions*. *Open question for the
orchestrator:* whether the workspace cards themselves lay out as tiles, as requirement 18 does for
records; the spec's out-of-scope names only the member and role directories as staying one column.

## A shape for the one expander, if adopted

Microsoft's `SettingsExpander` maps onto the two existing blocks without a new pattern: a
`settings-row` whose control area ends in a `Collapsible.Trigger` (a chevron `button`, labelled by
the row's name through `labelId`, `aria-expanded` from bits-ui), and a `Collapsible.Content` under
it holding indented content, inside the same `Item.Group`. One level only (Microsoft, NN/g), at most
one per group (HIG: one disclosure button per view). The chevron mirrors in Arabic (it points
toward the inline end when closed, per HIG *Disclosure triangles*, "inward from the leading edge"),
and reduced motion is already handled by `tokens.css`. The content is drawn only while open, as
`detail-disclosure.svelte` does, so a screen reader meets nothing a sighted reader cannot see.

# Confidence

- High that the platform guidelines prescribe one column of grouped cards (Microsoft explicit,
  Android and Apple consistent) and keep status and destructive acts visible.
- High on the disclosure test (four independent sources agree).
- Medium on the web products: their text pages state placement and order but not visual layout.
- Low on Google Account's layout, which no text page states.

# Not checked

- Screenshots of any product, so card versus row treatment, red styling and column counts are not
  confirmed visually anywhere.
- m3.material.io guidance on settings and lists (script-rendered, as in the prior file); Android's
  AOSP guidelines stand in for Google.
- Raycast, 1Password and Slack settings: not read. Notion's help page lists *Log out of all your
  devices* and *Delete your account* as headings only, with no layout or device list described.
- Linear's and Vercel's in-product per-card save footers and "danger zone" styling: not stated in
  their docs.
- The macOS System Settings window layout (sidebar plus one column of grouped boxes) is common
  knowledge but was not confirmed in a text source read here.
