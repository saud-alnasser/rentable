---
status: open
blocked-by: ['02', '03', '04', '05', '06']
---

# refactor(organization): the vocabulary is swept

## Outcome

Every screen and dialog in the effort's scope carries the same vocabulary: primary buttons with
their verb, fields with their subject, muted. The change-password form, and any button or field the
earlier tickets left bare, are brought to it, and the tests hold every screen to it.

## Acceptance Criteria

Traces requirement 14, requirement 15 and requirement 16 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 14,
criterion 15 and criterion 16.

- [ ] `change-password-form.svelte` renders muted leading glyphs on its three password fields and
      a verb glyph on its change button; `change-password.svelte.test.ts` asserts them.
- [ ] Every screen in scope has a component test asserting `svg` before the named primary button's
      label and `[data-slot=input-group-addon] svg` before each named input with
      `text-muted-foreground` on the addon; the continue arrow's class contains `rtl:rotate-180`.
- [ ] A read of both locales for every string the effort added, recorded under Notes with anything
      corrected.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass.

## Relevant areas

`apps/desktop/src/lib/organization/component/change-password-form.svelte` and its test; every
component the earlier tickets touched, read for what they left bare.

## Constraints

- **Cite *Balance weight and contrast* (p.56)** on any glyph whose colour is chosen here.
- **Every glyph is Lucide or Tabler where each is already used**; no third set.
- **A changeset rides with the change** only where a screen changes visibly; a test-only sweep
  needs none.

## Notes

Last, so it sweeps finished screens rather than being redone as each moves.
