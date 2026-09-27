---

---

# Question

How do production applications and the design guidelines they follow (Apple's HIG first) present
(1) a role's permissions for editing, (2) a per-member override of a role, and (3) a role's summary
in a directory; which icons they use and how; and what Arabic/RTL and accessibility require, so
that rentable's role editor, member override editor and roles directory card can be made minimal
and guiding for about thirty editable flags (ten administrative, five record kinds by four verbs)
under an XOR override?

Asked by the human during effort 838, 2026-09-27: "The selection of permissions on role
create/edit, and the override in the member edit, needs to be more minimalistic ... Also the roles
directory cards need to show permissions better: use icons better, better labels, a better way to
show it." Researched 2026-09-27 against the `_run` worktree of effort 838 (HEAD `7dfcc3a4` era,
clean) and the sources below.

**The human's direction, given mid-research (2026-09-27), which the findings are read against
rather than replace:** (1) turning a permission on or off is a **switch**, not a checkbox and not a
matrix of cells; (2) the member override editor shows the member's **role at the top**, then the
switches set to **what the member ends up with**; where any switch differs from the role the member
reads as **custom** (the role's name with a "custom" mark), and a **reset** puts them back on the
role exactly, clearing the override. The role editor and the override editor share one switch
list, grouped by record kind and administration, with icons and one-line labels, and the XOR stays
invisible. Section 6 below is the research that direction asked for; sections 1 to 5 were written
before it arrived, and where they point elsewhere (a matrix, checkboxes) the Conclusion says so.

**A tension in the brief, named.** `agents/researcher` returns findings, never decisions; the brief
asks for a recommended design. The last section of the Conclusion is therefore labelled
*interpretation*: what the findings point to, ranked, with trade-offs, for the orchestrator and the
human to decide. It changes no spec and no rule.

# Sources

All read 2026-09-27. Primary unless marked.

Rentable itself (observation):
- `packages/workspace-permission/index.ts` (`FLAGS`, `FAMILIES`, `OWNER_ONLY`, `BUILT_IN`, `effective`)
- `apps/desktop/src/lib/organization/role.ts` (`EDITABLE_FAMILIES`, `flagName`, `flagPhrase`, `carriedIn`)
- `apps/desktop/src/lib/organization/component/roles.svelte` (the roles directory)
- `apps/desktop/src/lib/organization/component/role-editor.svelte` (create and edit)
- `apps/desktop/src/lib/organization/component/member-override.svelte`, `member-role.svelte`, `member-sheet.svelte`, `members.svelte`
- `apps/desktop/src/lib/i18n/en/index.ts` lines 1360-1470 and `ar/index.ts` lines 1255-1340 (`families`, `flagVerbs`, `flags`, `roleList`, `override`)
- `apps/desktop/src/lib/layout/destination.ts` (navigation glyphs), `lib/dashboard/component/landing.svelte` (coins)
- `.aep/rules/interface.md` (*Field kinds*, *Form surface*, *Status presentation*, *Guidance*), `.aep/rules/frontend.md` (icons, RTL)
- The effort's `spec.md` (requirements 1-7, 12; Risks: XOR drift)

Apple (HIG pages read as the site's own JSON at `developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`, because the HTML is script-rendered):
- Toggles: https://developer.apple.com/design/human-interface-guidelines/toggles
- Disclosure controls: https://developer.apple.com/design/human-interface-guidelines/disclosure-controls
- Segmented controls: https://developer.apple.com/design/human-interface-guidelines/segmented-controls
- Pop-up buttons: https://developer.apple.com/design/human-interface-guidelines/pop-up-buttons
- Lists and tables: https://developer.apple.com/design/human-interface-guidelines/lists-and-tables
- Icons: https://developer.apple.com/design/human-interface-guidelines/icons
- SF Symbols: https://developer.apple.com/design/human-interface-guidelines/sf-symbols
- Right to left: https://developer.apple.com/design/human-interface-guidelines/right-to-left
- Accessibility: https://developer.apple.com/design/human-interface-guidelines/accessibility
- Mac User Guide, share files and folders in iCloud Drive: https://support.apple.com/guide/mac-help/share-files-and-folders-mchl91854a7a/mac
- Notes User Guide, share notes and collaborate: https://support.apple.com/guide/notes/share-notes-and-collaborate-apd4e6e2c9a6/mac
- Apple Business, intro to roles and permissions: https://support.apple.com/guide/business/intro-to-roles-and-permissions-axm97dd59159/web
- HIG Settings: https://developer.apple.com/design/human-interface-guidelines/settings
- iPhone User Guide, block features or content with Screen Time: https://support.apple.com/guide/iphone/block-features-or-content-with-screen-time-iph3ff83f3b1/ios
- Apple Support, set up parental controls: https://support.apple.com/en-us/105121
- Apple Support, Ask to Buy (search-result text only): https://support.apple.com/en-us/105055
- iPhone User Guide, control what you share (per-app switch wording from a search snippet only): https://support.apple.com/guide/iphone/control-what-you-share-iph6e7d349d1/ios
- Mac User Guide, modifier keys (Restore Defaults): https://support.apple.com/guide/mac-help/mchlp1011/mac
- Chrome Help, site settings (Reset permissions): https://support.google.com/chrome/answer/114662

Discord:
- Developer docs, Permissions: https://docs.discord.com/developers/topics/permissions
- Help Center, Channel Permissions Settings 101 (read from the Wayback Machine's 2025 copy, the live page answers 403): https://support.discord.com/hc/en-us/articles/10543994968087
- Help Center, Setting Up Permissions FAQ (Wayback 2025 copy): https://support.discord.com/hc/en-us/articles/206029707
- Help Center, Role Management 101 (Wayback 2025 copy): https://support.discord.com/hc/en-us/articles/214836687

GitHub:
- Repository roles for an organization: https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization
- About custom repository roles: https://docs.github.com/en/enterprise-cloud@latest/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/about-custom-repository-roles
- About custom organization roles: https://docs.github.com/en/organizations/managing-peoples-access-to-your-organization-with-roles/about-custom-organization-roles

Google:
- Drive, share files: https://support.google.com/drive/answer/2494822
- Workspace Admin, prebuilt administrator roles: https://knowledge.workspace.google.com/admin/users/prebuilt-administrator-roles
- Android, request runtime permissions: https://developer.android.com/training/permissions/requesting
- Material Components for Android, Checkbox and Chip docs (the m3.material.io site did not render to the fetcher): https://github.com/material-components/material-components-android/blob/master/docs/components/Checkbox.md

Microsoft:
- SharePoint, understanding permission levels (updated 2026-07-01): https://learn.microsoft.com/en-us/sharepoint/understanding-permission-levels
- Windows apps, toggle switch guidelines (ms.date 2025-02-26): https://learn.microsoft.com/en-us/windows/apps/design/controls/toggles

Others:
- Slack, types of roles: https://slack.com/help/articles/360018112273-Types-of-roles-in-Slack
- Notion, sharing and permissions: https://www.notion.com/help/sharing-and-permissions
- Linear, members and roles: https://linear.app/docs/members-roles
- Figma, guide to sharing and permissions: https://help.figma.com/hc/en-us/articles/360039970673
- HubSpot, user permissions guide: https://knowledge.hubspot.com/user-management/hubspot-user-permissions-guide

Research and standards:
- NN/g, Progressive Disclosure (Jakob Nielsen, 2006-12-03): https://www.nngroup.com/articles/progressive-disclosure/
- NN/g, Checkboxes vs. Radio Buttons (Jakob Nielsen, 2004-09-26): https://www.nngroup.com/articles/checkboxes-vs-radio-buttons/
- NN/g, Toggle-Switch Guidelines (Alita Kendrick, 2018-07-29): https://www.nngroup.com/articles/toggle-switch-guidelines/
- NN/g, Icon Usability (Aurora Harley, 2014-07-27): https://www.nngroup.com/articles/icon-usability/
- NN/g, Data Tables (Page Laubheimer, 2022-04-03): https://www.nngroup.com/articles/data-tables/
- W3C WAI-ARIA APG, Grid pattern: https://www.w3.org/WAI/ARIA/apg/patterns/grid/
- W3C WAI-ARIA APG, Checkbox pattern: https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/
- W3C WAI Tutorials, Grouping controls: https://www.w3.org/WAI/tutorials/forms/grouping/

**Caveat on the vendor pages.** Most help pages were read through a fetcher that summarises; the
quotations below are what it returned as verbatim, and the HIG and SharePoint pages were read in
full. A help page describes the product as documented on that date, not necessarily the shipping
UI; where a finding is about what a screen looks like rather than what a page says, it is marked.

# Findings

## 0. What rentable has today (observation)

- **The vocabulary.** 38 flags: administration bits 0-9 (10 flags), owner-only bits 10-17 (8),
  and five record kinds (complex, unit, tenant, contract, payment) by view/create/edit/delete, bits
  20-39 (20). `EDITABLE_FAMILIES` leaves the owner family out, so an editor offers **30** flags.
  `BUILT_IN.member` is view+create+edit on every kind; `manager` is every flag but the owner's.
  *(`packages/workspace-permission/index.ts`, `lib/organization/role.ts`.)*
- **No dependency between a kind's verbs.** Nothing in the package, `role.ts` or
  `permission.rs` makes create, edit or delete imply view; a mask carrying *edit contracts* without
  *view contracts* is storable and editable. *(grep for depend/implies over the three files: no
  hit.)*
- **Role editor** (`role-editor.svelte`): a heavy form surface; a name tray, then six
  `Field.Set`s, one per family, each a vertical list of checkboxes, one row per flag: **30 checkbox
  rows**. A record flag is labelled with its verb alone under the kind's legend (`view` under
  `complexes`). A flag the reader does not hold is drawn disabled with "you do not hold this
  yourself." under it, repeated on every such row. The section opens with "what is ticked is on for
  everybody who holds the role." Owner-only flags are not drawn.
- **Member override** (`member-override.svelte`): six tables, one per family, **30 rows by three
  columns**: *role* (check or minus glyph), *changed* (the checkbox, which is the override bit),
  *they may* (check or minus). Ticking *changed* on a row whose role column is a check turns the
  result to a minus. The description is "the first column is what their role gives. change a flag
  for them alone, and the last column is what they may do." Each checkbox's accessible name is
  "change {flag} for them alone". It is always expanded, on both the add and the edit sheet.
- **Roles directory card** (`roles.svelte`): name, then "held by N members" at the end of the first
  line, then **one text line per family the role carries anything of**: the family's name in
  medium weight and the carried verbs as an `Intl.ListFormat` list ("complexes view, create, and
  edit"). The owner's card lists up to seven lines, including "the owner's own" with its eight acts;
  the member's card reads five near-identical record lines. No icons. Rank is conveyed only by the
  order of the list.
- **Member directory card** (`members.svelte`): the role as a `secondary` badge.
- **Glyphs already bound to the record kinds** (`destination.ts`, `landing.svelte`): complexes
  `house`, tenants `user`, contracts `scroll-text`, payments `coins` (dashboard). Units have no
  glyph of their own. Acts: create `plus`, edit `square-pen`, delete `trash-2`; `eye` is used
  nowhere. `crown` (4 uses), `lock`, `shield` (1, the role name field), `rotate-ccw` exist.
  `frontend.md`: "A concept keeps one glyph everywhere it appears."
- **Repository rules that bind any redesign.** `interface.md` *Field kinds*: "a setting that takes
  effect at once | switch", "a choice of two to four, exclusive | toggle group", "a choice of five or
  more | select". *Guidance*: an act that does not apply is hidden; one that applies and cannot run
  is shown dimmed and says why at the control, never the platform's disabled. *Status
  presentation*: a status is an icon with its word in the tooltip. `frontend.md`: lucide only, three
  sizes; checkmarks never mirror.

## 1. Editing a role's permissions

**1a. Presets come first; the fine list is second.** (source)
- GitHub ships five repository roles, each with a "Recommended for ..." sentence, e.g. Read:
  "Recommended for non-code contributors who want to view or discuss your project"; Admin:
  "Recommended for people who need full access to the project, including sensitive and destructive
  actions". A custom role starts from one: "When you create a custom repository role, you start by
  choosing an inherited role from a set of pre-defined options," then "choosing additional
  permissions," and "You can only choose an additional permission if it's not already included in
  the inherited role." Additional permissions are grouped under headings (Discussions, Issue and
  pull requests, Pull request, Repository, Security, Actions), each with a one-line description.
  *(GitHub docs, 2026-09-27.)*
- Google Workspace Admin: "The easiest way to give administrator privileges to another user is to
  assign prebuilt administrator roles," each described in one line ("Super Admin: Has access to all
  features ..."); custom roles are the second path. *(2026-09-27.)*
- SharePoint: "The easiest way to work with permissions is to use the default groups and permission
  levels ... But, if you need to, you can set more fine-grained permissions." Levels carry one-line
  descriptions (Read: "View pages and items ..."; Contribute: "View, add, update, and delete list
  items"). *(Microsoft Learn, updated 2026-07-01.)*
- Apple Business: predefined roles plus custom roles; permissions "in five different categories:
  Organization, People, Devices, Apps & Services, and Brands." *(Apple Support, 2026-09-27.)*
- Slack and Linear document a handful of roles, each a one-line sentence (Linear, Member: "can
  collaborate across teams they have access to ... cannot access workspace-level administration
  pages"). *(2026-09-27.)*

**1b. Resource by action, when the resource set is small and the verbs are the same.** (source)
- SharePoint's list permissions are exactly rentable's verbs: "View Items", "Add Items", "Edit
  Items", "Delete Items". The page presents permissions as a matrix, permissions down, levels
  across, "X" in a cell. *(Microsoft Learn.)*
- **SharePoint enforces dependencies in the editor**: "When you select a SharePoint permission that
  depends on another, SharePoint automatically selects the associated permission. Similarly, when
  you clear SharePoint permission, SharePoint automatically clears any SharePoint permission that
  depends on it." Add, Edit and Delete Items each list View Items as a dependency. *(Microsoft
  Learn.)*
- HubSpot sets CRM permissions per object, one control per verb: View, Edit, Delete, each "the
  dropdown menu" with a scope (All, Their team's, Theirs, None). *(HubSpot KB, 2026-09-27.)*
- Salesforce object permissions (Read/Create/Edit/Delete per object) are the best-known instance
  of the matrix; **both Salesforce pages answered 403 or a loading shell and were not read**
  (see *Not checked*).

**1c. A long grouped list of toggles, saved as one act.** (source) Discord's role editor has a
Permissions tab listing server permissions, with an "Advanced Permissions" group holding
Administrator ("toggle Administrator on or off"), then "Press Save Changes". *(Role Management 101,
Setting Up Permissions FAQ, Wayback 2025.)* Each channel permission carries a sentence ("View
Channel - When this setting is enabled, this allows members to view this specific channel").
*(Channel Permissions Settings 101.)*

**1d. Which control.** (source)
- Apple: "Use a checkbox instead of a switch if you need to present a hierarchy of settings. The
  visual style of checkboxes helps them align well and communicate grouping." "If you use a
  checkbox to globally turn on and off multiple subordinate checkboxes, show a mixed state when the
  subordinate checkboxes have different states." "Prefer a switch for settings that you want to
  emphasize ... to turn on or off a group of settings." "In general, don't replace a checkbox with
  a switch." "Avoid relying solely on different colors to communicate state." *(HIG, Toggles.)*
- NN/g: "Toggle switches should take immediate effect and should not require the user to click
  Save or Submit." Microsoft: "Use a checkbox when the user has to perform extra steps for changes
  to be effective." *(NN/g 2018; Microsoft Learn 2025.)* Rentable's own *Field kinds* table agrees
  (switch only for immediate effect). Both editors here save through a submit, so the sources point
  to checkboxes, not switches.
- Material Components (Android): a parent checkbox "will be selected if all children are selected,
  not selected if all of the children are not selected, and indeterminate if only some of the
  children are selected." W3C APG: "A single tri-state checkbox is used to represent and control
  the state of an entire group", `aria-checked="mixed"`.
- Apple, radio buttons and pop-ups: "If you need to present more than about five options, consider
  using a component like a pop-up button." Segmented controls: "no more than about five to seven
  segments in a wide interface."

**1e. Progressive disclosure.** (source) Apple: "Use a disclosure control to hide details until
they're relevant. Place controls that people are most likely to use at the top of the disclosure
hierarchy ... with more advanced functionality hidden by default"; "Use no more than one disclosure
button in a single view." NN/g: "Initially, show users only a few of the most important options";
"designs that go beyond 2 disclosure levels typically have low usability."

**1f. Search inside a permission editor.** Looked for in the primary sources read; **not found**
documented by any of them. (Discord's role editor is widely described as having a permission search
field; no primary page read here says so.) At thirty flags in six labelled groups, the sources give
no case for one.

## 2. Presenting a per-member override

**2a. Discord's three states.** (source) "X - The x means the option or setting is disabled. / -
The slash means the option or setting will go by default settings. Check - The checkmark means the
option or setting is enabled." *(Channel Permissions Settings 101.)* Resolution is ordered: role
permissions, then channel denies before allows, member-specific overwrites last. *(Discord developer
docs.)* A channel whose permissions match its category shows as *synced*; "Press the Sync Now button
and the channel's permission will match the permissions of the category." *(Setting Up Permissions
FAQ.)* That button is Discord's "reset to what I inherit".

**2b. GitHub adds, never subtracts.** (source) "Roles and permissions are additive ... the user has
the sum of all access grants," and conflicting sources are flagged with a "Mixed roles" warning.
*(About custom organization roles.)* SharePoint's per-item access "stops inheritance" and makes
the item's permissions unique. *(Microsoft Learn.)*

**2c. Why a three-state control does not fit an XOR override.** (interpretation, from 0 and 2a)
Discord stores two bits per permission per overwrite (allow, deny), so *inherit*, *always on* and
*always off* are three different stored things, and an explicit *allow* stays an allow when the role
changes. Rentable stores **one** bit, meaning *differs from the role*. For a given role value only two
results exist (as the role, or the opposite), so a three-state control would have one state that
cannot be stored (the explicit value equal to the role's), and it would promise a permanence XOR
does not keep: the spec's own *Risks* entry says a role gaining a flag the override had turned on
takes it away. The control that tells the truth about XOR is a **two-state control on the result**,
with **"differs from the role" shown as a mark**, and a reset that clears the bit.

**2d. "Show the result, not the arithmetic."** (interpretation) Today's table asks the reader to
read column 1, predict the effect of a tick in column 2, and confirm in column 3; the checkbox's
checked state means *changed*, not *allowed*, which is the arithmetic surfaced as the control. The
sources' pattern (Discord's check/X on the effective answer, Sync Now to return; GitHub's warning
where sources mix) puts the control on what the person may do, and marks where it departs.

## 3. Summarising a role in a list or card

**3a. Level words.** (source) Sharing products summarise access as one ordered level with a plain
label: iCloud Drive and Notes "Can edit" / "Can view and download" (Notes) or "Can view or
download" (Drive); Google Drive "Viewer, Commenter, Editor"; Notion "Full access", "Can edit",
"Can comment", "Can view"; Figma "can view", "can edit"; SharePoint "Read", "Contribute", "Edit",
"Full Control", "View Only". Every one is chosen from a pop-up and read as one word or short phrase.

**3b. Sentences for who a role is for.** (source) GitHub's "Recommended for ...", Google's
one-line prebuilt roles, Slack's and Linear's one-liners. Rentable already has one sentence per
built-in role (`organization.roles.*.who`), shown only in the member sheet's tray.

**3c. Cumulative verbs collapse to a ladder.** (interpretation) SharePoint's Read < Contribute <
Edit < Full Control is the cumulative set of view/add/edit/delete. For one rentable kind, the
cumulative masks are five: none, view, view+create, view+create+edit, all four. Every built-in
role is on the ladder (member: view+create+edit everywhere; manager: all four everywhere). Eleven
of the sixteen combinations per kind are off it (for example view+delete, or edit without view,
which 0 shows is storable), and need a fallback word ("custom") or the verbs spelled out.

**3d. What reads fastest.** Looked for a primary study comparing icon rows, counts and chips for
role summaries; **not found**. NN/g's data-table guidance is the nearest: "The default order of the
columns should reflect the importance of the data," "related columns should be adjacent." Chips
(Material: "compact elements that represent an input, attribute, or action") are a component, not
evidence of speed.

## 4. Icons

- Apple: icons work best with "familiar visual metaphors that are directly related to the actions
  they initiate or content they represent"; keep "a consistent size, level of detail, stroke
  thickness"; "match the weights of interface icons and adjacent text"; "Provide alternative text
  labels". SF Symbols' slash variant can "show that an item or action is unavailable." "Offer visual
  indicators, like distinct shapes or icons, in addition to color." *(HIG Icons, SF Symbols,
  Accessibility.)*
- NN/g: "a text label must be present alongside an icon"; "Icon labels should be visible at all
  times"; universal icons are few (home, print, search); "If it takes you more than 5 seconds to
  think of an appropriate icon ... it is unlikely that an icon can effectively communicate that
  meaning." *(Icon Usability, 2014.)*
- (observation) Rentable's *Status presentation* rule (icon only, word in tooltip) is a local
  decision for statuses; NN/g's visible-label guidance and HIG's alternative-text guidance are the
  sources for everything else.
- (interpretation) Resource glyphs already exist for four of the five kinds (house, user,
  scroll-text, coins) and "one glyph per concept" makes reusing them the rule, not a choice; units
  need one chosen. Action glyphs exist for three verbs (plus, square-pen, trash-2); *view* has none
  (eye is the common metaphor; unused here). Administrative acts are ten distinct ideas; by NN/g's
  five-second rule most would not earn a glyph. The owner's acts have a natural shared glyph in the
  `crown` the owner acts already use.

## 5. Arabic/RTL and accessibility

- **Grid vs table.** APG: a grid "Only one of the focusable elements contained by the grid is
  included in the page tab sequence" with arrow keys between cells; in a table "All focusable
  elements ... are included in the page tab sequence." A 5 by 4 table of checkboxes is 20 tab stops;
  a grid is one plus arrows, at the cost of implementing the grid's keyboard model (Enter/F2 to
  enter a cell with widgets). *(APG Grid.)*
- **Names.** W3C: group related checkboxes in a fieldset whose legend names the group; each control
  has a label. (observation) A matrix cell has no visible label, so its accessible name must carry
  both headers, as `flagPhrase` already builds ("edit contracts"); `<th scope>` on both axes gives
  screen readers the headers for free in a plain table.
- **Mixed state.** APG: `aria-checked="mixed"`; Space toggles. HIG: show mixed when subordinates
  differ.
- **RTL.** HIG: "Use a consistent alignment for all text items in a list"; flip controls that show
  progress or order; "People expect universal symbols and marks like the checkmark to have a
  consistent appearance, so avoid flipping them." (interpretation) A table under `dir="rtl"` flips
  its column order by itself, so view reads first at the right; the verb order is an order, so it
  should flip, and it does. None of the proposed glyphs (house, user, scroll-text, coins, plus,
  square-pen, trash-2, eye, crown, check) is directional under `frontend.md`'s list.
- **Arabic length.** (observation) The four verbs are one short word each in Arabic (عرض، إنشاء،
  تعديل، حذف) and the kinds are one word each, so a 5 by 4 grid's headers fit; the administrative
  flags are two to four words (e.g. "تغيير صلاحيات عضو بعينه") and suit a list row, not a column
  header.
- **Colour.** HIG, twice: never state by colour alone. A "changed" mark needs a shape, not only a
  tint.
- **Switch semantics.** (observation) `packages/design/src/lib/primitive/switch/switch.svelte`
  wraps bits-ui's `Switch.Root`, which sets `role: "switch"` (bits-ui's `switch.svelte.js`, line
  47, in the installed package). A switch's accessible name must be the whole phrase ("edit
  contracts"), since a group heading is not part of it; `flagPhrase` already builds it. **The thumb
  moves with a physical `translate-x-[calc(100%-2px)]` and carries no `rtl:` variant**, so in
  Arabic it likely slides to the right when on, where the HIG's RTL page says controls that show
  a direction flip; not checked on the running app. No file under `apps/desktop/src` imports the
  switch primitive today (grep for `primitive/switch`: no hit), so it would be its first use.

