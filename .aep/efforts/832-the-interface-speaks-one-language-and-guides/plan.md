---
use-when: "building a ticket in effort 832 and the approach is not obvious from the spec"
---

# Architecture

The spec is [[efforts/832-the-interface-speaks-one-language-and-guides/spec]]; nothing here
restates it. The current seams are in its evidence
([[efforts/832-the-interface-speaks-one-language-and-guides/evidence/research/how-the-app-does-each-act-today]])
and were read again for this plan on 2026-09-24 at `84bedf0e`.

Four choices were the human's, made on 2026-09-24 from tables of alternatives. Everything else
below has one reasonable shape in this codebase and is stated as the approach.

## 1. A record act is declared once per concept (chosen)

Each concept declares an ordered list of its acts in `apps/desktop/src/lib/<concept>/acts.ts`,
and one **host** per concept owns the forms and dialogs those acts open. The record card's menu,
its context menu, the record page's action cluster and the command menu are all projections of
the one list, so label, icon, order, tone, shortcut, availability and confirmation cannot differ
between them.

The host is mounted once, in the frame, so the command menu reaches every act from any screen and
there is one `ContractForm` instead of the four mounted today (contract actions, contract details,
record verbs, and the directory through actions). A surface asks the host to run an act; it never
mounts a form of its own.

**Lost:**
- *Keep the per-surface wiring and add a test comparing lists.* Least churn, but every act stays
  written three times, and the test only reports drift after it has happened.
- *Register every act in the shortcut registry at runtime and have surfaces query it.* Hides
  order and per-record availability behind a registry that also answers keys, and makes a card's
  menu depend on what happens to be registered at the moment it renders.

## 2. Two appearances: token blocks switched by a class (chosen)

`tokens.css` holds the light values on `:root` and the dark values under `.dark`. A module the
application owns, `apps/desktop/src/lib/platform/appearance.ts`, resolves `system | light | dark`
(system through `matchMedia('(prefers-color-scheme: dark)')`, followed live), sets the class and
`color-scheme` on `<html>`, and is applied during startup **before the window is shown** (the
window is created `visible: false` and shown by the application), so no frame paints in the wrong
appearance. The chart primitive's literal `.dark [data-chart]` selectors keep working unchanged.
`mode-watcher` is removed; sonner takes its theme from the resolved appearance.

**Lost:**
- *CSS `light-dark()` in one block.* Shadows, borders built on alpha, and anything that is not a
  colour cannot use it, so a second mechanism would exist anyway.
- *Tauri's window `setTheme` driving the webview's preference.* One source, but its behaviour on
  WebKitGTK is unverified and the override would route through a native call for a purely visual
  concern.

## 3. Refusals travel as codes (chosen)

A user-facing refusal carries a **code and its parameters**, never prose the client shows
verbatim. The client turns the code into a sentence in the reader's language, and a form maps a
code to its field instead of matching English substrings. Rust's user-facing refusals take the
same shape through the `reason` the `Refused` variant already carries. Turso's own text, which is
not ours to translate, appears only behind a details disclosure.

`[[rules/api-layer]]`, under *Errors*, is revised in the ticket that lands this: a `BAD_REQUEST`
carries a refusal code, and its message is a developer's description, not the user's sentence.

**Lost:**
- *Routers write the sentence in the current locale.* The domain would depend on i18n, forms would
  still match text, and a language switch mid-session leaves stale sentences in the cache.
- *Localise the routers and leave Rust English.* Fails requirement 23.

## 4. List motion: same-document view transitions (chosen by prototype)

A directory commits a changed result set inside `document.startViewTransition`, and each record
carries a `view-transition-name` derived from its id, so a record created, deleted, restored by
undo or moved by a sort animates from where it was to where it is, including rows the virtualiser
adds or removes. Where `startViewTransition` is missing (macOS below 15), the set is committed
directly and nothing animates. The human judged it on 2026-09-24 against the seeded workspace
([[efforts/832-the-interface-speaks-one-language-and-guides/evidence/prototypes/list-motion]]).

Two things the prototype showed that the build must fix: **a search keystroke must not
transition** (only a change caused by a mutation, an undo or a sort does), and **the snapshots must
stay inside the list's clip** during the 200 ms.

**Lost:**
- *Svelte `animate:flip` with `in`/`out`.* It moves only rows already on screen, and it faded rows
  the virtualiser brought in during ordinary scrolling.
- *Enter and leave only.* It was the floor, and it leaves a re-sort with no motion at all.

# Components

**Design package (`packages/design/src/lib`)**

