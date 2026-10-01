---
status: resolved
blocked-by: []
---

# docs(desktop): the remote-sync context names the consent as the way in now does

## Outcome

`contexts/desktop/remote-sync.md`, under **Sign in**, names the owner's consent the way the
application now says it: the connect step is "connect Turso", its button "connect", and the way to
give the authority back stays "forget Turso account". The glossary and the i18n test's term table
agree again.

## Acceptance Criteria

Traces requirement 3 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]].

- [x] The **Sign in** entry no longer names "connect Turso account" as the consent's name, and says
      what it is now, with a dated correction note naming effort 843. *Verified: the lines joined,
      a grep for "connect Turso account" finds nothing; the note is dated 2026-10-01 and links the
      843 spec, requirement 3.*
- [x] Every term the entry names for the consent matches a row of `TERMS` in
      `apps/desktop/src/lib/i18n/tests/organization.test.ts`, and that test passes. *Verified: it
      names `connect Turso` and `forget Turso account`, both rows of `TERMS`; the test printed 11
      pass, 0 fail.*
- [x] `node .aep/scripts/validate.mjs` reports no failures. *Verified: 519 artifacts checked,
      no failures.*

## Relevant areas

- `.aep/contexts/desktop/remote-sync.md`

## Notes

*Appended 2026-10-01 by converge, round 1: ticket 06 renamed the consent's step and button, which
falsified this entry.*
