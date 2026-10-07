---
status: open
blocked-by: [09]
---

# feat(update): one update action, and the app looks for updates itself

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Components, frontend `update/`*).

## Outcome

The update state lives in `update/` and one `update-action` component in three variants draws it in the Settings card and wherever a person is held; the app checks at launch, downloads a release in the background and offers the restart without interrupting.

## Acceptance Criteria

Traces requirement 11, requirement 12, criterion 11 and criterion 12.

- [ ] `settings/update-download.svelte.ts` moves to `update/` and calls the ticket 09 commands; `update/tauri.ts` no longer uses the JS plugin directly.
- [ ] `update-action` has `screen`, `notice` and `card` variants; the Settings card draws `card` and behaves as before.
- [ ] A component test drives each variant through check, download, install and restart, and through no release and offline, each with its own sentence in both languages.
- [ ] Startup's `continue()` checks with no press; a release found downloads in the background and a toast offers the restart; a test covers it.

## Relevant areas

- apps/desktop/src/lib/update/, apps/desktop/src/lib/settings/update-download.svelte.ts, update-announcement.ts, component/updates.svelte
- apps/desktop/src/lib/startup/machine.ts (`continue`)

## Constraints

- Startup must not import settings internals; that is why the state moves.
- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
