---

---

# Question

How does the application handle each recurring act, workflow, and visual concern today, and
where do two surfaces do the same thing differently?

# Sources

The source tree at `5b0d1480`, read on 2026-09-24 by three read-only surveys (interaction
patterns, workflows, visual system). The app was not run. `APP` is `apps/desktop/src/lib`, `DS`
is `packages/design/src/lib`. Every finding below is an observation of that tree. **[DIFF]**
marks two surfaces doing one act differently.

# Findings

## Surfaces

- `/` dashboard (`dashboard/component/landing.svelte`): a sticky band of three figures
  (collected ring with a period dropdown, occupied units ring, outstanding money), then one
  section per attention rank (overdue, owing, ending soon), four rows each, "see all (n)".
- `/tenants`, `/complexes`, `/contracts`: directories on the shared list block
  (`APP/design/block/list.svelte`) with record cards.
- Record pages on `DS/block/record-surface.svelte`: tenant, complex, unit, contract (payments,
  units, history), payment.
- `/settings?section=` general, account, organization, workspaces (`settings/component/area.svelte`).
- `/organization/new` (setup walk), `/organization/join` (connect screen), startup screens on
  `DS/block/standalone-surface.svelte`.
- Sidebar has four destinations (dashboard, tenants, complexes, contracts); units and payments
  have none. Ctrl/Cmd+K palette (`layout/component/palette.svelte`) with record search, go to,
  create (tenant, complex, contract), actions.

## Acts, and where they diverge

**Search, filter, sort.** The list shell: leading search icon, 250 ms debounce, `/` focuses,
result count, icon-only filter and sort menus, import/export menu.
- [DIFF] contract units panes (`contract/component/units.svelte:88-94`): a bare search input,
  no icon, no debounce, no `/`.
- [DIFF] the unit directory and the payment ledger have no sort.
- [DIFF] the dashboard's period picker is a text button; list filters are icon-only.
- [DIFF] settings members and workspaces do not use the list shell: no search, sort or export.

**Create.** An icon-only "+" at the end of the list toolbar; palette create group for three
concepts through a create intent.
- [DIFF] "+" is tabler in lists, lucide in settings (and `UserPlus` for members).
- [DIFF] the dashboard's "renew" is the only text-labelled row action in the app.
- No create key.

**Edit.** Everything goes through `DS/block/form-surface.svelte`, heavy (edge sheet) or light
(centred panel). There is no inline edit.
- [DIFF] complex is heavy on create and light on edit (`complex/form.svelte:118`).
- [DIFF] domain submits are text-only; organization and startup submits carry icons.
- [DIFF] "rename" on workspaces, "rename" and "edit" on members, "edit" on domain records.
- [DIFF] the unit record page has no edit or delete; only its card does.
- Money inputs are `type=number` with no currency adornment. The input group is used only in
  organization forms.

**Delete, confirm, undo.** A single-record `DS/block/delete-dialog.svelte` confirms every delete
("you can undo this while the app is open") and lists blockers. Bulk goes through
`DS/block/selection-dialog.svelte`. Undo is a toast action plus Ctrl+Z/redo, for complex, unit,
contract, tenant, payment; no undo on organization acts.
- [DIFF] the delete dialog also confirms terminate and restore.
- [DIFF] deleting the organization is a heavy form with a password, not the dialog.

**Record actions.** A record card carries a "..." menu and a context menu from one list; a record
page carries a copy/duplicate cluster and action controls.
- [DIFF] cards never offer copy details; pages do. The payment page has duplicate; its card does
  not. The contract card and page differ by copy.
- [DIFF] edit is `square-pen` in domain code, `pencil` on workspaces.

**Empty, loading, error, not found.**
- The list's empty state says "no results" even when nothing has ever been created, with no
  create action.
- [DIFF] the dashboard uses a dashed empty with a description; the unit panes use a hand-built
  dashed paragraph.
- [DIFF] loading is six treatments: spinner size-6 (list, dashboard), spinner size-8 with a line
  (record), spinner size-8 without (settings), skeleton (unit pane), progress bar (startup).
- `+error` offers home only; the caught error offers retry and home. A missing record shows the
  generic "no results". An unknown route has no not-found wording.

**Toasts and callouts.** The rule is that toasts go through `APP/design/mutation.ts` and
`error/toast.ts`.
- [DIFF] direct toast calls in `contract/component/form.svelte:306`,
  `organization/component/made-link.svelte:57`, `routes/settings/+page.svelte:110`,
  `design/block/list.svelte:261`, `settings/update-announcement.ts:89-91`.
- [DIFF] the contract units lock notice is hand-styled rather than a callout.

**Navigation.**
- [DIFF] the back control is `DS/block/back-control.svelte` on record pages, a separate
  `organization/component/back-glyph.svelte` on the onboarding screens.
- [DIFF] record sections use Tabs; settings sections use a hand-built underlined nav, both on
  `?section=`.
- The breadcrumb links `/complexes/units`, `/contracts/units`, `/contracts/payments`, none of which
  is a route.

**Shortcuts.** Mod+K palette, sidebar toggle, `/` list search, Mod+Z undo, Mod+Shift+Z / Mod+Y
redo, arrows and Enter in lists. No create, edit, delete or save key. The shortcut sheet opens
only from a titlebar button.

