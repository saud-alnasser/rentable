---
status: resolved
---

# feat(design): the settings group and row, and the section switch carries icons

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The design package holds shadcn-svelte's `item` primitive and two blocks built on it, `settings-group.svelte` and `settings-row.svelte`, as the plan's *The settings area* section describes them. The section switch draws an icon before each label, and the settings area's four glyphs live in one window-only module that the switch and the command menu both read. No section uses the blocks yet.

## Acceptance Criteria

Traces requirements 1 and 5, and the section-switch half of criterion 1.

- [x] `item` is added with `add item --cwd packages/design -y` (never `--overwrite`) and formatted; the design package's node tests (shape, typography, motion, icons) pass. *Verified: the commit adds `primitive/item/` only (the separator primitive the CLI prompted over was restored, not in the diff); design `node --test` printed pass 165, fail 0.*
- [x] `block/settings-group.svelte` takes `title?`, `footer?`, `rows` and `end?`; `end` is drawn after a separator, so its rows are always last; the group carries `data-settings-group`. *Verified: read `settings-group.svelte`: `title?`, `footer?`, `rows`, `end?` after a decorative `Item.Separator`, `data-settings-group`; `settings-group.svelte.test.ts` passes.*
- [x] `block/settings-row.svelte` takes `icon`, `name`, `value?`, `control?` (given `{ labelId }`) and `tone?: 'neutral' | 'error'`; it carries `data-settings-row` and `data-row-tone`; an error row draws its icon and name in the destructive colour. *Verified: read `settings-row.svelte`: `icon`, `name`, `value?`, `control?({labelId})`, `tone?`, `data-settings-row`, `data-row-tone`, error tone gives `text-destructive` to icon and name; covered by the group test.*
- [x] A component test in `packages/design/src/lib/block/tests/` renders a group with two rows and an `end` row and finds the end row last, the label id handed to the control, and the error tone on it alone. *Verified: `vitest run settings-group.svelte.test.ts section-switch.svelte.test.ts` printed 2 files, 11 tests passed (end row last, label id on the control, error tone on that row alone).*
- [x] `block/section-switch.svelte` takes `icon?` and draws it before the label, the label in a span; `capitalize.test.ts` and the switch's tests pass, and a new test finds an svg in every link given an icon. *Verified: the same run covers the switch: an svg first in every link given an icon, none without; capitalize.test is in the design node run (pass 165).*
- [x] `apps/desktop/src/lib/settings/glyph.ts` maps each of the four sections to its glyph (general `sliders-horizontal`, account `circle-user`, organization `users`, workspaces `building`); `settings/surface.ts` and `settings/component/area.svelte` both read it, and the switch in the area shows them. *Verified: `glyph.ts` maps the four sections; `surface.ts` and `area.svelte` import it; `vitest run app/tests/settings-area.svelte.test.ts` printed 30 passed, including the lucide-class check on the tabs.*

## Relevant areas

- `packages/design/src/lib/primitive/`, `packages/design/src/lib/block/`
- `packages/design/src/lib/block/section-switch.svelte` and its tests
- `apps/desktop/src/lib/settings/{surface.ts,component/area.svelte}`

## Constraints

- Read [[references/shadcn-svelte]] before running the CLI.
- `settings/section.ts` loads under Node; no lucide import there.
- The record surface also draws the switch; its icon stays optional and unset there.
