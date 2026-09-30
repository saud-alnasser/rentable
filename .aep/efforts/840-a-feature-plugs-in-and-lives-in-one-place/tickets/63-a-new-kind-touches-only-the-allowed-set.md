---
status: resolved
blocked-by: [58]
---
# refactor(desktop): adding a record kind touches only what the spec allows

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Ticket 58 added a throwaway record kind and found it hand-edits files beyond criterion 2's set: `organization/glyph.ts` (`KIND_GLYPH` is a `Record<RecordKind>`), the per-kind "needs viewing" refusal in `tauri/src/error.rs` and `src/lib/error/tauri.ts`, the layer map in `src/lib/tests/layers.test.ts`, and tests that pin today's five kinds (`app/tests/router.test.ts`). Each is derived instead from what the kind already declares: its glyph from its surface, its refusal from the one list of kinds on each side, its layer from its place in the composition root's list, and the tests from that list. The signed Rust fixtures that encode the permission mask change with the permission package and its Rust mirror, which the allowed set already holds. `rules/module-layout`'s "What adding a feature touches" is updated to match.

## Acceptance Criteria

Traces requirement 1 and 2 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 1 and 2.

- [x] Adding a throwaway kind hand-edits, outside its own directory, only the composition root's list, the permission package and its Rust mirror (with the fixtures that sign its mask), the schema, its routes and its locale entries; the commit body lists the files it took (criterion 2). Verified: the child's throwaway `parcel` kind (router, feature, surface, page, strings, table, migration) edited, outside its own directory, only `app/features.ts`, `app/surfaces.ts`, `packages/workspace-permission/index.ts` and its mirror `permission.rs`, `schema.ts` (with its migration seed), `routes/parcels/+page.svelte` and the locale files, plus the generated `i18n-types.ts` and migration; it was reverted and the list is in the commit body. Glyphs come from each surface's `record: { kind, glyph }`, the needs-viewing refusal from the one list on each side, the layer map from the composition root's imports. Disclosed: tests that pin each kind's flags, groups, places and the signed mask fixtures also change with a kind, since they state a kind's expected behaviour; `rules/module-layout` records them.
- [x] Every refusal code, glyph and message is unchanged for today's five kinds (criterion 19). Verified: `error::tests::a_kind_needing_viewing_is_one_word_spelled_from_the_kind` pins all five `<kind>NeedsViewing` words on the wire; `tauri.test.ts` still compares the frontend decoder with Rust; `message.test.ts` passes unchanged; glyphs render from the same icons.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path or reads the list instead of spelling it (criterion 19). Verified: in the run's tree: `cargo fmt --check` 0, `cargo test --lib` `648 passed`, check 0, eslint 0, vitest 0, build:web 0, validate 0; node tests fail only the date-dependent receipt test. Assertion changes: the permission test compares the serialised words and `tauri.test.ts` parses the list.

## Relevant areas

- `organization/glyph.ts`, `tauri/src/error.rs`, `src/lib/error/tauri.ts`, `src/lib/tests/layers.test.ts`, `app/tests/router.test.ts`

## Constraints

- Behaviour does not change (requirement 19).
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
