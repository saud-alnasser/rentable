---
status: resolved
blocked-by: ['05']
---

# test(contract): a test holds the phone rule shut

## Outcome

A phone number rendered under `dir="rtl"` is covered by a component test, so the next surface
that hand-rolls one fails a gate rather than a locale.

## Acceptance Criteria

Traces requirement 9 of the spec, and its criterion 9.

- [x] A component test renders `Cell.Phone` under `dir="rtl"` and asserts that the country code
      leads. `apps/desktop/src/lib/design/cell/tests/phone.svelte.test.ts` renders it under a body
      that is `rtl` and asserts the span states `dir="ltr"` of its own. **jsdom lays nothing out,
      so glyph order is not observable**; what is asserted is the mechanism that produces it, and
      the file says so where a reader would otherwise expect an assertion about order. **Measured
      to be load-bearing**: with `dir="ltr"` deleted from `phone.svelte` the file reports
      `1 failed | 1 passed` and `expected '' to be 'ltr'`.
- [x] The test runs on the harness ticket 05 builds, under `apps/desktop`, rather than on a
      second runner or from `packages/design`. It is collected by
      `apps/desktop/vitest.config.js` and the subject stayed where #807 left it.
- [x] `pnpm check`, `pnpm lint`, `pnpm test` and `pnpm build:web` pass. `check` reported
      `0 ERRORS 0 WARNINGS` on 2803 and 9209 files; `lint` printed the prettier line and nothing
      else; `test` reported `Tasks: 4 successful, 4 total` with the desktop's vitest half at
      `Tests 5 passed`; `build:web` reported `Tasks: 1 successful, 1 total`.

## Relevant areas

`apps/desktop/src/lib/design/cell/phone.svelte` is the subject. It states the rule in its own
header: a number carrying a leading `+` is read left to right in both locales, and letting it
inherit `rtl` moves the country code to the wrong end.

`packages/design/src/lib/block/tests/` is the convention to copy, by way of whatever ticket 05
lands for the desktop.

## Constraints

- **This ticket does not build the test harness.** Ticket 05 does. Adding a second component
  runner beside the one that ticket is building is how a repository ends up with two.
- **The subject stays in `apps/desktop`.** `Cell.Phone` is a cell, it knows about this
  application's concepts, and #807 left it in the desktop deliberately. The test follows it
  rather than moving it.

## Notes

**Moved here from `[[efforts/810-the-contract-record-reads-as-one-in-arabic/spec]]` on
2026-08-27, by the human's decision.** It was that effort's fourth criterion and its third
ticket. Two of that effort's surfaces were fixed and a third defect found and fixed alongside
them, all gated green, while this one could not be built at all: `apps/desktop`'s `test` script
is `node --import tsx --test` alone, and `vitest`, `jsdom` and `@testing-library/svelte` are
configured in `packages/design` only. Holding three shipped fixes behind an effort that had not
started was the alternative, and the sign-in fix among them is what makes the application
usable.

The defect it guards against is on the record at #810: `/contracts/[id]` rendered
`966570493924+` in Arabic where the tenant record, the tenant directory and the dashboard all
rendered `+966570493924`, because the contract record drew the number through a hand-rolled span
that inherited `rtl`.
