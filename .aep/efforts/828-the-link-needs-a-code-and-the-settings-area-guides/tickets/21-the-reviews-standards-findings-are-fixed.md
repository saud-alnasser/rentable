---
status: open
blocked-by: ['22']
---

# chore(organization): the review's standards findings are fixed

## Outcome

The branch passes the formatter, every sentence the review found false in a rule, a plan, a
docstring or an older changeset carries a correction, the connect screen marks a refusal on its
field, the record card's new props are tested in the package, the effort's changeset is a minor
release, and no name or key says "account" for a member or duplicates a term another key holds.

## Acceptance Criteria

Traces requirement 12 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criterion
12. Cut by review round one (its standards findings 1 to 8 and 10 to 12; 9 accepted by the
human).

- [ ] `cargo fmt --check` from `apps/desktop/tauri` prints nothing; the run touches only the
      hunks this branch introduced (every one of the 26 the review counted was the branch's).
- [ ] `.aep/rules/api-layer.md` carries a dated correction restating the count of public
      procedures and naming the three this effort added; 826's spec's requirement 16, criterion
      16 and criterion 9 carry dated corrections; the plan's sentence that the register has one
      caller is corrected; the four Rust docstrings the review named (`command.rs` on the
      legible link and on the join link, `join.rs` on the organization's own link, `mod.rs` on
      the member's own link) say what is true.
- [ ] `connect-screen.svelte` marks a field refusal on the field with `Field.Error` and draws
      no summary callout for it; its test follows.
- [ ] The four unreleased changesets from 826 that describe retired behaviour are corrected in
      place to what the release will ship; `.changeset/a-link-needs-its-code.md` is `minor`.
- [ ] `packages/design/src/lib/block/tests/record-card.svelte.test.ts` covers `disabled` and
      `attributes`.
- [ ] `settings/section.ts`'s record parameter and the two keys name a member, not an account,
      with `i18n-types.ts` regenerated; the two "your password" keys and the second "link" key
      draw the key that already holds the term; the locale tests pass.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass; `node .aep/scripts/index.mjs`
      and `validate.mjs` are clean.

## Relevant areas

`apps/desktop/tauri/src/organization/` (formatting), `.aep/rules/api-layer.md`, 826's spec,
this effort's plan, `apps/desktop/src/lib/organization/component/connect-screen.svelte`,
`.changeset/`, `packages/design/src/lib/block/tests/record-card.svelte.test.ts`,
`apps/desktop/src/lib/settings/section.ts`, `apps/desktop/src/lib/i18n/{en,ar}/index.ts`.

## Constraints

- **Last, so the formatter run lands on the final tree**: blocked by 22.
- **Corrections are dated and additive** ([[policies/authority]]).
- **Finding 9 is accepted by the human**: ticket 07's commit stays on the branch.

## Notes
