---
status: resolved
blocked-by: ['27']
---

# docs(organization): what the last six tickets falsified is corrected

## Outcome

Every sentence tickets 20 to 26 made false in the organization context, in governed source
text, in Rust docstrings, in the changesets and in the plan carries a correction; the one
duplicate-term key the handover reintroduced draws the existing key; the word "account" for
the reader's own section is recorded as the spec's exception on 826's spec and on the locale
guard; and the settings directories' card opening a sheet is recorded on the interface rule as
the accepted deviation.

## Acceptance Criteria

Traces requirements 5, 12, 23 and 24 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criterion 12.
Cut by review round two (its standards findings 1 to 6 and 8; 7 accepted by the human and
recorded here).

- [x] `.aep/contexts/desktop/organization.md` carries dated corrections (2026-09-17) for the
      table count (ten, with `succession`), the owner's key derivation (one derivation, no seal
      read; the round-one paragraph stands and the older sentence is corrected), the link act's
      gate (`inviteMember` or `resetPassword`), and every mention of the sync and you sections
      (organization and account now); 826's spec's requirement 20 correction likewise on the
      gate.
      *Verified 2026-09-20 on the effort branch: the organization context carries dated
      corrections for ten tables with `succession`, one derivation reading no seal, the link
      act on `inviteMember` or `resetPassword`, and the sync and you sections named as
      organization and account; 826's requirement 9 correction carries the two-permission
      gate.*
- [x] Governed source text: the refusal in `session.rs` pointing at the you section says the
      account section; `settings/section.ts`'s docstring says four sections and its note on the
      word "account" says the section is the exception; `command.rs`'s reconnect sentence names
      the organization section; `standing.svelte`'s docstring and the locale comment say the
      word "sync" lives on the control alone. The four stale Rust docstrings (`password.rs` on
      the reset, `invite.rs` on the never-expiring credential and the reset, the two `join.rs`
      fixture comments) say what is true.
      *Verified: `session.rs`'s refusal names the account section; `section.ts` says four
      sections and names `settings.section.account` the one exception; `command.rs` names the
      Turso account block in the organization section; `standing.svelte` and the locale
      comment say the word lives on the control alone; `password.rs`, `invite.rs` and the two
      `join.rs` fixture comments say what is true. At integration seven more present-tense
      comments naming the you section were corrected to the account section.*
- [x] `.changeset/a-link-needs-its-code.md` is read top to bottom against the tree and rewritten
      where false: the last paragraph no longer says the word is nowhere; the paragraphs placing
      things in the you or sync section name the account and organization sections; it reads as
      one account. `accounts-are-made-with-a-username.md`'s sync section, and the three older
      changesets `one-settings-area-replaces-four-pages.md`, `the-workspaces-and-sync-sections.md`
      and `the-members-section-is-one-list.md`, are corrected in place to what ships.
      *Verified: `a-link-needs-its-code.md` rewritten as one account at thirteen paragraphs,
      the last saying the control is named sync; `accounts-are-made-with-a-username.md`,
      `one-settings-area-replaces-four-pages.md`, `the-workspaces-and-sync-sections.md` and
      `the-members-section-is-one-list.md` rewritten in place to what ships. At integration
      `a-member-is-signed-out-of-every-machine.md` was corrected (the account section, the
      card's menu) and `three-pages-for-three-things.md` removed, since it described three
      pages the same release says are gone.*
- [x] `organization.dashboard.acceptOwnershipPassword` is removed and its reader draws
      `organization.setup.passwordLabel`, both locales, types regenerated; the locale tests pass.
      *Verified: `acceptOwnershipPassword` gone from both locales, `accept-ownership.svelte`
      drawing `organization.setup.passwordLabel`, types regenerated with no other drift; the
      locale tests pass (`13 pass`).*
- [x] 826's spec's requirement 18 correction carries a dated note that requirement 24 of this
      effort names the reader's own section "account"; `i18n/tests/organization.test.ts`'s guard
      says in its name or its comment that `settings.section` is the exception.
      *Verified: 826's requirement 18 correction carries the dated note on requirement 24; the
      guard is named `..., settings.section aside` with a comment on the key outside its
      prefixes.*
- [x] `.aep/rules/interface.md`, *Row activation*, carries a dated note: in the settings
      directories a record's page is its sheet, since a member or a workspace has no page of its
      own, and the card opens it; requirement 23 is the precedent and the human accepted it at
      review round two.
      *Verified: `rules/interface.md`, *Row activation*, carries the note dated 2026-09-17
      naming requirement 23 as the precedent and the human's acceptance at review round two.*
- [x] The plan's *The sync block says a fact* says the control is named "sync" and that the
      relative-time formatting was added by ticket 26; `node .aep/scripts/index.mjs` and
      `validate.mjs` are clean; `pnpm lint` and `pnpm test` pass.
      *Verified: the plan's sync section corrected in three places and its handover and
      migration sections on the follow after the pull; `index.mjs` and `validate.mjs` clean
      (`280 artifacts checked, no failures`); in the run's worktree `pnpm check` exit 0
      (desktop `9313 FILES 0 ERRORS 0 WARNINGS`), `pnpm lint` exit 0, `pnpm test` exit 0
      (desktop `241 passed`).*

## Relevant areas

`.aep/contexts/desktop/organization.md`, `.aep/rules/interface.md`, 826's spec, this effort's plan,
`apps/desktop/tauri/src/organization/{session,command,password,invite,join}.rs`,
`apps/desktop/src/lib/settings/section.ts`, `apps/desktop/src/lib/organization/component/{standing,offer-ownership,accept-ownership}.svelte`,
`apps/desktop/src/lib/i18n/{en,ar}/index.ts`, `apps/desktop/src/lib/i18n/tests/organization.test.ts`, `.changeset/`.

## Constraints

- **Corrections are dated and additive** ([[policies/authority]]); `.aep/` prose is exempt from
  the em-dash prohibition, source and changesets are not.
- **After 27**, so the corrections describe the final tree.

## Notes

- *2026-09-20, at integration.* The builder was cut by the weekly rate limit on 2026-09-17 with
  eleven files edited and uncommitted, and resumed on 2026-09-20 from that worktree; its
  corrections carry the date each was written. Two things it raised outside the findings were
  taken here, being this ticket's own subject: seven present-tense comments still placing an
  act in the you section, and two unreleased changesets, one corrected and one removed because
  the release it ships in already says those three pages are gone. The lesser duplicate keys
  (`settings.section.organization`, `settings.section.account`) stay: a section's name is its
  own term.
