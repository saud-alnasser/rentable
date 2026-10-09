---
status: open
---

# feat(desktop): the interface runs staged on mock data, with no shell behind it

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 11), and [[efforts/861-the-app-never-shows-something-false/plan]] (*Staging*).

## Outcome

`pnpm stage` opens a window of the real interface, signed in to one mock workspace full of records shaped like real ones, with no Tauri process running, so nothing it does can reach the owner's database, credentials, session or sync.

## Acceptance Criteria

Traces requirement 11 and criterion 11.

- [ ] With staging running no Rust process from this repository runs, and the window's network log holds no request to any host but the local dev server.
- [ ] A record created in staging is gone after a reload, and the developer database and `%APPDATA%/com.rentable.app` are unchanged by a staging run.
- [ ] The stage host is `fakeHost()` with overrides, so `pnpm check` fails when it stops satisfying `Host`; a shell call it does not answer rejects naming the call.
- [ ] Every list, each record kind and the dashboard show filled mock data, with contracts active, ending, ended, renewed, overdue and paid, and Arabic names under Arabic.
- [ ] One command from a worktree opens the window at 1124 x 824 on the stage server.
- [ ] `pnpm build:web` output holds no staging module or mock record.

## Relevant areas

- apps/desktop/vite.config.js, apps/desktop/src/lib/app/host.ts, apps/desktop/src/lib/app/tests/host.ts and each port's `tests/testing.ts`
- apps/desktop/src/lib/platform/database/client.ts and memory.ts (the row shape), apps/desktop/scripts/seed.ts (record shapes), apps/desktop/scripts/prototype.mjs (a launch script's idiom)
- apps/desktop/src/lib/startup/component/root.svelte (what boot asks the host)

## Constraints

- No product module changes to make staging work; the plugin's redirect and the mocks are the whole seam.
- sql.js is a development dependency of the desktop package only ([[references/pnpm]]).
- The browser profile is a temp directory, removed when the run ends ([[rules/workstation]]).

## Notes
