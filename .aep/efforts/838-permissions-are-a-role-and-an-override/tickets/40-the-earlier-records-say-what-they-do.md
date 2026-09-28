---
status: resolved
---

# fix(desktop): the earlier records say what they do

## Outcome

Review round one of tickets 32 to 37, the earlier records. The way-in line promises the records
will be brought in once there is a workspace, which nothing does by itself; `rules/interface` does
not name the new way into the import; the release note is a second paragraph and says 0.12 where
everything else says 0.12.0; one diagnostic name breaks the pattern; and some comments run past the
line width. After this, each says what is true.

## Acceptance Criteria

Traces requirement 18 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] The way-in line says the earlier version's records are on this machine and can be brought in
      from settings once there is a workspace, in English and Arabic.
- [x] `rules/interface`, *Export and import*, names the earlier-records callout, what it opens,
      and why it skips choosing a file, as a stated exception.
- [x] The release note is one line with the rest of the effort's, naming 0.12.0 and 0.13.0;
      `.changeset/a-payment-says-how-it-was-paid.md` names the schema version the payment change
      raises a workspace to, which is 6.
- [x] The diagnostic is `earlier.unreadable`; comments wrap at 100; the margin is on the ladder.
- [x] The plan's *Before Turso* bullet says the callout shows with the workspace open and refuses
      the bring-in without the import flags, saying why.
- [x] `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `src/lib/workspace/earlier.ts`, `component/earlier-records.svelte`,
  `src/lib/organization/component/workspaces.svelte`, `src/lib/i18n`, `.aep/rules/interface.md`,
  `.changeset/`, the effort's `plan.md`
