---
status: open
blocked-by: [03]
---

# feat(desktop): language and appearance are one quiet control on the way in

## Outcome

The foot of the way-in surface carries one text control that names the current language. It opens a
popover with the language choice, the appearance choice and a link to all settings. A change shows
at once, on whatever step the person is on.

## Acceptance Criteria

Traces requirement 7 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
and the half of its criterion 7 about what stays reachable.

- [ ] `lib/design/block/way-in-preferences.svelte` reuses `language-choice.svelte` and the settings
      area's appearance control unchanged.
- [ ] A component test changes the language from the popover and finds the step's title in the other
      language, with `dir` flipped.
- [ ] A component test changes the appearance and finds the `.dark` class toggled.
- [ ] The link to all settings goes to `/settings`, which ticket 03 draws on the way-in frame.
- [ ] Every way-in screen passes this control to the surface's `foot`, and nothing else goes in the
      foot.

## Relevant areas

- `apps/desktop/src/lib/design/block/language-choice.svelte`
- `apps/desktop/src/lib/platform/appearance.ts`, the settings area's appearance control
- `packages/design/src/lib/block/way-in-surface.svelte` (`foot`)

## Constraints

- The settings area itself is not changed (spec, *Out of Scope*).
