---
status: open
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

- [ ] `+error.svelte` never draws `page.error.message` as visible text: a `handleError` hook or the
      page maps it to a translated sentence, with the raw text behind the details disclosure. Test
      in Arabic.
- [ ] The landing request is cleared when its list does not hold the record, or on the next
      navigation; a later visit does not move focus. Test.
- [ ] List motion keeps its marker and clip per instance, or serialises transitions, so a second
      list's transition neither skips nor unclips the first. Test with two lists.

## Relevant areas

- `apps/desktop/src/routes/+error.svelte`, `apps/desktop/src/hooks.client.ts` (if added),
  `design/landing.svelte.ts`, `design/block/list.svelte`, `design/list-motion.ts`
