---
status: open
---

# feat(design): the settings group and row, and the section switch carries icons

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The design package holds shadcn-svelte's `item` primitive and two blocks built on it, `settings-group.svelte` and `settings-row.svelte`, as the plan's *The settings area* section describes them. The section switch draws an icon before each label, and the settings area's four glyphs live in one window-only module that the switch and the command menu both read. No section uses the blocks yet.

## Acceptance Criteria

Traces requirements 1 and 5, and the section-switch half of criterion 1.

- [ ] `item` is added with `add item --cwd packages/design -y` (never `--overwrite`) and formatted; the design package's node tests (shape, typography, motion, icons) pass.
- [ ] `block/settings-group.svelte` takes `title?`, `footer?`, `rows` and `end?`; `end` is drawn after a separator, so its rows are always last; the group carries `data-settings-group`.
- [ ] `block/settings-row.svelte` takes `icon`, `name`, `value?`, `control?` (given `{ labelId }`) and `tone?: 'neutral' | 'error'`; it carries `data-settings-row` and `data-row-tone`; an error row draws its icon and name in the destructive colour.
- [ ] A component test in `packages/design/src/lib/block/tests/` renders a group with two rows and an `end` row and finds the end row last, the label id handed to the control, and the error tone on it alone.
- [ ] `block/section-switch.svelte` takes `icon?` and draws it before the label, the label in a span; `capitalize.test.ts` and the switch's tests pass, and a new test finds an svg in every link given an icon.
- [ ] `apps/desktop/src/lib/settings/glyph.ts` maps each of the four sections to its glyph (general `sliders-horizontal`, account `circle-user`, organization `users`, workspaces `building`); `settings/surface.ts` and `settings/component/area.svelte` both read it, and the switch in the area shows them.

## Relevant areas

- `packages/design/src/lib/primitive/`, `packages/design/src/lib/block/`
- `packages/design/src/lib/block/section-switch.svelte` and its tests
- `apps/desktop/src/lib/settings/{surface.ts,component/area.svelte}`

## Constraints

- Read [[references/shadcn-svelte]] before running the CLI.
- `settings/section.ts` loads under Node; no lucide import there.
- The record surface also draws the switch; its icon stays optional and unset there.