- `tokens.css`: light on `:root`, dark under `.dark`; `--font-sans` naming the bundled pair;
  radius and shadow in Tailwind's `--radius-*` and `--shadow-*` namespaces as a named ladder
  (a `raised` and an `overlay` shadow per appearance); motion as `--ease-enter`, `--ease-exit`,
  `--ease-move` and `--duration-quick` / `--duration-base` / `--duration-slow` (150, 200, 250 ms);
  the header's "one palette, no modes" rewritten. The reduced-motion block stays and gains
  `view-transition` suppression.
- `fonts/`: Readex Pro (variable, both scripts) as subset `woff2` with its licence file, loaded by `@font-face` in `tokens.css` with
  `font-display: block` (the files are local, so blocking costs nothing and avoids a flash).
- `block/record-card.svelte`: `RecordCardAction` gains `shortcut?: ShortcutCombination` (shown as
  a `Kbd` in both menus) and `group?: string` (a separator between groups). Its `variant` becomes
  `tone: 'neutral' | 'error'`, the vocabulary `record-action-control` already speaks.
- `block/confirm-dialog.svelte` (new): the confirm pattern for an act that is not a delete,
  titled and labelled with the act's verb. `delete-dialog.svelte` is kept for the cascading and
  irreversible deletes only.
- `block/loading.svelte` (new): the one loading treatment, a skeleton shaped by a snippet the
  surface passes, shown after a 200 ms delay and held at least 300 ms.
- `block/section-switch.svelte` (new): the one section control, link-based on `?section=`, used by
  the record surface and by settings. It replaces the record surface's bound `Tabs` plus `goto`
  side effect and the settings rail's hand-built `<nav>`.
- `block/empty.svelte` (new or folded into the list shell): two states, *nothing here yet* with the
  create act, and *no match* with a clear act.

**Application (`apps/desktop/src/lib`)**

- `design/acts.ts` (new): the `RecordAct<T>` type and its projections, `toCardActions`,
  `toPageActions`, `toPaletteVerbs`.
- `<concept>/acts.ts` (new) for tenant, complex, unit, contract, payment; `organization/acts.ts`
  for members and workspaces.
- `<concept>/component/host.svelte` (new): mounts the concept's forms and dialogs once and exposes
  `run(actId, record)` through a module-level store (the `organization/dialogs.svelte.ts` shape
  already in the tree). Mounted in `layout/component/frame.svelte`.
  `contract/component/actions.svelte` and `layout/component/record-verbs.svelte` retire into it.
- `platform/appearance.ts` (new), and an appearance field in `settings` end to end.
- `platform/locale.ts`: `ar` maps to `ar-SA-u-nu-latn`.
- `error/refusal.ts` (new): `toRefusalText(error, LL)` and `fieldOfRefusal(code)`.
- `design/block/list.svelte`: the create control and key, the two empty states, the loading
  block, and the motion mechanism the prototype chooses.
- `layout/navigation.ts`: the breadcrumb builds only from routes that exist and names the record.
- `organization/setup.ts` and `routes/organization/new`: two steps; the workspace is created in
  the startup hand-over.
- `contract/router.ts`: `create` takes units; a term-based assignable read.

# Interfaces

**A record act**, in `design/acts.ts`:

```ts
type RecordAct<T> = {
	id: string;                                  // 'contract.renew', stable, the palette's key
	label: (t: TranslationFunctions) => string;
	icon: IconComponent;                         // lucide only
	tone?: 'neutral' | 'error';
	group?: 'primary' | 'lifecycle' | 'destructive';   // separators, and the order across concepts
	shortcut?: ShortcutCombination;              // shown on every surface, answered while a record is focused
	appliesTo?: (record: T) => boolean;          // hidden when false
	unavailable?: (record: T, t: TranslationFunctions) => string | undefined;  // shown, disabled, with the reason
	run: (record: T) => void;                    // asks the host
};
```

Acts in the `destructive` group come last in every concept. Copy details and duplicate are acts
like any other, so a card offers them wherever the page does.

**Create**: every concept's host exposes `create(prefill?)`. The list's create control, the
palette's create group and the create key all call it. `?create` survives as the address the
palette navigates to, consumed by the host rather than by each directory. Contract's `prefill`
takes `{ tenantId?, unitIds? }` (requirement 21).

**Appearance**:
- Rust `Settings` and `SettingsStored` gain `appearance: Appearance` (`System | Light | Dark`,
  `serde(default)` system), and `SettingsChangeset` gains `appearance: Option<Appearance>`.
- `host.ts` `Settings` and `SettingsChangeset`, the settings router's zod input, and a
  `useSetAppearance` hook follow the locale's optimistic pattern.

**Refusals**:
- A router throws `refuse(code, params?)`, which builds `TRPCError({ code: 'BAD_REQUEST', message,
  cause: { refusal: { code, params } } })`.
- `errorFormatter` copies `refusal` into `shape.data`.
- `RefusalCode` is a string union per concept (`contract.endBeforeStart`,
  `contract.unitsOverlap`, ...). Its sentences live under `common.refusals` in both locales.
