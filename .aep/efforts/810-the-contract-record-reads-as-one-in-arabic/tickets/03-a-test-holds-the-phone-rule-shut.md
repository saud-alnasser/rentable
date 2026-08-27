---
status: open
---

# test(contract): a test holds the phone rule shut

## Outcome

A phone number rendered under `dir="rtl"` is covered by a component test, so the next surface
that hand-rolls one fails a gate rather than a locale.

## Acceptance Criteria

Traces requirement 4 of the spec, and its criterion 4.

- [ ] A component test renders `Cell.Phone` under `dir="rtl"` and asserts that the country code
      leads.
- [ ] `pnpm check`, `pnpm lint` and `pnpm test` pass.

## Relevant areas

`apps/desktop/src/lib/design/cell/phone.svelte` is the subject.

`packages/design/src/lib/block/tests/` is the convention to copy once the desktop can render a
component in a test.

## Constraints

- **This ticket does not build the test harness.** Adding a second component runner beside the
  one that effort is building is how a repository ends up with two.

## Notes

**Gated outside this effort.** `apps/desktop`'s `test` script is `node --import tsx --test`
alone: `vitest`, `jsdom` and `@testing-library/svelte` are configured in `packages/design`
only, so there is nothing here that can render a component. The harness is a requirement of
`[[efforts/811-the-gates-and-the-contract-follow-the-code-into-the-package/spec]]`. This is not a
`blocked-by` edge because that field names tickets inside one effort and `frontier.mjs` throws
on an id it cannot find.

The other two tickets are not gated on it and can land first.
