---
status: resolved
---

# fix(api): every failure reads in the reader's language

## Outcome

No English text from a router reaches a reader. A refusal already reads through its code (ticket
19) and a shell refusal through its reason (ticket 20); what remains, a permission failure, an
unexpected failure and an input the schema rejected, shows a translated sentence, with the
developer's message kept for diagnostics or behind the details disclosure. Found by converge
round 1.

## Acceptance Criteria

Traces requirement 23 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criterion 23.

- [x] `design/mutation.ts`, `error/message.ts` and `error/refusal.ts` never place a router's
      message in visible text: `FORBIDDEN` and `UNAUTHORIZED` read as a translated sentence of their
      own, any other unexpected failure as the generic one, and a `BAD_REQUEST` without a refusal
      (a zod input error) as a translated invalid-input sentence mapped to its field where the path
      names one. Verified: `toRouterFailureText` gives FORBIDDEN, UNAUTHORIZED and a refusal-less BAD_REQUEST a translated sentence, other failures the generic one; `message.ts` titles a TRPCError in translation; `mutation.ts` sends the message to diagnostics only; zod paths map to fields through `fieldOfFailure`; desktop node 1180 of 1180 on the merged tree.
- [x] Tests render each of those in Arabic and assert no English from the error's message is
      visible. Verified: `refusal.test.ts`, `message.test.ts` and `mutation.test.ts` render FORBIDDEN, UNAUTHORIZED, INTERNAL_SERVER_ERROR, a zod rejection and a bare BAD_REQUEST in ar, asserting the exact sentence, no Latin letters and no message; desktop vitest 364 of 364.
- [x] `[[rules/api-layer]]` *Errors* says what a failure that is not a refusal shows.
 Verified: `rules/api-layer.md` *Errors* says what a failure that is not a refusal shows; root `pnpm check` (prettier) passes.
## Relevant areas

- `apps/desktop/src/lib/design/mutation.ts`, `error/message.ts`, `error/refusal.ts`,
  `error/toast.ts`, `api/trpc.ts`, `i18n/en/index.ts`, `i18n/ar/index.ts`
