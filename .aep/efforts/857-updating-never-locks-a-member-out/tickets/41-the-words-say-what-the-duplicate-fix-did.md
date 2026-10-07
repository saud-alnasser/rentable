---
status: open
blocked-by: [39, 40]
---

# docs: the rules, contexts and comments say what the duplicate fix did

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Duplicates never cost a record*).

## Outcome

Found by the standards review of the reopened work: the step declaration contract and the organization context say nothing of `readers_need`; comments describe three retirable tables where there are five, and a condition the helpers never got; three tickets do not say why they carry no changeset; two strings say devices where the app says machine; a tenant import comment still names the unique constraint; `api-layer.md` does not mention the statement rewrite; and a paragraph in `testing.md` sits in the wrong place.

## Acceptance Criteria

Traces requirement 14.

- [ ] `rules/migrations.md` *Every step declares its kind and its floors* names `readers_need` and its test, and `contexts/desktop/organization.md` says what a read-only member meets behind a step (tickets 37 and 40).
- [ ] `retired.ts`, `client.ts` and `persistence.md` describe the five retirable tables and the six exclusion tests; the three save-check helpers' comments say retired records are kept out by the statement rewrite.
- [ ] Tickets 34, 37 and 38 say in Notes why they carry no changeset; `duplicateValues` and `identicalRecords` say machines; `tenant/transfer.ts`'s comment no longer names the unique constraint; `rules/api-layer.md` says `createDatabase` rewrites every statement to keep retired rows out; the heal paragraph in `rules/testing.md` sits after the explanation it interrupted, wrapped as the file is.
- [ ] `node .aep/scripts/validate.mjs` passes; `pnpm check` and `pnpm lint` pass.

## Relevant areas

- .aep/rules/migrations.md, api-layer.md, testing.md, .aep/contexts/desktop/organization.md, persistence.md
- apps/desktop/src/lib/platform/database/, tenant/, complex/, contract/, organization/i18n/

## Constraints

- No changeset of its own.
