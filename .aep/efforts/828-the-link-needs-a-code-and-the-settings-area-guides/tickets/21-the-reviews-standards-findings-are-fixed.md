---
status: resolved
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

- [x] `cargo fmt --check` from `apps/desktop/tauri` prints nothing; the run touches only the
      hunks this branch introduced (every one of the 26 the review counted was the branch's).
      *Verified 2026-09-16 on the effort branch: `cargo fmt --check` from `apps/desktop/tauri`
      prints nothing; the child checked each of the six files byte-identical to `HEAD` once
      whitespace and commas are stripped, so the run is formatting alone (the two `link.rs`
      hunks had already gone with an earlier ticket, so 24 rather than 26).*
- [x] `.aep/rules/api-layer.md` carries a dated correction restating the count of public
      procedures and naming the three this effort added; 826's spec's requirement 16, criterion
      16 and criterion 9 carry dated corrections; the plan's sentence that the register has one
      caller is corrected; the four Rust docstrings the review named (`command.rs` on the
      legible link and on the join link, `join.rs` on the organization's own link, `mod.rs` on
      the member's own link) say what is true.
      *Verified by reading: `rules/api-layer.md` corrected to fourteen with the three named
      and dated 2026-09-16; 826's spec carries twenty dated lines including requirement 16,
      criterion 16 and criterion 9; the plan's caller sentence now says one of three callers
      (`make_link`, `standings`, the gate; the review's five counted test sites); the four
      docstrings in `command.rs`, `join.rs` and `mod.rs` and `delete_open_machine_links_of`'s
      say what is true. At integration four more the child noticed were corrected: `store.rs`
      (two), a `join.rs` test comment, and the first screen's two comments naming a reset
      link.*
- [x] `connect-screen.svelte` marks a field refusal on the field with `Field.Error` and draws
      no summary callout for it; its test follows.
      *Verified: `connect-screen.svelte` draws `Field.Error` on the link and code fields and
      no callout for a field refusal (its callouts are the shell's alone);
      `connect-screen.svelte.test.ts`: 28 passed with the three refusal tests reading the
      field.*
- [x] The four unreleased changesets from 826 that describe retired behaviour are corrected in
      place to what the release will ship; `.changeset/a-link-needs-its-code.md` is `minor`.
      *Verified: the four 826 changesets rewritten in place to what ships;
      `a-link-needs-its-code.md` is `minor`; no em dash or curly quote in any added line
      outside `.aep/`.*
- [x] `packages/design/src/lib/block/tests/record-card.svelte.test.ts` covers `disabled` and
      `attributes`.
      *Verified: `record-card.svelte.test.ts` covers `disabled` (drawn, `aria-disabled`, not
      firing, on both routes) and `attributes` (reaching the entry verbatim): 6 passed, design
      `61 passed` in the run.*
- [x] `settings/section.ts`'s record parameter and the two keys name a member, not an account,
      with `i18n-types.ts` regenerated; the two "your password" keys and the second "link" key
      draw the key that already holds the term; the locale tests pass.
      *Verified: `RECORD_PARAM = 'member'` and the card's address
      `?section=members&member=<id>`; `memberTitle` and `addMember` in both locales; the two
      password keys and the dashboard's link key removed, their readers drawing
      `organization.setup.passwordLabel` and `organization.join.linkLabel`; types regenerated
      with no drift; the locale tests pass.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass; `node .aep/scripts/index.mjs`
      and `validate.mjs` are clean.
      *Verified in the run's worktree: `pnpm check` exit 0 (desktop `9309 FILES 0 ERRORS 0
      WARNINGS`, design `2807`), `pnpm lint` exit 0, `pnpm test` exit 0 (desktop `210
      passed`); `cargo test -- --test-threads=1`: `400 passed; 0 failed; 10 ignored`;
      `validate.mjs`: `275 artifacts checked, no failures`.*

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

- *2026-09-16, at integration.* Four more stale sentences the child noticed were corrected in
  this commit: two `store.rs` docstrings and a `join.rs` test comment saying a member makes a
  link for their own next machine, and the first screen's two comments naming a reset link. Two
  keys still naming a member as an account (`accountDescription`, `transferOwnershipAccount`)
  and the members section's prose calling a member an account go to ticket 23, which reshapes
  that section. The join namespace keeps the word "link", since it is the namespace about links.
