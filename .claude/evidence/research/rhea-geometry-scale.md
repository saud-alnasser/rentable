---
owner: repository
kind: research
falsifies: []
---

# What are Rhea's geometry values, and what has to change when they are hand-ported onto these primitives?

Verified against: shadcn-svelte registry as served on 2026-08-03; CLI `shadcn-svelte@1.5.0` (published 2026-08-02); this repository at `8ce1962`
Status: answered. The scale below is transcribed and citable. Four deviations are required rather than optional — three of them break silently if the class strings are copied verbatim, which is the failure mode ADR 0007 already warns about for a different reason.

Taken for [#220](https://github.com/saud-alnasser/rentable/issues/220). [ADR 0007](../../decisions/0007-rhea-geometry-is-hand-ported.md) settled that Rhea is transcribed by hand; this is the transcription.

## Answer

**Rhea is a control-density and radius change, not a table-density change.** Its table is byte-for-byte the default's geometry — `h-10` header, `p-2` cells — so nothing in Rhea makes rows tighter. The density comes from controls shrinking by one step (button `h-9`→`h-8`, input `h-9`→`h-8`, select trigger `h-9`→`h-7`, toggle `h-10`→`h-7`), from a new `xs` step below `sm`, and from radius moving up (`rounded-md` → `rounded-2xl` on controls, `rounded-lg` → 24px on surfaces).

Against **this repository's current primitives** the drop is larger than against upstream default, because the buttons here already run a step high: `h-10` default / `h-9` sm / `h-11` lg. Rhea's `h-8` / `h-7` / `h-9` is **8px off every control height**.

**Rhea carries no theme.** Its registry index holds 56 `registry:ui` items and no `registry:style` or `registry:theme` item, so there are no CSS variables to adopt — which independently confirms the "no variable-only subset" finding ADR 0007 rejected an option on. The only custom properties Rhea introduces are component-local (`--card-spacing`).

**Three of its conventions are incompatible with this repository and fail silently.** Rhea's class strings are physical-direction (`pl-`, `border-l`, `text-left`) where the default style is logical (`ps-`, `border-s`, `text-start`) — 138 physical utilities against 30 logical, across 31 of 56 families. They target a newer Bits UI attribute contract (`data-checked:`, `data-open:`) that the installed bits-ui 2.18.1 does not emit. And Rhea's radius ladder inverts against this repository's `app.css`, where `rounded-xl` is *larger* than `rounded-2xl`.

## The scale

Tailwind's `--spacing` is `0.25rem` and the root font size is 16px, so every step below converts at 4px per unit. Pixel columns are given because the ticket asks for numbers, not directions.

### Control heights

Source: [button](https://shadcn-svelte.com/registry/styles/rhea/button.json), [input](https://shadcn-svelte.com/registry/styles/rhea/input.json), [select](https://shadcn-svelte.com/registry/styles/rhea/select.json), [native-select](https://shadcn-svelte.com/registry/styles/rhea/native-select.json), [toggle](https://shadcn-svelte.com/registry/styles/rhea/toggle.json), [badge](https://shadcn-svelte.com/registry/styles/rhea/badge.json), [tabs](https://shadcn-svelte.com/registry/styles/rhea/tabs.json), [kbd](https://shadcn-svelte.com/registry/styles/rhea/kbd.json), [checkbox](https://shadcn-svelte.com/registry/styles/rhea/checkbox.json), [switch](https://shadcn-svelte.com/registry/styles/rhea/switch.json)

| Control | Rhea | px | upstream default | here today |
| --- | --- | --- | --- | --- |
| button `xs` | `h-6` | 24 | — (no `xs`) | — |
| button `sm` | `h-7` | 28 | `h-8` | `h-9` |
| button default | `h-8` | 32 | `h-9` | `h-10` |
| button `lg` | `h-9` | 36 | `h-10` | `h-11` |
| button icon `xs`/`sm`/default/`lg` | `size-6` / `size-7` / `size-8` / `size-9` | 24/28/32/36 | — / `size-8` / `size-9` / `size-10` | — / `size-9` / `size-10` / `size-11` |
| input | `h-8` | 32 | `h-9` | — |
| select trigger `sm` | `h-7` | 28 | — | — |
| native-select `sm` / default | `h-7` / `h-8` | 28/32 | `h-9` | — |
| toggle | `h-7`, `min-w-7` | 28 | `h-10`, `min-w-10` | — |
| badge | `h-5` | 20 | (unset) | — |
| tabs list (horizontal) | `h-8` | 32 | `h-9` | — |
| menubar trigger | `h-8` | 32 | `h-9` | — |
| pagination item | `size-8` | 32 | `size-9` | — |
| kbd | `h-5`, `min-w-5` | 20 | `h-5` | — |
| checkbox | `size-4` | 16 | `size-4` | — |
| switch default / `sm` | `h-5 w-8` / `h-4 w-6` | 20×32 / 16×24 | `h-[1.15rem] w-8` | — |
| menu item minimum (dropdown, context, select, menubar) | `min-h-7` | 28 | (unset) | — |

### Spacing steps

Source: [button](https://shadcn-svelte.com/registry/styles/rhea/button.json), [input](https://shadcn-svelte.com/registry/styles/rhea/input.json), [textarea](https://shadcn-svelte.com/registry/styles/rhea/textarea.json), [select](https://shadcn-svelte.com/registry/styles/rhea/select.json), [badge](https://shadcn-svelte.com/registry/styles/rhea/badge.json), [tabs](https://shadcn-svelte.com/registry/styles/rhea/tabs.json), [card](https://shadcn-svelte.com/registry/styles/rhea/card.json), [dialog](https://shadcn-svelte.com/registry/styles/rhea/dialog.json), [popover](https://shadcn-svelte.com/registry/styles/rhea/popover.json), [tooltip](https://shadcn-svelte.com/registry/styles/rhea/tooltip.json), [dropdown-menu](https://shadcn-svelte.com/registry/styles/rhea/dropdown-menu.json), [alert](https://shadcn-svelte.com/registry/styles/rhea/alert.json), [sidebar](https://shadcn-svelte.com/registry/styles/rhea/sidebar.json)

| Where | Rhea | px |
| --- | --- | --- |
| button inline padding — `xs` / `sm` / default / `lg` | `px-2.5` / `px-3` / `px-3` / `px-4` | 10 / 12 / 12 / 16 |
| button padding beside an icon | `pr-2` … `pr-3` (`-2` on `xs`/`sm`, `-2.5` default, `-3` on `lg`) | 8–12 |
| button gap — `xs`/`sm` / default/`lg` | `gap-1` / `gap-1.5` | 4 / 6 |
| input / textarea inline padding | `px-2.5` | 10 |
| input / textarea block padding | `py-1` / `py-2` | 4 / 8 |
| select trigger | `px-3 py-2`, `gap-1.5` | 12 / 8 / 6 |
| badge | `px-2 py-0.5`, `gap-1` | 8 / 2 / 4 |
| menu content padding | `p-1` | 4 |
| menu item | `px-2 py-1.5`, `gap-2` | 8 / 6 / 8 |
| menu item inset | `pl-7` | 28 |
| select item | `py-1.5 pr-8 pl-2` | 6 / 32 / 8 |
| tabs list / trigger | `p-[3px]` / `px-1.5 py-0.5` | 3 / 6 / 2 |
| card spacing token | `[--card-spacing:--spacing(5)]`, `sm` → `--spacing(4)` | 20 / 16 |
| card header gap | `gap-1.5` | 6 |
| dialog | `p-6`, `gap-6`, header `gap-1.5` | 24 / 24 / 6 |
| popover | `p-4`, `gap-4` | 16 / 16 |
| tooltip | `px-3 py-1.5`, `gap-1.5` | 12 / 6 / 6 |
| alert | `px-4 py-3`, `gap-0.5`, icon `gap-x-2.5` | 16 / 12 / 2 / 10 |
| sidebar menu button | `px-3 py-2`, `gap-2` | 12 / 8 / 8 |
| icon inside a control | `size-4`, `size-3` on `xs` and in badge/kbd | 16 / 12 |

### Type scale

Source: [button](https://shadcn-svelte.com/registry/styles/rhea/button.json), [badge](https://shadcn-svelte.com/registry/styles/rhea/badge.json), [input](https://shadcn-svelte.com/registry/styles/rhea/input.json), [textarea](https://shadcn-svelte.com/registry/styles/rhea/textarea.json), [card](https://shadcn-svelte.com/registry/styles/rhea/card.json), [dialog](https://shadcn-svelte.com/registry/styles/rhea/dialog.json), [popover](https://shadcn-svelte.com/registry/styles/rhea/popover.json), [tooltip](https://shadcn-svelte.com/registry/styles/rhea/tooltip.json), [kbd](https://shadcn-svelte.com/registry/styles/rhea/kbd.json), [label](https://shadcn-svelte.com/registry/styles/rhea/label.json), [item](https://shadcn-svelte.com/registry/styles/rhea/item.json)

| Where | Rhea | upstream default |
| --- | --- | --- |
| button, menu item, select item, sidebar item, `item` | `text-sm` | `text-sm` |
| button `xs`, badge, kbd, tooltip | `text-xs` | `text-xs` (badge, kbd) |
| input, textarea | `text-base` with `md:text-sm` | `text-sm` (input), `text-base md:text-sm` (textarea) |
| card, dialog, popover, drawer, sheet body | `text-sm` | (unset — inherits) |
| card title, dialog title | `text-base` | `text-lg` (dialog) |
| label | `text-sm`, `leading-none` | same |

Rhea's only type change of substance is **dialog and card titles dropping from `text-lg` to `text-base`**. Everything else already matched.

### Radius

Source: [button](https://shadcn-svelte.com/registry/styles/rhea/button.json), [input](https://shadcn-svelte.com/registry/styles/rhea/input.json), [textarea](https://shadcn-svelte.com/registry/styles/rhea/textarea.json), [select](https://shadcn-svelte.com/registry/styles/rhea/select.json), [toggle](https://shadcn-svelte.com/registry/styles/rhea/toggle.json), [badge](https://shadcn-svelte.com/registry/styles/rhea/badge.json), [skeleton](https://shadcn-svelte.com/registry/styles/rhea/skeleton.json), [tabs](https://shadcn-svelte.com/registry/styles/rhea/tabs.json), [item](https://shadcn-svelte.com/registry/styles/rhea/item.json), [field](https://shadcn-svelte.com/registry/styles/rhea/field.json), [accordion](https://shadcn-svelte.com/registry/styles/rhea/accordion.json), [alert](https://shadcn-svelte.com/registry/styles/rhea/alert.json), [progress](https://shadcn-svelte.com/registry/styles/rhea/progress.json), [switch](https://shadcn-svelte.com/registry/styles/rhea/switch.json), [dropdown-menu](https://shadcn-svelte.com/registry/styles/rhea/dropdown-menu.json), [context-menu](https://shadcn-svelte.com/registry/styles/rhea/context-menu.json), [menubar](https://shadcn-svelte.com/registry/styles/rhea/menubar.json), [navigation-menu](https://shadcn-svelte.com/registry/styles/rhea/navigation-menu.json), [sidebar](https://shadcn-svelte.com/registry/styles/rhea/sidebar.json), [tooltip](https://shadcn-svelte.com/registry/styles/rhea/tooltip.json), [popover](https://shadcn-svelte.com/registry/styles/rhea/popover.json), [hover-card](https://shadcn-svelte.com/registry/styles/rhea/hover-card.json), [command](https://shadcn-svelte.com/registry/styles/rhea/command.json), [empty](https://shadcn-svelte.com/registry/styles/rhea/empty.json), [card](https://shadcn-svelte.com/registry/styles/rhea/card.json), [dialog](https://shadcn-svelte.com/registry/styles/rhea/dialog.json), [alert-dialog](https://shadcn-svelte.com/registry/styles/rhea/alert-dialog.json), [drawer](https://shadcn-svelte.com/registry/styles/rhea/drawer.json), [checkbox](https://shadcn-svelte.com/registry/styles/rhea/checkbox.json), [kbd](https://shadcn-svelte.com/registry/styles/rhea/kbd.json)

**Read the resolution note below before using any of these.**

| Where | Rhea token | upstream default |
| --- | --- | --- |
| button, input, textarea, select trigger, toggle, badge, skeleton, tabs list and trigger, `item`, field, accordion, alert, progress, switch | `rounded-2xl` | `rounded-md` (`rounded-full` for badge/switch/progress) |
| menu content (dropdown, context, menubar, select, navigation) | `rounded-2xl` | `rounded-md` |
| menu item, select item, sidebar menu button, tooltip | `rounded-xl` | `rounded-sm` / `rounded-md` |
| popover, hover-card, command, empty | `rounded-3xl` | `rounded-md` / `rounded-lg` |
| card, dialog, alert-dialog, drawer | `rounded-[min(var(--radius-4xl),24px)]` | `rounded-xl` / `rounded-lg` |
| checkbox | `rounded-[5px]` | `rounded-[4px]` |
| kbd | `rounded-lg` | `rounded-sm` |

### Borders and surfaces

Source: [input](https://shadcn-svelte.com/registry/styles/rhea/input.json), [textarea](https://shadcn-svelte.com/registry/styles/rhea/textarea.json), [select](https://shadcn-svelte.com/registry/styles/rhea/select.json), [checkbox](https://shadcn-svelte.com/registry/styles/rhea/checkbox.json), [switch](https://shadcn-svelte.com/registry/styles/rhea/switch.json), [button](https://shadcn-svelte.com/registry/styles/rhea/button.json), [button-group](https://shadcn-svelte.com/registry/styles/rhea/button-group.json), [radio-group](https://shadcn-svelte.com/registry/styles/rhea/radio-group.json), [card](https://shadcn-svelte.com/registry/styles/rhea/card.json), [dialog](https://shadcn-svelte.com/registry/styles/rhea/dialog.json), [drawer](https://shadcn-svelte.com/registry/styles/rhea/drawer.json), [sheet](https://shadcn-svelte.com/registry/styles/rhea/sheet.json), [popover](https://shadcn-svelte.com/registry/styles/rhea/popover.json), [dropdown-menu](https://shadcn-svelte.com/registry/styles/rhea/dropdown-menu.json)

| Rule | Rhea | upstream default |
| --- | --- | --- |
| Control border | `border border-transparent` over `bg-input/50` (input, textarea, select) or `bg-input/90` (checkbox) | `border` with `border-input` over `bg-transparent` |
| Control shadow | **none** | `shadow-xs` on input, textarea, select, checkbox, button-group, toggle, radio |
| Raised surface | `ring-1 ring-foreground/5`, `dark:ring-foreground/10`, no `border` | `border` |
| Surface shadow | `shadow-sm` (card), `shadow-lg` (popover, menus), `shadow-xl` (dialog, drawer, sheet) | `shadow-sm` / `shadow-md` / `shadow-lg` |
| Focus ring | `focus-visible:ring-3 focus-visible:ring-ring/30` + `focus-visible:border-ring` | `focus-visible:ring-[3px] focus-visible:ring-ring/50` |
| Invalid ring | `aria-invalid:ring-3 aria-invalid:ring-destructive/20` | `aria-invalid:ring-destructive/20` |
| Switch border | `border-2` | `border` |
| Button press | `active:not-aria-[haspopup]:translate-y-px` | (none) |

**Rhea replaces borders and drop shadows on controls with a tinted fill, and replaces borders on surfaces with a hairline ring.** That points the same way as [#211](https://github.com/saud-alnasser/rentable/issues/211)'s "elegance here means removing decoration".

## Deviations — required, not optional

**Three**, each a place where Rhea's published value cannot be taken as-is here. All three fail *silently*: the code compiles, the component renders, and it is wrong. A fourth item follows them that is deliberately **not** a deviation.

### 1. Every physical direction utility becomes its logical equivalent

Rhea's class strings are written for LTR. Counted by concatenating the `.svelte` file contents of all 56 `registry:ui` items per style and matching **occurrences**, not distinct class names, against two prefix sets — physical `pl-`/`pr-`/`ml-`/`mr-`/`border-l`/`border-r`/`rounded-l-`/`rounded-r-`/`text-left`/`text-right`/`left-N`/`right-N`/`inset-l-`/`inset-r-`, and the `s`/`e` equivalents plus `text-start`/`text-end`:

| | physical (`pl-`, `border-l`, `rounded-l-`, `text-left`) | logical (`ps-`, `border-s`, `rounded-s-`, `text-start`) |
| --- | --- | --- |
| Rhea | **138** | 30 |
| upstream default | 4 | 123 |

31 of 56 families carry at least one. The worst are `dropdown-menu` (16), `context-menu` (14), `menubar` (13), `sidebar` (12).

**Replaces with:** the logical form throughout — `pl-`→`ps-`, `pr-`→`pe-`, `border-l`→`border-s`, `rounded-l-`→`rounded-s-`, `text-left`→`text-start`, `slide-in-from-left-2`→`slide-in-from-start-2`.

**Reason:** Arabic is first-class here (`.claude/contexts/repository.md`, `.claude/rules/frontend.md`), and #211 requires every component the rebuild touches to ship working in both locales. A physical utility renders correctly in English and silently wrong in Arabic — the same failure mode ADR 0007 rejected `init --reinstall` over. Note the direction of the surprise: the **default** style this repository generated from is already logical, so copying Rhea *regresses* RTL support that exists today.

### 2. `data-checked:` / `data-open:` become `data-[state=...]`

Rhea's checkbox and switch select on `data-checked:` and `data-unchecked:`; its dialog, popover and menus select on `data-open:` and `data-closed:`; its menu items use `focus:` where the default uses `data-highlighted:`.

The installed **bits-ui 2.18.1** emits `"data-state"` — verified in `node_modules/bits-ui/dist/bits/checkbox/checkbox.svelte.js` (`"data-state": getCheckboxDataState(...)`) and the switch equivalent (`"data-state": getDataChecked(...)`). A search of the whole of `node_modules/bits-ui/dist` finds **no file emitting a bare `data-checked` attribute at all**. This repository's own checkbox uses `data-[state=checked]` in all four places it needs it.

**Replaces with:** `data-[state=checked]:`, `data-[state=unchecked]:`, `data-[state=open]:`, `data-[state=closed]:`, `data-highlighted:`.

**Reason:** the selectors are inert otherwise. A checked checkbox would render unchecked and nothing would error. Rhea's registry declares `bits-ui@^2.16.3`, which `2.18.1` satisfies — so **the declared range is not the guard**; the attribute contract has to be read off the installed package, as it was here. Note that `node_modules/.pnpm/` still holds a stale `bits-ui@2.18.0` directory alongside the linked `2.18.1`; read the version through `node_modules/bits-ui/package.json`, which is what resolves.

### 3. The radius ladder inverts here — remap or stop overriding `--radius-xl`

`src/app.css:77-80` overrides only four radius tokens, from `--radius: 0.875rem` (14px). The rest fall through to Tailwind's defaults. Resolved:

| token | resolves to | source |
| --- | --- | --- |
| `rounded-sm` | 10px | `app.css` — `calc(var(--radius) - 4px)` |
| `rounded-md` | 12px | `app.css` |
| `rounded-lg` | 14px | `app.css` |
| `rounded-xl` | **18px** | `app.css` — `calc(var(--radius) + 4px)` |
| `rounded-2xl` | **16px** | Tailwind default `--radius-2xl: 1rem` — *not* overridden |
| `rounded-3xl` | 24px | Tailwind default `--radius-3xl: 1.5rem` |
| `rounded-[min(var(--radius-4xl),24px)]` | 24px | Tailwind default `--radius-4xl: 2rem`, clamped |

So **`rounded-xl` (18px) is larger than `rounded-2xl` (16px) in this repository.** Rhea uses `rounded-2xl` for containers and `rounded-xl` for the items inside them, assuming the opposite. Ported verbatim, every menu item would be more rounded than the menu holding it.

**Replaces with:** one of two — extend the `@theme inline` block so `--radius-2xl` and `--radius-3xl` continue the `--radius` progression, or drop the `--radius-xl` override so the whole ladder is Tailwind's. Either restores monotonicity; the second is smaller and loses the `--radius`-derived scale.

**Reason:** Rhea's radius choices are only meaningful as a ladder. This is a repository-local collision, invisible upstream, and it is the one deviation here that is a decision rather than a translation — it belongs to whoever applies the palette.

## Not a deviation: Rhea's table is not a density source

There is nothing to deviate *from* here, which is why this sits outside the three above.

Rhea's `table-head` is `h-10 px-2` and its `table-cell` is `p-2`; the `table.svelte` root is `w-full caption-bottom text-sm`. **Every geometry value is identical to the default style.** The two differ only in the direction utilities of deviation 1 and in two non-geometry classes — the default carries `bg-clip-padding` on head and cell, Rhea carries `text-foreground` on head.

#211's "a row is roughly 40px" checks out against `h-10` = 40px for the header and `p-2` + `text-sm` ≈ 36px for a body row, so the target is reachable — but it is the *default* geometry reaching it, not a Rhea value.

Recorded so the ticket applying the table does not go looking for a Rhea table scale that does not exist.

## Findings

- Rhea's registry index at `https://shadcn-svelte.com/registry/styles/rhea/index.json` holds **258 items: 56 `registry:ui`, 147 `registry:block`, 52 `registry:font`, 2 `registry:lib`, 1 `registry:hook`** — and **zero** `registry:style` or `registry:theme`. There is no CSS-variable payload to adopt.
- Component JSON is served per style at `https://shadcn-svelte.com/registry/styles/rhea/<name>.json`; the default style is at `https://shadcn-svelte.com/registry/<name>.json`. `https://shadcn-svelte.com/registry/styles/rhea/` returns 404 for `init.json`, and `/r/styles/…` (the shadcn/ui React path) 404s.
- All 56 Rhea `registry:ui` items were fetched and compared against their default-style counterparts; every value in **The scale** is read from that JSON, not from the documentation.
- The registry item schema is `https://shadcn-svelte.com/schema/registry-item.json` and **carries no version field**. See Limitations.
- Rhea introduces exactly one new component-local custom property, `--card-spacing`, set inline as `[--card-spacing:--spacing(5)]` with a `data-[size=sm]` override to `--spacing(4)`.
- Rhea adds size steps that do not exist upstream: button `xs` and `icon-xs`, switch `sm`, select trigger `sm`, native-select `sm`.
- `.claude/decisions/0007-rhea-geometry-is-hand-ported.md` claims Rhea "adjusts component geometry and density directly, in the component class strings, rather than by multiplying variables". **Confirmed** — the absence of any theme item is the positive evidence.

## Limitations

- **The registry is unversioned.** Registry items carry a `$schema` and no version, and the style path has no version segment, so these values are "as served on 2026-08-03" and nothing pins them. The `shadcn-svelte` CLI that consumes this registry was at **1.5.0**, published 2026-08-02 — but the CLI version is not the registry's version, and the two can move independently. A re-read on another day can differ with nothing to compare against; the ticket anticipated exactly this.
- **Read, not rendered.** Every number is transcribed from class strings. Nothing here was built, screenshotted, or measured in a browser, so how the scale *feels* — and in particular how a surface separates once the blur is gone — is untested. #211 declares that as an increment on the ticket that applies the palette, which is where it belongs.
- **Deviation 3 is stated as a collision, not resolved.** Which of the two remaps to take is a design decision and is left to the ticket that applies the palette.
- **The `here today` column covers button only.** The current values of every other primitive were not inventoried — that is the applying ticket's work, and doing it here would have gone stale before it was used.
- **Blocks and fonts were not read.** 147 `registry:block` and 52 `registry:font` items were listed but not fetched; the blocks are compositions rather than geometry sources, and no font change is in scope for this effort.
- **Bits UI's attribute contract was checked for checkbox and switch only.** Deviation 2 generalises from those two plus the `data-open`/`data-closed` usage visible in Rhea's dialog, popover and menu strings. Any family whose Rhea string carries a `data-` variant should be re-checked against the installed package when it is ported, rather than trusted from this file.
- No `src/` file was modified, and no shadcn-svelte CLI command was run — the registry was read over HTTP directly, so nothing could touch `src/lib/design/primitive/`.
