---
status: resolved
---

# fix(desktop): the error page, landing and list motion each stay in their own lane

## Outcome

The route error page shows a translated sentence and keeps SvelteKit's own text behind details. A
request to land on a created record is answered once or dropped, never answered later by an
unrelated visit. Two lists changing in the same moment each animate within their own frame without
undoing the other. Found by review round 1 (correctness findings 4, 5 and 6).

## Acceptance Criteria

Traces requirements 4, 16 and 23 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criteria 4(c), 16 and 23.

- [x] `+error.svelte` never draws `page.error.message` as visible text: a `handleError` hook or the
      page maps it to a translated sentence, with the raw text behind the details disclosure. Test
      in Arabic. Verified: `+error.svelte` and `caught-error.svelte` show a translated sentence and keep the thrown message behind `DetailDisclosure`; Arabic tests in `unknown-route.svelte.test.ts` and `caught-error.svelte.test.ts` assert 'Internal Error' is hidden until details open; desktop vitest 381 of 381 on the merged tree.
- [x] The landing request is cleared when its list does not hold the record, or on the next
      navigation; a later visit does not move focus. Test. Verified: each landing request is its own object, answered once by the list holding the record and dropped on navigation; `design/tests/landing.svelte.test.ts` (3 pass) fails with the fix disabled for the filter and navigation cases.
- [x] List motion keeps its marker and clip per instance, or serialises transitions, so a second
      list's transition neither skips nor unclips the first. Test with two lists.
 Verified: `queueListMove` serialises list transitions so a second waits for the first; a two-list test in `list-motion.svelte.test.ts` failed on the old list ('expected [0, 1] to equal [0, 0]') and passes; desktop node 1184 of 1184.
## Relevant areas

- `apps/desktop/src/routes/+error.svelte`, `apps/desktop/src/hooks.client.ts` (if added),
  `design/landing.svelte.ts`, `design/block/list.svelte`, `design/list-motion.ts`
