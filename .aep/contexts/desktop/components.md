---
paths:
  - packages/design/src/lib/**
  - apps/desktop/src/lib/design/**
  - apps/desktop/src/**/*.svelte
use-when: "choosing a component to show data, show status, take an action, choose a value, disclose detail, interrupt or guide in the app"
---

# Context — which component shows what

What each primitive, block and cell in this repository is for, what it is not drawn for, what
stands nearest to it, and one place it is drawn. [[rules/interface]] makes reading this binding
before a component is chosen, and it stays the authority on **look and placement**: where a
section of it names a component for a case, that section wins and this page is corrected.
How a component's code is written is [[rules/frontend]]'s.

*Written on 2026-10-02 by ticket 22 of
[[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], against the tree as it stood,
and grounded in
[[efforts/846-the-settings-and-the-record-cards-are-rethought/evidence/research/what-each-kind-of-component-is-for]]
(cited below as *research*, with its finding number). Where this and the source disagree, the
source is right and this is corrected. `apps/desktop/src/tests/components-context.test.ts` fails
when a primitive, block or cell is added and not named here.*

## Where things are

| Kind | Lives in | Imported as |
| --- | --- | --- |
| primitive (shadcn-svelte over bits-ui, owned) | `packages/design/src/lib/primitive/<name>/` | `@rentable/design/primitive/<name>/index.js` |
| block (a composite reaching only the package) | `packages/design/src/lib/block/<name>.svelte` | `@rentable/design/block/<name>.svelte` |
| app block (reaches the application) | `apps/desktop/src/lib/design/block/` | `$lib/design/block/<name>.svelte` |
| cell (one datum, drawn the one way) | `apps/desktop/src/lib/design/cell/` | `* as Cell from '$lib/design/cell'` |

**A block before a primitive.** Where a block exists for the need, the application draws the
block; the primitives it is built from are reached through it. The record card's menus are
`primitive/context-menu` and `primitive/dropdown-menu`, but a concept draws
`block/record-card.svelte`, never the menus. A settings row's menu is the same record menu, and a
section hands `block/settings-row.svelte` the row's acts through its `menu` and draws neither the
menu nor the tooltip that gives a refused act its reason. What the two blocks share lives in one
module inside the package (`record-menu.svelte`), which neither block exports and no concept
imports.

## The categories

| Category | The question it answers | Research |
| --- | --- | --- |
| showing data | what is this record, what are its facts | 5, 12 |
| showing status | what state is it in, at a glance | 6 |
| taking an action | do something now | 1, 2 |
| choosing a value | which of these, on or off | 3 |
| entering text | type a name, an amount, a note, a date | 4 |
| disclosing detail | more, for the few who want it | 9 |
| interrupting and confirming | stop, and answer before going on | 7, 8 |
| guiding and empty states | what goes here, what to do next | 10 |
| navigating | where am I, where else can I go | 11 |
| laying out | what belongs together | 12 |
| feedback and progress | it worked, it failed, it is under way | 7, 13 |

## Primitives

`packages/design/src/lib/primitive/`. *Where* is one file drawing it; "through a block" names the
block a concept draws instead.

| Primitive | Category | Drawn here for | Not for | Nearest alternative | Where |
| --- | --- | --- | --- | --- | --- |
| `primitive/avatar` | showing data | a person's initials beside their name | a record that is not a person; a status | `Cell.Text` | `organization/member/component/card.svelte` |
| `primitive/badge` | showing status | a short label on a row: a member's role, *also ending* on a landing row | a status of the nine (that is `Cell.Status`); anything pressed (research 6) | `cell/status.svelte` | `dashboard/component/section.svelte` |
| `primitive/breadcrumb` | navigating | the trail in the titlebar, built from the route ([[rules/interface]], *The breadcrumb*) | going back (that is the back control); switching sections | `block/back-control.svelte` | `shell/component/breadcrumb.svelte` |
| `primitive/button` | taking an action | one act, named by its verb with its glyph ([[rules/interface]], *Form surface*), never the glyph its settings row or card already shows (there, words alone or an icon alone named by a tooltip) | choosing a value; a status; several related commands (research 1, 2) | `primitive/dropdown-menu` | `complex/component/form.svelte` |
| `primitive/calendar` | entering text | a date, inside a popover, given the reader's locale (*Field kinds*) | a span of time chosen from named periods (a menu does that) | `primitive/dropdown-menu` | `contract/component/start-date-field.svelte` |
| `primitive/callout` | feedback and progress | a notice standing on the surface it is about, in the tone vocabulary (*Feedback*), with its act where it has one | a transient result (toast); a field's error (research 7) | `primitive/sonner` | `organization/component/standing.svelte` |
| `primitive/checkbox` | choosing a value | picking records in a list's selection mode; a setting that waits for a save (*Field kinds*) | a setting that applies at once, or a permission (both switches) | `primitive/switch` | `list/component/rows.svelte` |
| `primitive/collapsible` | disclosing detail | detail few readers need: the machine's words behind an error, a permission group, and through `block/settings-row.svelte`'s `details` a settings row's detail (a release's notes, not a path) | anything most readers need; a status, a problem, an act that ends something (research 9) | `primitive/tooltip` | `error/component/detail-disclosure.svelte` |
| `primitive/command` | choosing a value | the command menu, and a combobox over another record's search inside a popover | a choice of a few fixed values; several records checked at once from a list always shown (a workspace's add sheet draws its own listbox) | `primitive/select` | `contract/component/tenant-field.svelte` |
| `primitive/context-menu` | taking an action | the record card's secondary-click route, through a block | anything not also on the visible control (research 2) | `primitive/dropdown-menu` | through `block/record-card.svelte` |
| `primitive/dialog` | interrupting and confirming | a scoped task that must be answered: import review; beneath every confirming block and the form surface | information with nothing to answer; a repeated task (research 8) | `primitive/popover` | `transfer/component/import-dialog.svelte` |
| `primitive/dropdown-menu` | taking an action | several commands behind one control: filter, sort, transfer, a card's acts, the dashboard's period; and, through `block/settings-row.svelte`'s `menu`, a settings row's menu, the secondary acts on one row of a growing list however few, as a machine's sign-out | one or two commands on a surface, which are buttons; a form's exclusive value (research 2, 3) | `primitive/toggle-group` | `list/component/list-toolbar.svelte` |
| `primitive/empty` | guiding and empty states | the parts of the empty block, through it | drawing an empty state directly | `block/empty.svelte` | through `block/empty.svelte` |
| `primitive/field` | laying out | a form's fields, legends and descriptions | content with no control in it (research 5, shadcn *Item*) | `primitive/item` | `organization/access/component/switches.svelte` |
| `primitive/form` | entering text | binding a field to its superform schema, with `block/field-error.svelte` | a field that writes at once outside a form | `primitive/field` | `complex/component/form.svelte` |
| `primitive/input` | entering text | a short typed value: a name, a username | a long note; money; a phone (research 4) | `primitive/textarea` | `complex/component/form.svelte` |
| `primitive/input-group` | entering text | an input with an adornment: money with the riyal sign, the ending-soon days | a plain short value | `primitive/input` | `contract/component/form.svelte` |
| `primitive/item` | showing data | a row of media, title, description and actions; beneath the settings blocks | form controls (research 5) | `block/settings-row.svelte` | `organization/component/standing.svelte` |
| `primitive/kbd` | navigating | a shortcut printed beside its act, in menus, tooltips and the command menu | an act's only label | `primitive/tooltip` | `create/component/control.svelte` |
| `primitive/label` | entering text | a field's name, through `Field.Label` and `Form.Label` | text a reader does not pair with a control | `primitive/field` | through `primitive/field` |
| `primitive/popover` | disclosing detail | a small task beside the control that opened it, applied in place: a date, a combobox, the ending-soon window, the way in's preferences | a task that must be answered first; more than a few related tasks (research 8) | `primitive/dialog` | `dashboard/component/ending-soon.svelte` |
| `primitive/progress` | feedback and progress | the startup's stages, a determinate wait (*Loading*) | waiting on a read (that is the loading block) | `block/loading.svelte` | `startup/component/loading.svelte` |
| `primitive/select` | choosing a value | a choice of five or more, or among records the organization adds (a role), and a phone's country | four or fewer (*Field kinds*, held by `design/tests/few-options.test.ts`) | `primitive/toggle-group` | `organization/member/component/role.svelte` |
| `primitive/separator` | laying out | the hairline between the titlebar's parts and in the way in's preferences, and before a settings card's ending rows | splitting what a group or a card already separates (research 12) | `block/settings-group.svelte` | `shell/component/frame.svelte` |
| `primitive/sheet` | interrupting and confirming | a panel from the edge with nothing to save: the keyboard shortcuts | a form (the form surface's heavy weight is the edge panel) | `block/form-surface.svelte` | `shell/component/shortcut-sheet.svelte` |
| `primitive/sidebar` | navigating | the application's rail: places, the workspace control, the account menu | sections of one page (that is the section switch) | `block/section-switch.svelte` | `shell/component/sidebar.svelte` |
| `primitive/skeleton` | feedback and progress | the shape of what is coming, handed to the loading block | a load drawn without the block's delay and hold | `block/loading.svelte` | `list/component/list.svelte` |
| `primitive/sonner` | feedback and progress | the toaster, mounted once by `notification/` (*Feedback*) | a toast raised outside the shared handlers | `primitive/callout` | `notification/component/provider.svelte` |
| `primitive/spinner` | feedback and progress | a control or a surface that is working: the standalone surface busy, the selection dialog reading its plan | standing in for content (*Loading*) | `block/loading.svelte` | through `block/standalone-surface.svelte` |
| `primitive/switch` | choosing a value | on or off: a permission, a workspace a member is in (*Field kinds*); `sm` is the mini switch; `lg` the larger switch a menu row or a way-in choice stands on | an act; a choice of more than two (research 3); who holds a workspace, on its page (a search field and cards) | `primitive/checkbox` | `organization/role/component/permission-switches.svelte` |
| `primitive/textarea` | entering text | a longer note: a payment's note | a short value | `primitive/input` | `payment/component/form.svelte` |
| `primitive/toggle` | choosing a value | one segment of a toggle group, through it | a lone pressable state on its own (unused alone here) | `primitive/toggle-group` | through `primitive/toggle-group` |
| `primitive/toggle-group` | choosing a value | two to four exclusive values, all shown: the cycle, language, appearance, a payment's method | five or more; several commands (research 3) | `primitive/select` | `settings/component/appearance.svelte` |
| `primitive/tooltip` | disclosing detail | a short hint on hover and focus: an icon control's words (the log folder's reveal, the check for updates, sync), a status's description, a refusal's reason, a choice whose word does not say what it does (appearance's *system*) | anything interactive, essential, or an error (research 9) | `primitive/popover` | `create/component/control.svelte` |

## Blocks

`packages/design/src/lib/block/`, and the one application block.

| Block | Category | Drawn here for | Not for | Nearest alternative | Where |
| --- | --- | --- | --- | --- | --- |
| `block/back-control.svelte` | navigating | the one way back, on a record, a step of the way in, a not-found | the trail; leaving a dialog | `primitive/breadcrumb` | `settings/component/page.svelte` |
| `block/confirm-dialog.svelte` | interrupting and confirming | asking before a dangerous act that is not a delete, under its own verb: terminate, restore, sign out, disconnect, forget, withdraw (*Delete and confirm*) | a delete | `block/delete-dialog.svelte` | `contract/component/host.svelte` |
| `block/delete-dialog.svelte` | interrupting and confirming | every delete of one record, saying what brings it back, and a refused delete saying why (*Delete and confirm*) | a delete of a selection (`block/selection-dialog.svelte`); an act that is not a delete | `block/confirm-dialog.svelte` | `complex/component/host.svelte` |
| `block/empty.svelte` | guiding and empty states | a region with nothing in it: nothing yet, no match, not found, each with its act | a load; an error | `block/not-found.svelte` | `list/component/empty.svelte` |
| `block/export-dialog.svelte` | interrupting and confirming | which file a list is written as | choosing where (the system's save dialog) | `primitive/dropdown-menu` | `list/component/list.svelte` |
| `block/field-error.svelte` | feedback and progress | a field's validation message, at the field | a summary of a form's errors (*Validation errors*) | `primitive/callout` | `complex/component/form.svelte` |
| `block/form-surface.svelte` | interrupting and confirming | every write: create and edit, light (centred) or heavy (the edge panel) by the form's weight | reading a record; a question with one answer | `block/confirm-dialog.svelte` | `complex/component/form.svelte` |
| `block/loading.svelte` | feedback and progress | a surface waiting on its content, with its skeleton, delay and hold | a determinate wait; a control's own working state | `primitive/progress` | `list/component/list.svelte` |
| `block/not-found.svelte` | guiding and empty states | a record or an address that is not there, with the way back | a failure (that is the standalone surface) | `block/standalone-surface.svelte` | `shell/component/route-error.svelte` |
| `block/page-frame.svelte` | laying out | the frame every screen sits in, one width and padding | a box around a group | `block/settings-group.svelte` | `settings/component/area.svelte` |
| `block/record-action-control.svelte` | taking an action | one of a record page's acts, quiet at rest, refused with its reason | an act on a failure screen (that is the surface action) | `block/surface-action.svelte` | `complex/component/details.svelte` |
| `block/record-card.svelte` | showing data | one record in a list, as a row or a tile, with both routes to its acts | a group of settings; a record's own page | `block/specification.svelte` | `complex/component/card.svelte` |
| `block/record-surface.svelte` | laying out | the page a record is read on: back, acts, title, fields, collections; a workspace's page under the settings area | a directory; a settings area | `block/page-frame.svelte` | `complex/component/details.svelte` |
| `block/section-switch.svelte` | navigating | a page's sections, each at its address: settings, a record's collections | places of the application (the rail) | `primitive/sidebar` | `settings/component/area.svelte` |
| `block/selection-dialog.svelte` | interrupting and confirming | an act on a selection, showing what would go through before it runs | one record's act | `block/delete-dialog.svelte` | `complex/component/directory.svelte` |
| `block/settings-grid.svelte` | laying out | a settings section's cards, one under the next in a single column at every width, in source order | a list of records (the list shell lays those); a page's frame; two cards side by side | `block/page-frame.svelte` | `settings/component/area.svelte` |
| `block/settings-group.svelte` | laying out | a settings card: its header inside it (glyph, title, one line, a value, and a header action: the card's one act on itself as quiet text at the trailing edge, red words where it ends something), its rows, the ending rows last after a separator, an optional footer; the column's width | a list of records (those are record cards); a box around a directory | `block/record-card.svelte` | `organization/component/settings-account.svelte` |
| `block/settings-row.svelte` | showing data | one setting: glyph, name with its meta line under it and a badge beside it, value, control; the `error` mark for an act that ends something, its button alone red, words with no glyph, and its glyph and name neutral; a control never repeating the row's glyph; `details` folding what few readers need; `menu` holding a row's secondary acts | a record in a directory | `primitive/item` | `organization/component/disconnect.svelte` |
| `block/specification.svelte` | showing data | a record's own fields as label and value, each label led by its glyph (`icon`) where the record's card shows its facts with glyphs, as a workspace's page does | a list of records; tabular data (research 5) | `block/record-card.svelte` | `complex/component/details.svelte` |
| `block/standalone-surface.svelte` | interrupting and confirming | the application failing: startup, recovery, an unhandled route error | a step of the way in; a not-found | `block/way-in-surface.svelte` | `shell/component/caught-error.svelte` |
| `block/surface-action.svelte` | taking an action | one of a few acts on a surface that has stopped the application | a record's act | `block/record-action-control.svelte` | `startup/component/error.svelte` |
| `block/way-in-position.svelte` | guiding and empty states | "step 1 of 2" above a walk's title, through the way-in surface | a wait (that is progress) | `primitive/progress` | through `block/way-in-surface.svelte` |
| `block/way-in-surface.svelte` | laying out | every step before the application, from the welcome to the wall | a failure | `block/standalone-surface.svelte` | `organization/setup/component/walk.svelte` |
| `design/block/language-choice.svelte` | choosing a value | the language a printed page or a reminder is written in | the application's own language (settings draws that) | `primitive/toggle-group` | `print/component/preview.svelte` |

## Cells

`apps/desktop/src/lib/design/cell/`, drawn as `Cell.<Name>`. A datum shown anywhere takes its cell
rather than formatting itself.

| Cell | Category | Drawn here for | Not for | Nearest alternative | Where |
| --- | --- | --- | --- | --- | --- |
| `cell/count.svelte` | showing data | a figure in the domain's tone (`running`, `settled`, `money`) | a count of one status (status count) | `cell/status-count.svelte` | unused here outside its tests |
| `cell/date.svelte` | showing data | a date, as `formatRecordDate` renders it | a date being chosen | `primitive/calendar` | `dashboard/component/section.svelte` |
| `cell/disc.svelte` | showing status | the filled glyph the status and count vocabularies hold | a status on its own (it is a glyph, not a cell of the index) | `cell/status.svelte` | `organization/workspace/component/directory.svelte` |
| `cell/fact.svelte` | showing data | one line of a tile's facts, at the tile's line height | a fact a reader needs its name to tell apart from its neighbours (a field); a record page's fields | `cell/field.svelte` | `tenant/component/card.svelte` |
| `cell/field.svelte` | showing data | one of a record card's tinted fields, laid in a grid two across: glyph and name, small and muted, over the value in the stronger weight; `empty` mutes a value saying nothing is there, `status` tones only a value that is a state | a lone line under a tile's heading that its glyph alone labels (a fact); a record page's fields | `cell/fact.svelte` | `organization/member/component/card.svelte` |
| `cell/fulfillment.svelte` | showing status | how much of an amount is paid, as a ring | a bare proportion | `cell/ring.svelte` | unused here outside its tests |
| `cell/money.svelte` | showing data | an amount, localized, with the currency | money being entered | `primitive/input-group` | `dashboard/component/section.svelte` |
| `cell/phone.svelte` | showing data | a phone number, held left to right | a phone being entered | `primitive/select` | `tenant/component/card.svelte` |
| `cell/ring.svelte` | showing status | a proportion as an arc carrying its figure | a wait (that is progress) | `primitive/progress` | `contract/component/record.svelte` |
| `cell/status.svelte` | showing status | one of the nine statuses as its glyph, the word in the tooltip; `labelled` on a tile (*Status presentation*) | a label that is not one of the nine | `primitive/badge` | `complex/unit/component/directory.svelte` |
| `cell/status-count.svelte` | showing status | how many records sit in one status | a figure with no status | `cell/count.svelte` | `tenant/component/card.svelte` |
| `cell/text.svelte` | showing data | words a person typed, isolated in a `<bdi>` | a machine's string (it states `dir="ltr"`) | `cell/phone.svelte` | `complex/component/card.svelte` |

## From the need to the component

Each row names what this repository already draws for the need, and one file where it does.

| The need | Component | Drawn at |
| --- | --- | --- |
| a value to set among two to four | `primitive/toggle-group` | `settings/component/appearance.svelte` |
| a value among five or more, or among records the organization adds | `primitive/select` | `organization/member/component/role.svelte` |
| another record, chosen by searching | `primitive/command` in `primitive/popover` | `contract/component/tenant-field.svelte` |
| an on/off setting | `primitive/switch` | `organization/role/component/permission-switches.svelte` |
| who holds a workspace | its page (`block/record-surface.svelte`): a directory, the settings directories' tray (search, sort, the create control) over the member cards (`block/record-card.svelte`) of who is in; the plus opens an add sheet (`block/form-surface.svelte`, heavy) that is one checklist: the shared search field over every member not in it, always shown and narrowed in place, each row the member's disc (`primitive/avatar`), username and role (`primitive/badge`) with a check at its trailing edge, a listbox with `aria-multiselectable` checked by press or Space, the empty block where the search finds nobody or nobody is left, and one button counting what it adds; a card's press and its menu's edit permissions open a sheet of that workspace's switches; the menu holds edit permissions and remove from workspace alone | `organization/workspace/component/holders.svelte`, `organization/workspace/component/add-sheet.svelte`, `organization/workspace/component/permissions-sheet.svelte` |
| several records picked for one act | `primitive/checkbox` in selection mode | `list/component/rows.svelte` |
| a date | `primitive/calendar` in `primitive/popover` | `contract/component/start-date-field.svelte` |
| an amount | `primitive/input-group` with the riyal sign | `contract/component/form.svelte` |
| a status to read at a glance | `cell/status.svelte` | `complex/unit/component/directory.svelte` |
| a status with a problem to act on | `primitive/callout` with its act, in its tone | `organization/component/standing.svelte` |
| a list of records | the list shell with `block/record-card.svelte` | `complex/component/card.svelte` |
| a record's facts | `block/specification.svelte` | `complex/component/details.svelte` |
| a record card's facts, each named, side by side | `cell/field.svelte` in a grid two across | `organization/role/component/card.svelte` |
| detail few readers need | `primitive/collapsible` | `error/component/detail-disclosure.svelte` |
| a small setting beside what it changes | `primitive/popover`, applied in place | `dashboard/component/ending-soon.svelte` |
| a secondary act on a record | the record card's menu, and `block/record-action-control.svelte` on its page | `complex/component/details.svelte` |
| a secondary act on a row of a growing list, in settings | `block/settings-row.svelte`'s `menu`, in the menu's default tone even for an act that ends something | `organization/session/component/machines.svelte` |
| an act that ends something, in settings | `block/settings-row.svelte` marked `error`, in the group's `end`, its button alone in the error tone, words with no glyph | `organization/component/disconnect.svelte` |
| a confirmation | `block/confirm-dialog.svelte`, or `block/delete-dialog.svelte` for a delete that asks | `contract/component/host.svelte` |
| an act on a selection | `block/selection-dialog.svelte` | `complex/component/directory.svelte` |
| a write: create or edit | `block/form-surface.svelte` at the form's weight | `complex/component/form.svelte` |
| a transient result | a toast through `$lib/notification` (`primitive/sonner`) | `notification/component/provider.svelte` |
| a wait on a read | `block/loading.svelte` with a `primitive/skeleton` shape | `list/component/list.svelte` |
| a long-running task with stages | `primitive/progress` | `startup/component/loading.svelte` |
| a short hint | `primitive/tooltip` | `create/component/control.svelte` |
| nothing to show yet | `block/empty.svelte`, kind `nothing-yet`, with the create | `list/component/empty.svelte` |
| a set of settings | `block/settings-group.svelte` of `block/settings-row.svelte`, one under the next in a `block/settings-grid.svelte` | `organization/component/settings-account.svelte` |
| detail few readers need, under a setting | `block/settings-row.svelte`'s `details` | `settings/component/updates.svelte` |
| a row's control whose words a tooltip can carry | `primitive/button` at `icon-sm` with its `aria-label`, in `primitive/tooltip` saying the same | `settings/component/diagnostics.svelte` |
| an icon control showing what it is doing | its own glyph moving on the motion tokens: turning (`animate-spin`, the spinner primitive's turn, with `aria-busy`) while it works, or crossing to a second glyph (`transition-[opacity,scale]`, `duration-quick`, `ease-move`) once pressed; `reducesMotion` read at the press and `motion-reduce:` as well, so the state still changes but nothing moves | `settings/component/updates.svelte`, `organization/component/standing.svelte`, `settings/component/diagnostics.svelte` |
| a picture that is changed by pressing it | the preview itself as a `primitive/button` (ghost) named for the change, in `primitive/tooltip` saying the same, a small glyph on its corner; no button beside it, and a plain picture for a reader who may not change it | `organization/component/mark.svelte` |
| removing a picture that is changed by pressing it | a `primitive/button` at `icon-sm` on the preview's top corner, the preview's sibling and never inside it, its glyph alone in the error tone with its `aria-label`, in `primitive/tooltip` saying the same, opening `block/confirm-dialog.svelte`; drawn only while there is a picture, and no end row in the card | `organization/component/mark.svelte` |
| a page section switch | `block/section-switch.svelte` | `settings/component/area.svelte` |
| several commands behind one control | `primitive/dropdown-menu` | `list/component/list-toolbar.svelte` |
| a field's error | `block/field-error.svelte` | `complex/component/form.svelte` |

## Anti-patterns seen here

Each is something this repository drew and took back, or that its research found the sources warn
against.

- **A box inside a box.** A card drawn inside a card, or a group's card around rows that are cards
  already. Apple's *Boxes*: nested boxes "make your interface feel busy and constrained" (research
  12). Effort 846's requirement 1 keeps the members and roles directories' own cards and gives only
  their heading the group's treatment for this reason.
- **Separators doing a group's work.** The settings sections were `Field.Set` blocks split by
  `primitive/separator`, legends and sentences with one outline button each, and nothing grouped
  (effort 846, *Problem*). A set of settings is `block/settings-group.svelte`.
- **Folding a status.** A status is read on the row, in words, and never put behind a disclosure
  (`how-production-apps-organize-a-settings-section`, finding 5). The sync standing was a muted
  sentence beside a button until effort 846; it is an item with a toned glyph and its name.
- **An icon alone where a word fits.** The list's export was an icon that could say *export* and
  nothing else, so a second format and the other direction had nowhere to go (*Export and import*);
  a button among labelled neighbours carried no glyph (effort 846, requirement 5). A status icon is
  the stated exception, with its word in the tooltip, except on a tile.
- **A form for what a page does.** Who held a workspace was a dialog of switches under one save,
  opened from the workspace card; the human found "the form looks bad the switch it needs to be a
  better looking maybe a page details like how records have pages" (effort 846, ticket 49). A
  workspace's members live on its page: a member is found by search and put in at once, and each
  member in it is a card whose menu takes them out (ticket 50).
- **A dialog for what a popover does.** A small setting applied in place opens a popover beside it
  (the ending-soon window); a dialog is for what must be answered before going on (research 8).
  The window was a field with a *save* step two screens away until effort 846.
- **A dangerous act that looks benign.** *Disconnect*, *forget Turso account* and *delete
  organization* were outline buttons like their neighbours (effort 846, *Problem*). An act that
  ends something is last in its group, its button in the `error` tone, words with no glyph; the
  row's own glyph and name stay neutral, so the colour marks the one thing that acts (effort 846,
  tickets 31 and 38).
- **A button repeating its row's glyph.** The disconnect's button carried the unplug its row led
  with, the handover's the crown, the sign-outs the door, the password's the key, and sync the
  arrows its syncing state led with; the human found it "odd using the same icon of the sectio
  ntitle and descripto in the action button" (effort 846, ticket 38). A row's control is words
  alone, or an icon alone named by a tooltip, never the row's or the card's glyph again;
  `app/tests/settings-area.svelte.test.ts` walks every card for it.
- **Two cards saying one thing.** The Turso account stood as a card of its own beside the leaving
  card, and the human read its forget as the same act as *disconnect this machine* (effort 846,
  ticket 38). The account's state, its reconnect and its forget are rows of the owner's leaving
  card.
- **Two cards side by side in settings.** A two-column grid of settings cards, a card spanning
  both, made the eye zigzag and the tabs disagree about where a card stood; the human asked for
  "each card is under the next card" (effort 846, ticket 31). A section is one column.
- **A select for a few options.** It hides all but one behind a press (*Field kinds*,
  `design/tests/few-options.test.ts`).
- **A hand-coloured notice box.** A notice is `primitive/callout` in the tone vocabulary
  (*Feedback*, *Tone*).
- **A tooltip holding what the reader needs, or something to press.** The sources agree a tooltip
  is supplemental and never interactive (research 9); a refusal's reason is the exception
  [[rules/interface]] states under *Guidance*, since the control itself is still reachable.
- **A spinner in place of content.** A wait on a read is the loading block (*Loading*).

## Gaps

The package holds no radio group, accordion, tab panel, hover card, toggletip, alert-dialog
primitive, table, slider or pagination. Where a need would reach for one, the repository answers
with what it holds: a toggle group for one choice among few, collapsibles for folding groups, the
section switch for a page's sections, a dialog under the confirming blocks, record cards for a
list. A new primitive is added through the CLI ([[references/shadcn-svelte]], [[rules/frontend]]
under *Components*).

## Related

- [[rules/interface]]: look, placement, and the pattern for each act; it binds this choice.
- [[rules/frontend]]: how a component is written, and which `block/` a composite lives in.
- [[references/shadcn-svelte]]: adding a primitive.
- [[efforts/846-the-settings-and-the-record-cards-are-rethought/evidence/research/what-each-kind-of-component-is-for]]:
  the sources behind the categories.
