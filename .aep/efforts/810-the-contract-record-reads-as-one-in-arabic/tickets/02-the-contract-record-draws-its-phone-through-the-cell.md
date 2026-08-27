---
status: open
---

# fix(contract): the contract record draws its phone through the cell that states the rule

## Outcome

The contract record renders a phone number through `Cell.Phone`, the way the tenant record
already does, so the country code leads in both locales and there is one spelling of the rule
rather than two.

## Acceptance Criteria

Traces requirement 2 and requirement 3 of the spec, and its criterion 2 and criterion 3.

- [ ] `/contracts/[id]` renders the phone row with the leading `+` at the start of the number
      in Arabic.
- [ ] The row is drawn by `Cell.Phone` rather than by a hand-rolled span.
- [ ] `pnpm check`, `pnpm lint` and `pnpm test` pass.

## Relevant areas

`apps/desktop/src/lib/contract/component/details.svelte:224` is the snippet to replace:

```svelte
{#snippet phone()}
	<span dir={localesMetadata[$locale].direction}>
		{tenantQuery.data?.phone || $LL.common.messages.unknown()}
	</span>
{/snippet}
```

`apps/desktop/src/lib/design/cell/phone.svelte` is the rule it contradicts, stated in the
file's own header.

`apps/desktop/src/lib/tenant/component/details.svelte:91` is the surface that already does it
right: `<Cell.Phone phone={tenant?.phone ?? ''} />`.

## Constraints

- **The fix is not `dir="ltr"` on that span.** The spec's first constraint has the reason.
- **The packaged `Specification` block does not change.** Both surfaces pass the number into it
  as a snippet, so this changes what is passed in and nothing else.
- **The unknown-phone fallback has to survive the substitution.** The hand-rolled span falls
  back to `$LL.common.messages.unknown()`; check what the tenant record does with a missing
  number before assuming the cell handles it.

## Notes

Found by #784's Arabic pass, and raised as #804. Measured on
`/contracts/01a01f2c-32f9-74aa-8038-3a2836a5e758` with the locale set to Arabic: the phone row
reads `966570493924+`, and `/tenants/01a01f2c-3288-703b-bf9e-b35b7eeb25c5` on the same run
reads `+966541389231`.

Not a regression: `git log -L 224,228` returns #399 as the last commit to touch the snippet.
