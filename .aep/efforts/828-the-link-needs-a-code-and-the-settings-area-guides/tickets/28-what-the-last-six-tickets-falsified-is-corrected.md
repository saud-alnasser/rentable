---
status: open
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

- [ ] `.aep/contexts/desktop/organization.md` carries dated corrections (2026-09-17) for the
      table count (ten, with `succession`), the owner's key derivation (one derivation, no seal
      read; the round-one paragraph stands and the older sentence is corrected), the link act's
      gate (`inviteMember` or `resetPassword`), and every mention of the sync and you sections
      (organization and account now); 826's spec's requirement 20 correction likewise on the
      gate.
- [ ] Governed source text: the refusal in `session.rs` pointing at the you section says the
      account section; `settings/section.ts`'s docstring says four sections and its note on the
      word "account" says the section is the exception; `command.rs`'s reconnect sentence names
      the organization section; `standing.svelte`'s docstring and the locale comment say the
      word "sync" lives on the control alone. The four stale Rust docstrings (`password.rs` on
      the reset, `invite.rs` on the never-expiring credential and the reset, the two `join.rs`
      fixture comments) say what is true.
- [ ] `.changeset/a-link-needs-its-code.md` is read top to bottom against the tree and rewritten
      where false: the last paragraph no longer says the word is nowhere; the paragraphs placing
      things in the you or sync section name the account and organization sections; it reads as
      one account. `accounts-are-made-with-a-username.md`'s sync section, and the three older
      changesets `one-settings-area-replaces-four-pages.md`, `the-workspaces-and-sync-sections.md`
      and `the-members-section-is-one-list.md`, are corrected in place to what ships.
- [ ] `organization.dashboard.acceptOwnershipPassword` is removed and its reader draws
      `organization.setup.passwordLabel`, both locales, types regenerated; the locale tests pass.
- [ ] 826's spec's requirement 18 correction carries a dated note that requirement 24 of this
      effort names the reader's own section "account"; `i18n/tests/organization.test.ts`'s guard
      says in its name or its comment that `settings.section` is the exception.
- [ ] `.aep/rules/interface.md`, *Row activation*, carries a dated note: in the settings
      directories a record's page is its sheet, since a member or a workspace has no page of its
      own, and the card opens it; requirement 23 is the precedent and the human accepted it at
      review round two.
- [ ] The plan's *The sync block says a fact* says the control is named "sync" and that the
      relative-time formatting was added by ticket 26; `node .aep/scripts/index.mjs` and
      `validate.mjs` are clean; `pnpm lint` and `pnpm test` pass.

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
