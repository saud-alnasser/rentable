---
status: open
blocked-by: [19]
---

# feat(organization): refusals from the shell carry reasons, and Turso's text sits behind details

## Outcome

Every refusal the Rust shell raises that a person can cause reaches the interface as a
`Refused { reason }` whose reason is translated like a router's code. Turso's own error text is
never part of a sentence. It sits behind a details disclosure where it helps.

## Acceptance Criteria

Traces requirement 23 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criterion 23.

- [ ] The user-facing `Error` constructions in `apps/desktop/tauri/src/organization/**` and
      `sync/**` use `Refused { reason }` with a reason from one list mirrored in `error/tauri.ts`.
      A Rust test asserts each command's user-facing refusals carry a reason.
- [ ] `setup-walk.svelte:277` (`consentFailed` plus the raw error), the group detail
      (`setup-walk.svelte:654-661`), and `routes/organization/new/+page.svelte:180` show a
      translated sentence, with the raw text in a disclosure.
- [ ] `toErrorText` callers (`sync/autosync.ts:135`, `members.svelte:399,407`,
      `settings/component/area.svelte:245-315`, `startup-ports.ts:77`) render the reason's
      sentence in the reader's language.

## Relevant areas

- `apps/desktop/tauri/src/error.rs:13`, `tauri/src/organization/setup.rs:446`,
  `sync/turso/consent.rs:219`, `apps/desktop/src/lib/error/*`, `organization/setup.ts:173`
  (the phrase match pinned by a test against `setup.rs`)

## Constraints

- A shell failure nobody can act on (an I/O failure, a corrupt file) stays an unexpected error with
  its generic sentence. Only refusals a person can cause get reasons.
