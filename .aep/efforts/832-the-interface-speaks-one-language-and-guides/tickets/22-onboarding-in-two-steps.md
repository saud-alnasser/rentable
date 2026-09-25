---
status: open
blocked-by: [17, 20]
---

# feat(organization): creating an organization is two steps and one loading pass

## Outcome

The walk is: connect the Turso account, then name the organization and choose a username and
password. After that the owner is in the application. The first workspace is created for them,
named after the organization, as the first stage of the one loading pass that follows. The connect
card shows one line and a disclosure instead of five statements.

## Acceptance Criteria

Traces requirement 18 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criterion 18.

- [x] `SETUP_STEPS` is `['connect', 'name']`, and the workspace step, its form and its schema use
      are removed from `setup-walk.svelte` and `routes/organization/new/+page.svelte`. The
      connect-existing branch is unchanged. Verified: `SETUP_STEPS` is `['connect', 'name']`; the workspace step, form and schema use are gone from the walk and the page, connect-existing untouched; `setup.test.ts` asserts two steps; `pnpm check` 0 errors on the merged tree.
- [x] `startup.standingChanged` takes an optional `prepare`, shown as the loading surface's first
      stage. The page passes one that creates the workspace. A failed `prepare` lands on the
      existing no-workspace surface. Tests in `layout/tests/` cover both. Verified: `standingChanged({ prepare })` runs `prepare` as the loading pass's first stage (prepare, workspace, changes, records); the page's creates the workspace named after the organization; a failed prepare lands on no-workspace; `layout/tests/startup.test.ts` and `startup-stage.test.ts` cover both; desktop node 1156 of 1156 on the merged tree.
- [x] Component test: the walk has two steps, and after the create no second busy surface precedes
      the loading pass. Verified: `routes/organization/new/tests/page.svelte.test.ts` renders the real route with a real startup: two steps, then `loading` with no other busy surface, the workspace created under loading, then `ready`; a second test covers failure; desktop vitest 320 of 320.
- [x] The connect card's five statements become one line, with the rest behind a disclosure. Verified: the connect card reads one short sentence with a closed 'before you connect' disclosure holding the five facts, en and ar; covered in `setup-walk.svelte.test.ts` and `setup.test.ts`.
- [ ] Checked by the human against a real Turso account: consent, name, and in, with one loading
      pass.
 Awaiting the human's check against their Turso account.
## Relevant areas

- `apps/desktop/src/lib/organization/setup.ts:36-41,103,287`, `organization/component/setup-walk.svelte`,
  `routes/organization/new/+page.svelte:98,199,232`
- `apps/desktop/src/lib/layout/startup.ts:594` (`standingChanged`), `startup-stage.ts`,
  `layout/component/startup-loading.svelte`
- `organization/query.ts:340` (`useCreateWorkspace`)

## Constraints

- What the walk does with the consent, the vault and the organization database does not change.
- Onboarding copy is short from the start (requirement 17).

## Notes

The human tests the build against their own Turso account, as for 826 and 828. Ask before driving
the app while they are at the machine.