**Status and counts.** Status is an icon with its word in the tooltip; counts are icon plus
number. [DIFF] workspaces uses a raw filled dot as its status.

**Primitives never used by the application:** accordion, alert-dialog, aspect-ratio,
button-group, card, carousel, chart, data-table, drawer, hover-card, input-otp, item, menubar,
native-select, navigation-menu, pagination, radio-group, range-calendar, resizable, scroll-area,
slider, switch, table, toggle-group. Sheet is used only by the shortcut sheet.

**Icons.** Two families: `@lucide/svelte` (about 211 imports) and `@tabler/icons-svelte` (about
52, shell, list toolbar, cells, dashboard). The same concept comes from both (plus, x,
chevron-down, search). Sizes are mostly `size-4`, with outliers from `size-2` to `size-7`.

## Workflows, as step counts

- **Create an organization:** loading, then the wall ("welcome", two choices), then three cards
  of the walk. Card one shows five statements before one button, then a browser consent. Card two
  takes organization name, username, password (a Turso group field only on refusal). Card three
  takes the first workspace's name. Then `/`, a second startup loading pass, the dashboard. About
  4 to 5 typed fields, 5 clicks, 2 loading passes.
- **Join by link:** link and six-character code, then password twice, then the way in and a
  loading pass. A machine link ends at the wall.
- **Sign in:** the wall is the organization's name, username, password; "trouble signing in?"
  discloses link and disconnect.
- **Add a complex:** name, location, an inline unit-run entry ("a 1-18"); create; stays on list.
- **Add a tenant:** name, national id, phone (country select plus number).
- **Create a contract:** seven fields (tenant combobox, government id, cycle, cost, start date,
  number of cycles, end date calculated). **Units are not in the form**: find the contract, open
  it, open its units tab, add each unit. Units lock once any payment exists, so this must happen
  before the first payment. A tenant's page cannot start a contract.
- **Record a payment:** open the contract (payments is the default tab), "+", date (defaults to
  today) and amount, create.
- **Export:** menu, dialog choosing csv or workbook, OS save dialog, toast.

## Copy

About 705 keys per locale (`APP/i18n/en/index.ts`, `APP/i18n/ar/index.ts`). 26 English lines
exceed 160 characters, mostly organization acts, onboarding (`organization.setup.accountCreation`,
`succession`), and notices (`contracts.payments.fullyPaidNotice`, `terminatedNotice`,
`contracts.form.calculatedEndDateHint`). Routers throw English messages that can reach the UI
(`payment/payment.ts:111`, `api/trpc.ts`, `complex|contract|payment/router.ts`); Turso's own
error text is appended untranslated. "sar" is written into `contracts.payments.remaining`.

## Visual system

- **Dark only**, by decision: `DS/tokens.css` says "one palette, no modes". Six neutral surface
  levels by lightness (background 0.13 to accent 0.26), one blue for primary and ring, named tones
  destructive, info, warning, success, permitted, money. `app.html` hard-codes `class="dark"` for
  the chart primitive's selectors.
- **No typeface.** No `@font-face`, no font package; English and Arabic fall to Tailwind's system
  stack. Sizes mostly `text-sm` (181) and `text-xs` (104), with arbitrary `text-[0.72rem]`,
  `text-[0.8rem]`, `text-[10px]`.
- **Radius and shadow are ad hoc**: `--radius` feeds only the input group; `rounded-2xl`,
  `rounded-xl`, `rounded-md`, `rounded-3xl` mixed; shadows include arbitrary values on the record
  card.
- **Motion has no vocabulary**: durations 100, 150, 200, 300, 500, 700 ms set per component,
  easings mixed. `tw-animate-css` is the only animation package. Svelte `transition:`, `animate:`,
  `svelte/motion`, `prefersReducedMotion` and view transitions are used nowhere. A global
  reduced-motion block in `tokens.css` zeroes transitions; `motion-safe:` appears in seven files.
- **Bidirectional:** direction set on `<html>`, `<body>`, the frame, and read by 22 portalled
  primitives from `contract.direction`. Logical classes almost everywhere (131 hits); the four
  physical ones centre dialogs. Mirroring by `rtl:rotate-180` on back, sequence chevrons,
  pagination, calendar. Two suspects: `primitive/sidebar/sidebar-rail.svelte:28` pairs `start-*`
  with a physical `-translate-x-1/2`; `block/record-surface.svelte:150` carries an unexplained
  `rtl:flex-row-reverse` that may undo the header's mirroring. Arabic formats through `ar-SA`,
  which yields Arabic-Indic digits; money is isolated LTR with the riyal sign on the left.
- **Window:** 1124x824 default, 640x480 minimum, no decorations, custom titlebar `h-12`; sidebar
  16rem inset, collapsing to an icon rail, a drawer below the `shell` breakpoint (48rem); page
  frame `max-w-5xl p-6`; list rows 56px.

# Conclusion

The application already has a shared list shell, record surface, form surface, record card,
palette, undo and tone vocabulary. What it lacks is their use everywhere (about twenty [DIFF]s
above), a typeface, a light appearance, a motion vocabulary, guidance in its empty states and
first run, and short copy. Its two longest workflows are creating an organization and creating
a contract with units.

# Not checked

- Nothing was run; step counts are read from code, not timed. Cold launch of about 5.9 s is the
  figure recorded by earlier work, not measured here.
- Contrast ratios of the current palette were not computed.
