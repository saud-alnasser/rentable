---
status: resolved
blocked-by: [01]
---
# refactor(desktop): dates and periods are one capability

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`api/date.ts`, `design/date.ts`, `api/period.ts` and `payment/period.ts` become `src/lib/date/` with an `index.ts`. Where two functions do the same thing, one stays.

## Acceptance Criteria

Traces requirements 13 and 20 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 13 and 20.

- [x] No date or period module exists outside `date/` (criterion 13). Verified: `grep -rnE "lib/(api/date|api/period|design/date|payment/period)" apps/desktop/src` prints nothing; `src/lib/date/` holds `date.ts`, `calendar.ts`, `period.ts`, `index.ts`. `formatRecordDate` sits in `platform/locale.ts` (re-exported by `date/`), since the foundation's date cell renders with it and foundation may not import a capability; `payment/period.ts` became the general `isWithinPeriod` with the payment column passed in.
- [x] Their tests move with them. Verified: `date/tests/period.test.ts` and `date/tests/calendar.test.ts` exist; layers and naming tests print `pass 8 / fail 0`.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0. The only assertion diff in any test is the message string `design/date.ts` to `date/calendar.ts`; two workspace tests call `formatDateInput` for the identical `toIsoDay`, with unchanged expected values.

## Relevant areas

- the four files named, and their importers

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