## 6. Switch lists, "custom" against a preset, and reset (for the human's direction)

**6a. Switches in a list, and switches in a form that is saved.** (source)
- Apple: "Use the switch toggle style only in a list row. You don't need to supply a label in this
  situation because the content in the row provides the context." On macOS: "Prefer a switch for
  settings that you want to emphasize ... you might use a switch to let people turn on or off a group
  of settings"; "If you need to present a hierarchy of settings within a grouped form, you can use a
  regular switch for the primary setting and mini switches for the subordinate settings." Apple also
  says "In general, don't replace a checkbox with a switch," and that a checkbox, not a switch,
  carries the **mixed** state. *(HIG Toggles, 2026-09-27.)*
- Discord's role editor is a list of on/off toggles under headings, "Advanced Permissions" among
  them, committed with "Save Changes". *(Role Management 101, Wayback 2025.)* This is the production
  precedent for switches in an editor that saves as one act.
- Against it: NN/g, "Toggle switches should take immediate effect and should not require the user
  to click Save or Submit"; Microsoft, "Use a checkbox when the user has to perform extra steps for
  changes to be effective." *(NN/g 2018; Microsoft Learn 2025.)* And rentable's own
  `interface.md` *Field kinds*: "a setting that takes effect at once | switch".
- (interpretation) The human's direction is supported by Discord and by the HIG's list-row and
  grouped-form guidance, and runs against NN/g, Microsoft and the repository's current *Field
  kinds* row. Adopting it means amending that rule (a switch also for a permission in a saved
  editor, with the reason), and the saved-form risk NN/g names is a reader who flips a switch and
  leaves thinking it took effect. The mitigations the sources offer are Discord's: the changes held
  visibly until saved (Discord shows a save bar; rentable's sheet has its footer save), and a count
  of what changed.

**6b. Apple's own permission and restriction lists.** (source)
- Screen Time is a **drill-down of groups**, each item set to allow or block: "Tap Screen Time, tap
  Content & Privacy Restrictions, then allow or block any of the settings shown under Content
  Restrictions, like Books, Movies, TV Shows, and Music"; "tap Other Features, then allow or block
  any of the settings shown, like AirDrop, Camera"; Siri's page offers "Don't Allow Siri", then
  "Select Allow or Block under any of the Siri AI capabilities." *(iPhone User Guide, Block features
  or content with Screen Time, read 2026-09-27, text of the iOS 27 era page.)*
- Content restrictions are **levels, not switches**: "choose a setting like, Don't Allow, Unrated,
  Allow All, or a specific age rating." And a **preset by age**: "Many of these settings are applied
  automatically based on your child's age, but you can adjust the settings at any time." *(Apple
  Support 105121.)*
