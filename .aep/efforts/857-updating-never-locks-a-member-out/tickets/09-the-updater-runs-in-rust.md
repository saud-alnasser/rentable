---
status: resolved
---

# feat(update): the updater runs in Rust and installs at quit

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Components, Rust `update/`; Technical Risks*).

## Outcome

The updater is driven from Rust commands: a check, a background download whose bytes are held in app state with progress as events, an install now that relaunches, and an install at quit that runs a downloaded release without relaunching after the quit path has pushed.

## Acceptance Criteria

Traces requirement 11, requirement 12, criterion 11 and criterion 12.

- [x] `update_check`, `update_download` and `update_install` exist, use the configured endpoint and key, and report no release, offline and failure distinctly.
- [x] The quit path installs a downloaded release with `restart_after_install(false)` after the workspace push, and a failed install never blocks quitting; tested against a stubbed updater.
- [x] `Recovery` (`update/mod.rs`) still writes its pending record before any install.
- [x] A human check on Windows that install at quit runs the installer and does not relaunch is listed for the close.

## Relevant areas

- apps/desktop/tauri/src/update/, apps/desktop/tauri/src/lib.rs (updater plugin)
- apps/desktop/tauri/tauri.conf.json (`plugins.updater`)
- apps/desktop/src/lib/startup/close.ts

## Constraints

- The frontend still calls the JS plugin until ticket 10 moves it to these commands.
- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
