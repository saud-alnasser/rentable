---
status: resolved
---

# fix(contract): the unit pane counts in the reader's digits

## Outcome

Both unit pane headings report their count in the digits the reader's locale uses, through the
same formatter every other count in this application goes through, so the heading agrees with
the list beside it.

## Acceptance Criteria

Traces requirement 1 and requirement 3 of the spec, and its criterion 1 and criterion 3.

- [x] `/contracts/[id]?section=units` renders both pane headings with locale digits in Arabic.
      Verified in the running application on an unlocked contract, which draws both panes:
      `المسندة (٢)` and `المتاحة (٠)`. The locked contract from the original measurement draws
      one pane and reads `المسندة (١)`, against `المسندة (1)` before the change.
- [x] The number goes through `formatLocaleNumber` rather than through string interpolation.
      `unit-pane.svelte` derives `count` from it and the heading interpolates that.
- [x] Whether the parentheses want localising is answered and the answer is recorded here,
      either as a change or as a line saying why they stay. **They stay**, and the comment above
      `count` says why: they are neutral characters, the bidi algorithm resolves a matched pair
      between two Arabic-Indic digits to the paragraph direction and mirrors both, so `(٢)` comes
      out the right way round without anything being localised. Confirmed on screen rather than
      only reasoned: both headings render their parentheses correctly in Arabic.
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass. `check` reported
      `9137 FILES 0 ERRORS 0 WARNINGS`, `lint` exited 0, `test` reported `4 successful, 4 total`.

## Relevant areas

`apps/desktop/src/lib/contract/component/unit-pane.svelte:104` is the interpolation:

```svelte
<span class="ms-1 tracking-normal">({units.length})</span>
```

`apps/desktop/src/lib/platform/locale.ts` holds `formatLocaleNumber`, which is what the rest of
the application counts with.

The list beside it and the complex above it are the two surfaces that already read correctly.
Whatever they do is the answer.

## Constraints

- **Both panes, not the one that is visible.** The available pane is invisible in the
  measurement only because the contract that was open is locked, which draws one pane rather
  than two.

## Notes

Found by #784's Arabic pass over the thirteen routes, and raised as #805 before efforts carried
their tasks as files. Not a regression: `git log -L 100,106` returns #457 as the last commit to
touch the line, well before the design package effort started.