- Privacy & Security: "Apps ask for permission the first time they want to use something ... You
  can control which apps can access your data, location, camera, and microphone"; the per-app
  control is described in a search snippet of the same page as "turn access on or off for any
  individual app" *(snippet only, not seen on the fetched page)*.
- Family Sharing, Ask to Buy: "Tap Ask to Buy, then turn on Require Purchase Approval." *(Apple
  Support 105055, via search result text.)*
- (observation, not a source) iOS Settings rows that open a group show the group's **current value**
  at the trailing edge with a chevron; no primary page read here states this as guidance, but HIG
  *Lists and tables* says "If you need to let people drill into a list or table row's subviews, use
  a disclosure indicator accessory control."

**6c. "Custom" against a preset, and the way back.** (source)
- Discord is the closest analogue to the human's model: a channel is **synced** with its category
  or **not synced**. "A synced channel will have permissions that completely match that of the
  category. A not-synced channel will have permissions that differ"; "if you change an individual
  permission on the channel level, it will then show that the channel is not synced"; "Press the
  Sync Now button and the channel's permission will match the permissions of the category." And on
  moving a channel to another category Discord offers to sync: "If you do not sync permissions when
  moving a channel between categories ... it will then show that the channel is not synced."
  *(Setting Up Permissions FAQ, Wayback 2025.)* Role = category, member = channel, custom = not
  synced, reset = Sync Now.