- `onMutationError` shows `toRefusalText`.
- Rust: `Error::Refused { reason }` is the carrier for every refusal a person can cause, and
  `reason` joins the same union's namespace.

**Contract create**:
- `ContractCreateSchema` gains `unitIds: z.array(z.string()).default([])`.
- `create` checks `ensureUnitsAssignable` against the proposed term, then inserts the contract and
  its `contract_unit` rows in one `ctx.db.batch`, as `renew` already does (`router.ts:579`), then
  reconciles `{ contractIds, unitIds }`.
- `units.getAssignableForTerm({ start, end, search? })` answers the form before a contract exists.
- `useCreateContract` touches `contracts` and `units`. Its inverse clears the units, then deletes,
  as `useRenewContract` does.

**Onboarding**: `SETUP_STEPS` becomes `['connect', 'name']`. After `organization.create`
resolves, the page calls `startup.standingChanged({ prepare })`, where `prepare` creates the first
workspace named after the organization. The loading surface shows it as its first stage, so the
walk hands over to exactly one loading pass. A failed `prepare` lands on the existing
no-workspace surface, which already offers the create.

# Data Model

- Settings file: an `appearance` key, defaulting to system for every existing file.
- No schema change. `contract_unit` rows are written by `create` as `renew` already writes them.

# Technical Approach

The order is the spec's phasing, and each step builds on the one before.

1. **The language.** Tokens for both appearances with the appearance setting; the typeface and
   type scale; one icon family (tabler removed, the mirror list written); shape and elevation
   tokens; motion tokens; Western digits. These come first because every later ticket draws with
   them, and a surface restyled before them is restyled twice.
2. **Acts and hosts, concept by concept.** Contract first: it has the most acts and the four
   mounted forms, so it proves the shape. Then tenant, complex, unit and payment, then members and
   workspaces. The palette's create and verbs move to the projections in the same step as each
   concept.
3. **The rest of the catalogue.** The confirm pattern and undo-first delete; loading, empty and
   feedback; the section switch, breadcrumb and back control; the form weight rule and the
   field-kind map. Written into `[[rules/interface]]` as each lands.
4. **Refusal codes.** Before the workflows, because the contract form's new unit refusals and the
   onboarding refusals are written in codes from the start instead of being converted later. The
   first commit checks whether tRPC keeps `cause` on errors thrown from `ctx.host`, since the
   onboarding refusals depend on it.
5. **Guidance and copy.** After the catalogue, because the next-step landing and disabled reasons
   are properties of the acts and hosts.
6. **Workflows.** Onboarding and join; contract with units; starting a contract from a tenant or
   a unit.
7. **The walk.** Every route in both directions and both appearances, the two suspects resolved,
   the screenshots attached to the pull request.

**The form weight rule** (open question 2 of the spec): a concept's weight is decided by its
create form and holds for edit. It is **heavy** when the form chooses other records or writes
more than one record (contract, complex with its units, tenant with its phone composite, member),
and **light** otherwise (payment, unit, rename, password). So complex is heavy for both.

**The field-kind map** (requirement 15), written into `[[rules/interface]]`:

| Value | Control |
| --- | --- |
| a choice of two to four, exclusive | toggle group |
| a setting that takes effect at once | switch |
| a choice of five or more | select, or a combobox when searched |
| another record | combobox over its search |
| a date | the popover calendar, given the reader's locale |
| money | the input group with the riyal sign as adornment, `inputmode="decimal"` |
| a phone | country select plus number, `dir="ltr"` |
| a status | the status icon cell |
| a count | the count cell |

The contract's cycle (four options) becomes a toggle group under this map.

# Integration

- **Rules revised, each in the ticket that needs it:**
  - `[[rules/frontend]]`: *Motion* (the table and "unavailable"), *Styling* (the token layer's
    one palette), *i18n* (digits).
  - `[[rules/interface]]`: a section per act, *Contract unit transfer*, *Record card actions*
    (shortcuts and groups).
  - `[[rules/api-layer]]`: *Errors*.
- **Contexts:** `[[contexts/repository]]` Constraints gains the two appearances.
- **Effort 810's reading of digits** is reversed. Its tests asserting Arabic-Indic digits are
  rewritten to Western, and the tests proving a search typed in Arabic-Indic digits still matches
  stay.
- **Primitives are edited by hand**, never regenerated.

# Migration

- Existing settings files read `appearance` as system.
- `@tabler/icons-svelte` and `mode-watcher` leave the dependency lists.
- Every English refusal string becomes a code, and the forms' substring matching (14 sites) goes
  with it.
- `contract/component/actions.svelte` and `layout/component/record-verbs.svelte` are deleted when
  the contract host lands.

# Testing Strategy

