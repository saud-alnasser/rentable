---
status: resolved
---

# feat(desktop): a record kind the member cannot view is absent from every other kind's results

## Outcome

Converge, round 1. Requirement 10 says a member without a kind's view flag does not see records of
that kind anywhere in the application; tickets 09 and 10 left the kind's own procedures, lists,
panes and palette out, but other kinds' results still carry its fields. A contract's rows, queue
and ranks carry the tenant's name and phone, a payment carries its contract's reference, a tenant's
directory row carries a count of their contracts, and the export control is offered without the
view flags `workspace.get` requires. After this, every field of a kind the member cannot view is
left out of every other kind's results and printouts, and the export is offered only with every
view flag.

## Acceptance Criteria

Traces requirement 10 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], and criterion 10.

- [x] A router test per record router shows every field of another kind left out of its results
      for an identity lacking that kind's view flag: the contract's rows, queue, ranks and reminder
      without `viewTenant` carry no tenant name or phone, a payment without `viewContract` carries
      no contract reference, a tenant's row without `viewContract` carries no contract count, and
      any unit or complex field without its view flag likewise.
- [x] The contract's printed page and the receipt and schedule leave out the fields of a kind the
      member cannot view, with a test for each printout.
- [x] The export control is unavailable, with the reason naming the missing view flag, unless every
      `view*` flag is held, with a component test.
- [x] The interface draws a row whose other-kind field is left out without a broken cell: a test per
      directory shows the column absent or the cell empty with nothing named.

## Relevant areas

- `src/lib/{complex,complex/unit,tenant,contract,payment}/router.ts` and their `rank`, `reminder`,
  `serialize` and print modules
- the directory, ledger and print components under each concept's `component/`
- the workspace export control

## Constraints

- The router leaves the field out, as `contract.dashboard` does since ticket 09; the interface does
  not fetch a field and hide it.
