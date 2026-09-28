---
status: resolved
blocked-by: [08]
---

# feat(desktop): every record procedure names its flag

## Outcome

Every procedure in the app router names its flag in tRPC `meta` and is gated on it, as [[efforts/838-permissions-are-a-role-and-an-override/plan]],
*Components*, maps the record routers; the dashboard leaves out each figure whose kind the member
cannot view; and a test walks the router and fails on a procedure that names nothing.

## Acceptance Criteria

Traces requirements 1 and 10 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], and criteria 1 and 10.

- [x] `initTRPC` carries a typed `meta`; `procedure.permitted` records its flags there;
      `procedure.member` records that it is a member's own act.
- [x] Every complex, unit, tenant, contract, payment, history, dashboard and workspace procedure is
      gated as the plan maps it; export needs every `view*`, import every `create*`.
- [x] A test walks `appRouter._def.procedures` and fails on a procedure with no flag and no member
      meta (criterion 1).
- [x] For each record flag, a router test calls a procedure it gates with an identity lacking it and
      is refused naming the flag; on a read-only grant every create, edit and delete is refused
      (criterion 10).
- [x] `contract.dashboard` returns no payment figure to an identity lacking `viewPayment`, and no
      contract figure to one lacking `viewContract`.

## Relevant areas

- `src/lib/api/trpc.ts`, `api/router.ts`, `api/app.ts`
- `src/lib/{complex,complex/unit,tenant,contract,payment,history,dashboard,workspace}/router.ts`

## Constraints

- Bulk procedures take the single act's flag; `history.append` takes the flag of the record kind it
  logs.