Each check below is named against the spec's criteria. **node** means a `node:test` suite and
**component** means a Vitest component test.

- **AC 1**
  - node: `tokens.css` declares the `@font-face` files, and they exist in the package.
  - A lint-style test finds no arbitrary `text-[`.
  - component: money and count cells carry `tabular-nums`.
- **AC 2**
  - node: parse both token blocks and assert every colour token has a light and a dark value.
  - A hand-written oklch-to-luminance function asserts WCAG AA for foreground and each tone
    against the surfaces they sit on. No colour library is added.
  - node: appearance resolution under system, light and dark, and the live follow.
  - Rust: the settings round-trips the new key, and an old file defaults it.
- **AC 3**
  - node: no import of `@tabler/icons-svelte` anywhere.
  - component: each menu's items carry icons all or none.
- **AC 4**
  - node: no raw `duration-` or `ease-` class outside the tokens.
  - component: under reduced motion no transform or opacity animation is applied.
  - The list motion is checked by hand in the walk.
- **AC 5**: node, no arbitrary `shadow-[` or `rounded-[`.
- **AC 6**: review against the evidence inventory's [DIFF] list, ticked in the pull request.
- **AC 7**: component tests on the unit panes and settings directories using the shared search.
  The palette opens on every route.
- **AC 8**: node, for each concept the four projections of `acts.ts` yield equal ids, labels,
  icons and order for a record.
- **AC 9**: component, one create control position. node, the create key registration and the
  palette's create group cover five concepts.
- **AC 10**: component, submitting an invalid form focuses the first invalid field.
- **AC 11**: router and component tests. A delete with no dependants runs with no dialog and an
  undo offer; a complex with contracts asks; terminate uses the confirm dialog.
- **AC 12**: node, no direct `toast` import outside the shared handlers.
- **AC 13**: component, the list's two empty states.
- **AC 14**: node, every breadcrumb target is a route id. component, the section switch on a record
  and in settings. `?section=history` is addressable.
- **AC 15**: component, the contract's cycle renders a toggle group.
- **AC 16**: component, the payment form's prefill and the disabled-act reason. The landing on a
  created contract is checked in the walk.
- **AC 17**: node, English strings over 120 characters are allowed only for listed
  irreversible-confirmation keys.
- **AC 18, 19**: component, the setup walk has two steps. The single loading pass is checked in the
  walk against a real Turso account, by the human.
- **AC 20**: router tests, create with units in one batch, refusal on overlap, and undo restoring
  nothing.
- **AC 21**: component, the tenant and unit pages open the contract form prefilled.
- **AC 22**
  - node: formatters under `ar` yield Western digits.
  - The walk's screenshots are attached to the pull request.
  - A node lint finds no `tracking-` on text that renders Arabic.
- **AC 23**: router tests in Arabic for the payment and contract refusals. A Rust test asserts that
  every user-facing refusal carries a reason.

# Operational Considerations

- The onboarding and join changes are verified only against a real Turso account. That check is
  the human's, as it was for 826 and 828, and it is named on the ticket.
- The walk (every route in two languages and two appearances) is made by driving the dev build.
  Per standing practice, ask before driving the app while the human is at the machine.
- Font files add a few hundred KB to the bundle. That is accepted, and nothing loads over the
  network.

# Technical Risks

- **tRPC may wrap errors thrown from `ctx.host`** into `INTERNAL_SERVER_ERROR` and keep `code` only
  on `cause`. If so, the onboarding's refusal matching is already broken today. It would first show
  as the refusal-code ticket's first test failing, and the fix is reading `cause`.
- **View transitions suspend hit-testing** for their duration. On a fast double action (delete,
  then click the next row) the second click could land on the document. The prototype has to try
  exactly that.
- **The light palette is new work.** Contrast and elevation that read well in dark may not in
  light. The token test catches contrast; elevation is judged by eye.
- **One branch, many tickets.** A late ticket can conflict with an early one. The language lands
  first, so later tickets conflict with each other rather than with it.
- **WebView2 may keep Ctrl+N for itself** (a new window) even when the page handles the key. The
  create key is chosen after the prototype run checks this.

# Prototypes

All four were answered on 2026-09-24 on the switcher, against the developer workspace seeded for
the run, and their code was deleted. Each has its evidence under `evidence/prototypes/`:

1. **The typeface:** Readex Pro, over Inter with IBM Plex Sans Arabic and Inter with Noto Sans Arabic
   (`the-typeface-pair`).
2. **The light appearance:** kept beside dark and system. Its draft values are the starting point
   for the light token block (`the-light-appearance`).
3. **List motion:** view transitions (`list-motion`, and *Architecture 4* above).
4. **The create key:** Ctrl/Cmd+N; WebView2 lets the page answer it (`the-create-key`).