- macOS: "To return the keys to their original settings, click Restore Defaults." *(Mac User
  Guide, modifier keys.)* Chrome's site settings carry a "Reset permissions" button. *(Chrome Help
  114662.)*
- GitHub's custom role names the role it inherits from and lists only what is added.
  *(About custom repository roles.)*
- Looked for an Apple or Google surface that labels a set of switches "Custom" when it departs from
  a preset; **not found in a primary page read here.**

**6d. Keeping about thirty switches minimal.** (source, then interpretation)
- HIG: a primary switch with mini switches for subordinates (6a); disclosure "to hide details until
  they're relevant"; NN/g: at most two levels of disclosure (1e); Apple Settings: "Minimize the
  number of settings you offer" *(HIG Settings)*; Screen Time: groups drilled into, each row a short
  noun (6b).
- (interpretation) The record kinds have a natural primary: **view**. With view as each kind's
  primary switch, create, edit and delete are its subordinates, shown (indented, mini) only while
  view is on. That is HIG's hierarchy, Screen Time's "Don't Allow" at the top of a group, and
  SharePoint's dependency (1b) at once, and it cuts the always-visible switches from thirty to five
  plus whatever is on. **A per-group all/none switch does not fit a switch:** a switch has no mixed
  state (HIG gives mixed to the checkbox), so a group that is partly on cannot be shown by its
  switch; the view-as-primary shape avoids needing one.
