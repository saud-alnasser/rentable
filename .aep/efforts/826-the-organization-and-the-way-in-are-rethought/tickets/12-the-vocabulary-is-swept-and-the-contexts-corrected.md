---
status: open
blocked-by: ['06', '07', '10', '11', '13', '14', '15']
---

# refactor(organization): the vocabulary is swept and the contexts corrected

## Outcome

Every concept has one name in both locales and every retired string is gone; the connect
screen is named for what it does; the three contexts this effort falsified say what is true
now; and the three criteria held by code this effort did not touch are verified on the whole
branch.

## Acceptance Criteria

Traces requirement 18 and requirement 20 of
[[efforts/826-the-organization-and-the-way-in-are-rethought/spec]], and its criterion 18,
criterion 20, criterion 1, criterion 2 and criterion 3.

- [ ] `organization/component/join-screen.svelte` and its test are renamed `connect-screen`,
      with `organization/join.ts` renamed `connect.ts` and every import following.
- [ ] `i18n/tests/organization.test.ts` asserts, in both locales, that `organization.dashboard.*`'s
      retired keys, `workspace.*`'s stale keys, `account.*`, `layout.changePassword.*` and the
      five control-plane leftovers under `organization` are absent, and that each term of
      requirement 18 has exactly one key; the dead `settings.*` keys the survey named are
      removed too.
- [ ] A read of both locales for every string the effort added is recorded in the pull
      request's run log, with anything corrected.
- [ ] `[[contexts/desktop/organization]]`'s *Link*, *Chain* and boundary paragraphs,
      `[[contexts/desktop/remote-sync]]`'s *Sign in* and credential boundary, and
      `[[contexts/repository]]`'s first-run paragraph say what this effort made true, each
      correction dated; `node .aep/scripts/validate.mjs` passes.
- [ ] Criterion 1: `grep -r consent_begin` over `apps/desktop/src` and `apps/desktop/tauri/src`
      finds the walk, the reconnect control and their commands only. Criterion 2: 819's live
      read-only test compiles and the switcher's rows test passes. Criterion 3: `connect.rs`'s
      tests pass unchanged.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass.

## Relevant areas

`apps/desktop/src/lib/organization/{join.ts,component/join-screen.svelte}`,
`i18n/{en,ar}/index.ts`, `i18n/tests/organization.test.ts`,
`.aep/contexts/desktop/{organization,remote-sync}.md`, `.aep/contexts/repository.md`.

## Constraints

- **[[policies/artifacts]]**: a context is corrected in place with the date; nothing under
  `.aep/` is cited from source.
- **[[rules/module-layout]]**: a rename the change is not about waits for its own ticket, and
  this is that ticket.
- **[[policies/reporting]]** governs every string a person reads.

## Notes

Last on purpose: it reads the whole branch.
