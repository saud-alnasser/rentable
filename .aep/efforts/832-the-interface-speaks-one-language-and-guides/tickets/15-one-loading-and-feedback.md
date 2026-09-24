---
status: open
---

# feat(design): one loading treatment, and feedback through one path

## Outcome

Lists, records, settings and the dashboard load the same way: a skeleton shaped like what it
replaces, shown only after 200 ms and held at least 300 ms. Every toast goes through the shared
handlers. Every notice is a callout in the tone vocabulary.

## Acceptance Criteria

Traces requirements 6 and 12 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criterion 12.

- [ ] `packages/design/src/lib/block/loading.svelte` takes a snippet for the shape and replaces the
      spinners in the list, dashboard, record surface and settings. A component test covers the
      delay and the hold.
- [ ] The direct `toast` calls in `contract/component/form.svelte:306`,
      `organization/component/made-link.svelte:57`, `routes/settings/+page.svelte:110`,
      `design/block/list.svelte:261` and `settings/update-announcement.ts:89-91` go through the
      shared handlers. A node test fails on a `toast` import outside them.
- [ ] The contract units lock notice is a callout.
- [ ] `[[rules/interface]]` gains a *Loading and feedback* section.

## Relevant areas

- `apps/desktop/src/lib/design/mutation.ts`, `error/toast.ts`, the call sites above,
  `contract/component/units.svelte`, `packages/design/src/lib/primitive/callout/*`

## Constraints

- The startup progress bar stays. It reports stages, not a load.
