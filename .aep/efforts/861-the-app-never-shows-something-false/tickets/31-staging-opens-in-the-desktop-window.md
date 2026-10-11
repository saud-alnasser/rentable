---
status: resolved
---

# feat(desktop): staging opens in the desktop window

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 11), and [[efforts/861-the-app-never-shows-something-false/plan]] (*Staging*). Asked by the owner after ticket 28: staging should open as a desktop window, not a browser, from development only and with no entry code changed.

## Outcome

`pnpm stage:open` opens the staged interface in the app's own desktop window, on mock data, while no release build can open it and nothing of the owner's data is reached.

## Acceptance Criteria

Traces requirement 11.

- [x] The staged states open in the desktop shell. Verified: `pnpm stage:open` built the shell into `target/stage` and opened its window at the app's size; the bar reached state 3 with the staged records drawn and no error, and the owner used it.
- [x] Only development reaches it, with no entry code changed. Verified: the shell runs through `tauri dev --config tauri/tauri.stage.conf.json`, which merges over the app's config at build time and points the window at the stage server; the staging plugin applies only to `vite dev --mode stage`, so a build resolves every module as before.
- [x] Nothing of the owner's data is reached. Verified: the shell runs as `com.rentable.stage`, so its data, config and WebView directories are its own and removed on exit, and it registers no link scheme; every command the application's modules send goes to the staged answer (`@tauri-apps/api/core` resolves to the real one with `invoke` from `ipc.ts`), but the window's own, which the shell answers. The Rust side's setups read only the identifier's own directories, and credentials are reached only through commands, none of which reach it.
- [x] The browser window and the shots still work. Verified: `pnpm stage:open --browser` keeps the Chromium window; `pnpm stage:shots 861.` passed all 52 shots after the change.

## Relevant areas

- apps/desktop/scripts/stage.mjs, apps/desktop/tauri/tauri.stage.conf.json, apps/desktop/src/lib/prototype/stage/(host.ts, ipc.ts, vite.js), .aep/references/stage.md, .aep/rules/staging.md, .aep/references/pnpm.md
