---
status: open
blocked-by: [18]
---

# feat(api): router refusals travel as codes

## Outcome

Every refusal a router or domain module raises carries a stable code and its parameters. The client
turns the code into a sentence in the reader's language, and each form maps a code to its field
instead of matching English substrings. The API layer's errors rule says so.

## Acceptance Criteria

Traces requirement 23 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criterion 23.

- [ ] **The first commit checks the premise.** A test calls a procedure whose `ctx.host` call
      throws a Tauri-shaped `{ code, message }` and asserts what reaches the client. If tRPC wraps it
      and keeps `code` only on `cause`, `toTauriErrorCode` reads `cause` and the test pins it.
      This fixes the onboarding refusal matching if it is broken today.
- [ ] `refuse(code, params?)` builds the `BAD_REQUEST` with `cause.refusal`, and `errorFormatter`
      copies `refusal` into `shape.data`. The 31 `new TRPCError` sites and the 24 `badRequest` calls
      use it with codes from per-concept `RefusalCode` unions.
- [ ] `common.refusals` holds a sentence per code in `en` and `ar`. `error/refusal.ts`
      `toRefusalText` and `fieldOfRefusal` replace the forms' substring matching (contract 7,
      complex 2, unit 2, tenant 2, payment 1).
- [ ] Router tests assert the payment and contract refusals render in Arabic through
      `toRefusalText`.
- [ ] `[[rules/api-layer]]` *Errors* is revised: a refusal is a code, and its message is a
      developer's description.

## Relevant areas

- `apps/desktop/src/lib/api/trpc.ts:23,92,133,158`, `api/caller.ts`,
  `apps/desktop/src/lib/*/router.ts`, `contract/contract.ts:475`, `complex/complex.ts:126`,
  `tenant/tenant.ts:39`, `payment/payment.ts:111`
- `apps/desktop/src/lib/design/mutation.ts:335` (`onMutationError`), `error/message.ts`,
  `error/tauri.ts`
- the forms' `onUpdate` catch blocks (contract `form.svelte:287-307`)

## Constraints

- The plan's *Architecture 3*.
- The contract form's catch is replaced here, not in ticket 24. That ticket writes its new unit
  refusals as codes from the start.
