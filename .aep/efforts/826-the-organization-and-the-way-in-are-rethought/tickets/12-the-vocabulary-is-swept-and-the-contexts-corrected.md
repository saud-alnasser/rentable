---
status: resolved
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

- [x] `organization/component/join-screen.svelte` and its test are renamed `connect-screen`,
      with `organization/join.ts` renamed `connect.ts` and every import following.
- [x] `i18n/tests/organization.test.ts` asserts, in both locales, that `organization.dashboard.*`'s
      retired keys, `workspace.*`'s stale keys, `account.*`, `layout.changePassword.*` and the
      five control-plane leftovers under `organization` are absent, and that each term of
      requirement 18 has exactly one key; the dead `settings.*` keys the survey named are
      removed too.
- [x] A read of both locales for every string the effort added is recorded in the pull
      request's run log, with anything corrected.
- [x] `[[contexts/desktop/organization]]`'s *Link*, *Chain* and boundary paragraphs,
      `[[contexts/desktop/remote-sync]]`'s *Sign in* and credential boundary, and
      `[[contexts/repository]]`'s first-run paragraph say what this effort made true, each
      correction dated; `node .aep/scripts/validate.mjs` passes.
- [x] Criterion 1: `grep -r consent_begin` over `apps/desktop/src` and `apps/desktop/tauri/src`
      finds the walk, the reconnect control and their commands only. Criterion 2: 819's live
      read-only test compiles and the switcher's rows test passes. Criterion 3: `connect.rs`'s
      tests pass unchanged.
- [x] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass.

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

Built here as a wave of one and landed on 2026-09-14. The rename is the four files and their
imports; the route `/organization/join` and the `rentable://join/` scheme keep their names,
since a URL is not vocabulary. The sweep: `account.*` moved to `settings.you.*` (`groupIdentity`
became `signedInAs`, `title` went); the five `organization.*` leaves became
`organization.dashboard.{forgetAccountDescription, forgetAccountRevokes, forgetAccountRevokesAt,
accountForgotten}` with the walk's abandon control reading `forgetAccount`; `sign in` became one
key, `common.actions.signIn`, read by the wall's button and the account menu, the wall's title
now `welcome back`; `members` and `workspaces` are `settings.section.*` alone; the dead keys
under `organization.setup`, `workspace`, `layout`, `settings`, `settingsHooks`, `common.nav`
and three sync-era `common.actions` went; and eleven sentences were reworded off `unlock your
place`, `Login`, `their account`, `their place` and a hyphenated `read only`. The i18n test
pins the retired keys by name, each requirement-18 term as one english key with arabic
written, the retired words absent, and `account` meaning the turso account wherever an
organization string says it. The contexts carry dated paragraphs rather than rewrites.

Raised, not taken: 86 leaves still have no static reader across the whole application, most
of them the domain's status and label tables read by index (`common.status[...]`,
`common.errors[code]`) and a dozen genuinely dead ones outside this effort's groups
(`common.labels.*`, `contracts.payments.*`, `dashboard.title`), which are a sweep of their own;
`LinkFacts.invitation` and `InvitedFacts` are vestigial since ticket 15 and stay, since the
plan's interface table names them; `organization.dashboard.disconnect` and
`layout.signIn.disconnect` are two labels for one act on two surfaces; the `dashboard` group
name under `organization` is itself a retired word, kept because renaming a group moves every
reader for no reader's benefit.