- (interpretation, the XOR under a view-primary shape) Turning view off in the override editor
  would clear create, edit and delete too, each by setting or clearing its override bit, so no
  hidden bit is left on under a switch that is off. Masks stored today with a write flag and no
  view (0 says they are storable) would need a rule: shown with view off and the others hidden
  would hide a live permission. Either the editor refuses that shape (SharePoint's dependency, a
  behaviour change, the human's call), or view off still shows any subordinate that is on.

# Conclusion

**The answer, from findings.**

1. Production role editors lead with presets and a one-line purpose, and put the fine permissions
   second, grouped by area with a sentence each (GitHub, Google Admin, SharePoint, Apple Business).
   Where resources share the same verbs, the fine layer is either a resource by action matrix
   (SharePoint list permissions, HubSpot per object) or a grouped list of on/off toggles saved as
   one act (Discord). SharePoint makes the verbs depend on view in the editor itself.
2. On the control: the HIG puts a switch in a list row and gives a grouped form a primary switch
   with mini switches for its subordinates; Discord's role editor is switches with a save. NN/g,
   Microsoft and rentable's *Field kinds* keep switches for immediate effect. **The human's switch
   direction is supported by Discord and the HIG's list and hierarchy guidance, and requires
   amending the *Field kinds* row.** A switch has no mixed state, so a per-group all/none switch
   cannot show a partial group.
3. Overrides: Discord's three states exist because it stores allow and deny separately; rentable's
   XOR stores one "differs" bit, so the faithful control is two-state on the result, which is
   exactly the human's direction. Discord's synced / not synced / Sync Now is the precedent for the
   human's role / custom / reset, including an offer to sync when the parent changes.
4. Summaries: sharing products read access as one level word per resource ("view only", "can
   edit", "full access"); Screen Time reads levels too ("Don't Allow ... Allow All"). Rentable's
   built-in roles sit on a five-step ladder per kind; custom masks off it need a fallback.
5. Icons: a visible word beside every icon (NN/g), the glyph a concept already has (`frontend.md`,
   HIG consistency), icons only for concepts with a familiar metaphor: the five kinds, the owner's
   crown, and the reset.
6. Accessibility: a switch is `role="switch"` with the whole phrase as its name; nothing is state by
   colour alone; checkmarks never mirror; the repository's switch primitive moves its thumb with a
   physical translate and wants checking in Arabic.

**Confidence.** High on 1, 3, 5 and 6 (primary sources agree, and the XOR argument follows from the
code). High on the sources in 2, and the tension in it is real rather than a gap. Medium on 4: the
level vocabulary is well sourced, but no primary study was found on what a reader scans fastest.

**What the findings point to for rentable, within the human's direction (interpretation, ranked;
the human decides).**

1. **One switch list, shared by the role editor and the override editor.** Six groups, in the
   order the app already uses:
   - **Five record-kind groups.** Each group's head is the kind's glyph and name (house, a glyph
     for units still to choose, user, scroll-text, coins) with **view as the group's primary
     switch** on the same row. Create, edit and delete sit under it as smaller, indented switches,
     drawn only while view is on (the HIG's primary and mini switches; Screen Time's "Don't Allow"
     first). Labels are one word under the kind ("add", "edit", "delete"), with a one-line
     description only where the word hides something: contracts' edit, "including ending, renewing
     and restoring" (spec requirement 1). A role with no access to a kind shows one row, off.
   - **Administration**, one group, collapsed by default with its summary on the head row ("none",
     "4 of 10", "all"), and when opened, the ten switches in two or three short clusters (people;
     roles and permissions; workspaces and mark), each a one-line label, with a description only
     for "change one member's permissions", "grant workspaces" and "the mark". No glyph per flag.
   - Result: about six rows when a role carries little, about 22 when it carries everything, never
     the flat thirty.
   *Trade-offs:* hiding create, edit and delete under view is a dependency. A mask with a write flag
   and no view is storable today; the list must either refuse that shape (turning view off turns
   the others off, SharePoint's rule; a behaviour change, the human's call) or keep a subordinate
   visible while it is on. The saved-switch risk (6a) is met by the footer save and the "custom"
   mark below.
2. **The override editor: role on top, then the result, with "custom" and reset.**
   - The tray (today's `member-role.svelte`) reads the role; when the override is not empty, a
     quiet "custom" mark after the role's name and a **"reset to {role}"** button (`rotate-ccw`),
     which clears the override. When it is empty, neither is drawn: the member is their role.
   - The switch list below is set to what the member ends up with; flipping one flips its override
     bit underneath. The XOR is never named.
   - A switch that differs from the role carries a small shaped mark (a dot, not colour alone) and
     "differs from {role}" in its accessible description and tooltip, so the reader can find what
     makes them custom; a collapsed group whose contents differ carries the same dot on its head.
   - **The same "custom" mark on the member's directory badge** ("Collector, custom"), so the
     directory says who departs from their role without opening them. (This extends the
     direction; the human may not want it.)
   - **A decision the direction leaves open: what picking another role does to an override.**
     Today it keeps the override (`interface.md`, *Form surface*; `member-sheet.svelte`), so the
     result re-reads against the new role and switches can move in ways nobody chose, which is the
     XOR showing through. The sources offer two other ways: Discord offers to sync when a channel
     moves to another category (clear the override: the member becomes the new role exactly), or
     keep what they end up with and read it as custom against the new role (recompute the
     override). Keeping the override, as today, is the one of the three that makes the arithmetic
     visible. Any change here changes documented behaviour and is the human's call.
3. **The role editor: the same list.** The name in the tray as today; the list sets the role's own
   flags. A new role still opens on the member's flags (GitHub's "start from a role"); a "start
   from" choice of manager or member is the only preset worth adding, and it is optional.
4. **Owner-only acts: one quiet line with the crown, not eight locked switches**, e.g. "creating and
   deleting workspaces, the Turso account and handing over stay with the owner." The brief
   suggested locked rows; `interface.md` *Guidance* hides an act that does not apply, and no role
   can ever carry these.
5. **Refusals at the control, once.** A switch the reader does not hold: dimmed, `aria-disabled`
   rather than disabled, its reason in the tooltip (*Guidance*), and one sentence at the top of the
   list when any switch is refused, instead of "you do not hold this yourself" under every row.
6. **Roles directory card: level words per kind, grouped by level.** Line 1: name and holders.
   Line 2: kinds grouped by level, each as glyph plus name, e.g. "can edit: [house] complexes,
   units, [user] tenants, [scroll-text] contracts. view only: [coins] payments"; no-access kinds
   left out. Owner: "everything", with the crown. Manager: "everything but the owner's acts". Line
   3, only where the role administers anything: the same summary the editor's administration head
   uses ("4 of 10", or the names when three or fewer). The level words should also be what a record
   group says wherever it is collapsed, so the card and the editor speak one vocabulary. Candidate
   ladder: no access / view only / can add / can edit / everything; off-ladder kinds read as the
   verbs they carry. The Arabic is not drafted here.

**What the findings point to dropping.**
- The checkboxes in the role editor, and in the override editor the three-column table (*role /
  changed / they may*) with its *changed* checkbox.
- The per-family prose lines on the roles card ("complexes view, create, and edit") and the owner
  card's "the owner's own" line of eight acts.
- The repeated per-row "you do not hold this yourself".
- The instruction paragraphs `roleList.flagsDescription` and `override.description`, which the
  switches, the "custom" mark and the reset make unnecessary (guide by what it does).
- A per-group all/none switch: a switch cannot show a partly-on group, and view as primary does its
  job.
- The 5 by 4 matrix of checkbox cells that sections 1 to 5 pointed to before the human's direction;
  section 6 supports the switch list instead.

# Not checked

- **Salesforce** object permissions (help.salesforce.com loaded an empty shell; developer.salesforce.com
  answered 403). The Read/Create/Edit/Delete matrix and its dependency rules are known of it but
  not read here.
- **Discord's live Help Center** answered 403; its pages were read from the Wayback Machine's 2025
  copies, which may differ from Discord's UI in 2026. Discord's role-permission search field, its
  per-permission descriptions and its save bar were not confirmed from a primary page.
- **Material 3's site** (m3.material.io) did not render to the fetcher; Material is cited from the
  Android components repository's docs only. Material's switch, list and selection-control
  guidelines were not read.
- **Apple's screens themselves** were not seen. Screen Time is cited from its user-guide text; the
  per-app switch in Privacy & Security rests on a search snippet; Ask to Buy on search-result text;
  the trailing value on an iOS Settings row is an observation with no primary page behind it.
  Apple Business Manager's privilege editor was not seen.
- **An Apple or Google surface labelled "Custom" against a preset** was looked for and not found.
- **Google Admin's custom-role privilege tree** is not described on the page read.
- **Microsoft 365 / Teams admin roles** were not read beyond SharePoint.
- No usability study comparing a matrix, a flat list and a grouped switch list, or level words with
  icon rows, was found.
- The switch primitive's thumb direction in Arabic was not checked on the running app.
- The Refactoring UI reference (`.aep/position/design/`) was not opened; a look decision that leans
  on it should name its section.
- Nothing here was prototyped, and no Arabic copy was drafted.
