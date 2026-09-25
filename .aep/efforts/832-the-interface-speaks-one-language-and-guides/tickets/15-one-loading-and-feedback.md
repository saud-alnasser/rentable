---
status: resolved
---

# feat(design): one loading treatment, and feedback through one path

## Outcome

Lists, records, settings and the dashboard load the same way: a skeleton shaped like what it
replaces, shown only after 200 ms and held at least 300 ms. Every toast goes through the shared
handlers. Every notice is a callout in the tone vocabulary.

## Acceptance Criteria

Traces requirements 6 and 12 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criterion 12.

- [x] `packages/design/src/lib/block/loading.svelte` takes a snippet for the shape and replaces the
      spinners in the list, dashboard, record surface and settings. A component test covers the
      delay and the hold. Verified: `packages/design/src/lib/block/loading.svelte` takes a `skeleton` snippet (delay 200, hold 300) and replaces the spinners in the list block, dashboard landing, record surface and settings page; on the effort branch vitest loading + record-surface tests pass 9 of 9.
- [x] The direct `toast` calls in `contract/component/form.svelte:306`,
      `organization/component/made-link.svelte:57`, `routes/settings/+page.svelte:110`,
      `design/block/list.svelte:261` and `settings/update-announcement.ts:89-91` go through the
      shared handlers. A node test fails on a `toast` import outside them. Verified: the five named sites plus ending-soon and transfer go through `error/toast.ts`; `error/tests/toast-reach.test.ts` passes 3 of 3 on the effort branch, and the child showed it fails (fail 2) with a probe file importing `toast`.
- [x] The contract units lock notice is a callout. Verified: `contract/component/units.svelte` renders `<Callout tone="info" data-lock-notice>`; `pnpm check` on the effort branch reports 0 errors, 0 warnings.
- [x] `[[rules/interface]]` gains a *Loading and feedback* section.
 Verified: `.aep/rules/interface.md` gains `## Loading and feedback` (35 lines); validate.mjs reports no failures.
## Relevant areas

- `apps/desktop/src/lib/design/mutation.ts`, `error/toast.ts`, the call sites above,
  `contract/component/units.svelte`, `packages/design/src/lib/primitive/callout/*`

## Constraints

- The startup progress bar stays. It reports stages, not a load.
