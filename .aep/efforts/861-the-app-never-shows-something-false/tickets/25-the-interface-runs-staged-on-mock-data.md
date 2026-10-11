---
status: resolved
---

# feat(desktop): the interface runs staged on mock data, with no shell behind it

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 11), and [[efforts/861-the-app-never-shows-something-false/plan]] (*Staging*).

## Outcome

`pnpm stage` opens a window of the real interface, signed in to one mock workspace full of records shaped like real ones, with no Tauri process running, so nothing it does can reach the owner's database, credentials, session or sync.

## Acceptance Criteria

Traces requirement 11 and criterion 11.

- [x] With staging running no Rust process from this repository runs, and the window's network log holds no request to any host but the local dev server. Verified: `tasklist` holds no rentable process while staging runs; across 48 runs (12 states, both languages, both appearances) and the probes, the CDP network log's hosts are `localhost:1430` alone.
- [x] A record created in staging is gone after a reload, and the developer database and `%APPDATA%/com.rentable.app` are unchanged by a staging run. Verified: a tenant inserted through the staged host made the count 31, and after a reload it was 30; `%APPDATA%/com.rentable.app` was last written 2026-10-07, before staging existed, and is unchanged after every run.
- [x] The stage host is `fakeHost()` with overrides, so `pnpm check` fails when it stops satisfying `Host`; a shell call it does not answer rejects naming the call. Verified: with `markGet` answering `5` `pnpm check` reports 1 error, and 0 once restored; an unanswered member rejected as `fake host was asked for diagnostics.write` before it was answered, and an unstaged command rejects as `stage: the shell command <name> is not staged`.
- [x] Every list, each record kind and the dashboard show filled mock data, with contracts active, ending, ended, renewed, overdue and paid, and Arabic names under Arabic. Verified: the tour and 861's states show 30 tenants, 4 complexes of 10 units, 30 contracts across paid, overdue, ending, renewed, scheduled, fulfilled, expired, defaulted and terminated, payments, and the dashboard's figures; under Arabic the names, workspace and units are Arabic.
- [x] One command from a worktree opens the window at 1124 x 824 on the stage server. Verified: `pnpm stage` runs `scripts/stage.mjs`, which starts `vite dev --mode stage` on 1430 and opens Edge or Chrome as an app window sized from `tauri.conf.json` (1124 x 824) on a temp profile it removes on exit; launched for the owner at the hand-off.
- [x] `pnpm build:web` output holds no staging module or mock record. Verified: `pnpm build:web` exits 0, and `build/` and `.svelte-kit/output` hold none of `stage-adapter`, `rentable:stage`, `sql-wasm`, `heldHost`, `faker`, `Randexp`, `North Properties`, `olivia.owner`, `staged failure`, `stage: the shell`, while the same grep finds product copy (`discard changes?`).

## Relevant areas

- apps/desktop/vite.config.js, apps/desktop/src/lib/app/host.ts, apps/desktop/src/lib/app/tests/host.ts and each port's `tests/testing.ts`
- apps/desktop/src/lib/platform/database/client.ts and memory.ts (the row shape), apps/desktop/scripts/seed.ts (record shapes), apps/desktop/scripts/prototype.mjs (a launch script's idiom)
- apps/desktop/src/lib/startup/component/root.svelte (what boot asks the host)

## Constraints

- No product module changes to make staging work; the plugin's redirect and the mocks are the whole seam.
- sql.js is a development dependency of the desktop package only ([[references/pnpm]]).
- The browser profile is a temp directory, removed when the run ends ([[rules/workstation]]).

## Notes
