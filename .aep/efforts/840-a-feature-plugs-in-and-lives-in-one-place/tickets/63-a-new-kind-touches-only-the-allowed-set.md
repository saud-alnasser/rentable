---
status: open
blocked-by: [58]
---
# refactor(desktop): adding a record kind touches only what the spec allows

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Ticket 58 added a throwaway record kind and found it hand-edits files beyond criterion 2's set: `organization/glyph.ts` (`KIND_GLYPH` is a `Record<RecordKind>`), the per-kind "needs viewing" refusal in `tauri/src/error.rs` and `src/lib/error/tauri.ts`, the layer map in `src/lib/tests/layers.test.ts`, and tests that pin today's five kinds (`app/tests/router.test.ts`). Each is derived instead from what the kind already declares: its glyph from its surface, its refusal from the one list of kinds on each side, its layer from its place in the composition root's list, and the tests from that list. The signed Rust fixtures that encode the permission mask change with the permission package and its Rust mirror, which the allowed set already holds. `rules/module-layout`'s "What adding a feature touches" is updated to match.

## Acceptance Criteria

Traces requirement 1 and 2 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 1 and 2.

- [ ] Adding a throwaway kind hand-edits, outside its own directory, only the composition root's list, the permission package and its Rust mirror (with the fixtures that sign its mask), the schema, its routes and its locale entries; the commit body lists the files it took (criterion 2).
- [ ] Every refusal code, glyph and message is unchanged for today's five kinds (criterion 19).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path or reads the list instead of spelling it (criterion 19).

## Relevant areas

- `organization/glyph.ts`, `tauri/src/error.rs`, `src/lib/error/tauri.ts`, `src/lib/tests/layers.test.ts`, `app/tests/router.test.ts`

## Constraints

- Behaviour does not change (requirement 19).
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
