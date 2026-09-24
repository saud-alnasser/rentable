---
status: resolved
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

- [x] The user-facing `Error` constructions in `apps/desktop/tauri/src/organization/**` and
      `sync/**` use `Refused { reason }` with a reason from one list mirrored in `error/tauri.ts`.
      A Rust test asserts each command's user-facing refusals carry a reason. Verified: `RefusalReason` (60 reasons) in `tauri/src/error.rs`, used by about 130 constructions under organization and sync via `Error::refused`; mirrored by `TAURI_REFUSAL_REASONS` in `error/tauri.ts` with a test comparing both lists; `refusals_in_the_shell_carry_a_reason` fails on a leftover variant; `cargo test` 417 passed on the merged tree, `cargo fmt --check` clean.
- [x] `setup-walk.svelte:277` (`consentFailed` plus the raw error), the group detail
      (`setup-walk.svelte:654-661`), and `routes/organization/new/+page.svelte:180` show a
      translated sentence, with the raw text in a disclosure. Verified: the setup walk's consent failure and group detail and the new-organization page show a translated sentence with the raw text in `error/component/detail-disclosure.svelte`; the phrase match is gone, the walk keys on `groupNeeded`; `setup-walk.svelte.test.ts` (Arabic case) and `setup.test.ts` pass within desktop vitest 318 of 318.
- [x] `toErrorText` callers (`sync/autosync.ts:135`, `members.svelte:399,407`,
      `settings/component/area.svelte:245-315`, `startup-ports.ts:77`) render the reason's
      sentence in the reader's language.
 Verified: a shell refusal becomes `host.<reason>` with en and ar sentences in `common.refusals.host`; `message.test.ts` checks both languages through a procedure wrapper and that an I/O failure keeps its generic sentence; desktop node 1148 of 1148.
## Relevant areas

- `apps/desktop/tauri/src/error.rs:13`, `tauri/src/organization/setup.rs:446`,
  `sync/turso/consent.rs:219`, `apps/desktop/src/lib/error/*`, `organization/setup.ts:173`
  (the phrase match pinned by a test against `setup.rs`)

## Constraints

- A shell failure nobody can act on (an I/O failure, a corrupt file) stays an unexpected error with
  its generic sentence. Only refusals a person can cause get reasons.
