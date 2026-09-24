---
status: resolved
---

# fix(desktop): the shell's own words stay behind details

## Outcome

A shell failure nobody can act on (an I/O failure, a corrupt file) shows its translated sentence,
and the shell's own English message is reachable only behind the details disclosure, in a toast
and inline alike. Found by converge round 2, after ticket 35 closed the router's half.

## Acceptance Criteria

Traces requirement 23 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criterion 23.

- [x] `error/toast.ts` `showErrorToast` no longer shows `toErrorMessage`'s `detail` as visible
      text; a toast offers it behind a details affordance or not at all. `toErrorText` no longer
      joins the detail inline. The organization host and startup ports read the translated title
      alone, with the detail behind `error/component/detail-disclosure.svelte` where the surface has
      room. Verified: toasts show the translated title only and send the detail to diagnostics; `toErrorText` returns the title (falling back to the detail only with no locale loaded); the sign-in wall, the standing callout and startup recovery keep the shell's words behind `DetailDisclosure`; organization refusals under a field show the title only; `pnpm check` 0 errors on the merged tree.
- [x] Tests render a non-refusal shell failure in Arabic, through a toast and through
      `toErrorText`, and assert the shell's English message is not visible text. Verified: Arabic tests render a plain and a router-wrapped I/O failure through `showErrorToast`, `toErrorText` and the sign-in wall, and the standing and recovery surfaces, asserting the English is not visible until details open; desktop node 1182 of 1182, vitest 373 of 373.
- [x] `[[rules/interface]]` and `[[rules/api-layer]]` still describe what the code does.
 Verified: `rules/interface.md` *Error* and `rules/api-layer.md` *Errors* describe the new behaviour; root `pnpm check` passes.
## Relevant areas

- `apps/desktop/src/lib/error/message.ts`, `error/toast.ts`, `organization/component/host.svelte`,
  `layout/startup-ports.ts`, `design/block/list.svelte`, the concept hosts' error handling
