---
use-when: "launching staging, writing a staged state, or photographing one"
---

# Staging

The real interface on mock data, with no Tauri process behind it: the owner steps through the
states an effort's on-screen checks need ([[rules/staging]]). It lives in
`apps/desktop/src/lib/prototype/stage/`, and every module there says what it is for.

## Running it

| Command | What it does |
| --- | --- |
| `pnpm stage` | starts `vite dev --mode stage` on port 1430 and opens it in an Edge or Chrome app window at the desktop window's size, on a temp profile removed on exit; reuses a stage server already running |
| `pnpm stage:shots [prefix...] [--out <dir>]` | enters each state whose id starts with a prefix (every state with none) in English and Arabic, light and dark, each in a fresh headless context, and writes `<id>-<language>-<appearance>.png` to `.aep/scratch/stage/`; exits 1 when one stops short, throws, or asks any host but the stage server |

`STAGE_BROWSER` names a Chromium browser where none is found; `STAGE_DEBUG_PORT` opens the window's
DevTools port. Both run from the repository root or `apps/desktop`, and from any worktree.

## How it stands in for the shell

`vite.js` applies only to `vite dev --mode stage`. It resolves `$lib/app/host` to `host.ts`, and
each feature's `tauri.ts` adapter to that feature's port of the same host, since some reads call
their adapter directly. **A new feature with a `tauri.ts` is added to `ADAPTERS` in `vite.js`**, or
its reads reach the IPC mock and refuse.

`host.ts` builds the host from `fakeHost()` (the tests' fakes, so `pnpm check` holds it to `Host`),
answers what boot needs, and wraps it so a member it does not answer rejects naming itself. Every
`invoke` lands in `mockIPC`: the database plugin's commands are answered from an in-memory sql.js
engine built from the real migrations (`database.ts`), the window's own chrome is answered with
nothing, and anything else rejects as `stage: the shell command <name> is not staged`.

`record.ts` writes one workspace like a real one, the same on every boot: four complexes of ten
units, thirty tenants (the last three with no contract), and contracts paid, overdue, ending,
renewed, scheduled, fulfilled, expired, defaulted and terminated, with their payments. Names are
Arabic under Arabic. Ids are new on every boot.

## Writing a state

A state file is `state/<name>.ts` exporting `states`; the bar lists effort files first and
`example.ts`, the tour, last.

```ts
import { maskOf } from '@rentable/workspace-permission';

import type { StateFile } from '../state';

export const states: StateFile['states'] = [
	{
		id: '900.delete-question', // unique; `pnpm stage:shots 900.` selects by this prefix
		label: 'delete question', // what the bar shows
		look: 'the red button reads on its fill.', // what the owner looks at, one sentence
		route: '/tenants', // where the steps start
		member: { role: 'member', permissions: maskOf('viewTenant') }, // who is looking; the owner by default
		records: async (db) => {}, // drizzle over the staged engine, run before the window draws
		host: (host) => {}, // replace what a shell call answers
		steps: async (screen) => {}, // what a person does to get there
		owner: { press: 'Escape', hover: '[data-sonner-toaster]' } // their last act, see below
	}
];
```

`screen` has `find`, `click`, `type`, `press`, `go` and `wait`, each taking a selector, a
`{ role, name }` or an element and waiting up to ten seconds, and `t`, the app's own translations,
so a step names a control by its label in either language: `{ role: 'button', name:
screen.t.common.actions.edit() }`.

## Gotchas

- **Find a record by what it is, not where it sits.** Ids are new on every boot and lists sort by
  name, which differs between languages: the first tenant under Arabic is not the first under
  English. Look the record up in `records` (it runs before the window, on the written records)
  and keep its id for the steps.
- **A focus ring needs a real key, a toast stack a real pointer.** `:focus-visible` ignores a
  script's key event, and the toaster spreads only on real hover. Name the act in `owner`: the
  look line asks the owner for it, and `stage:shots` does it through the browser's own input.
- **The toaster shows three at once**, and a toast that is not an error leaves after a few
  seconds; raise one with `duration: Number.POSITIVE_INFINITY` to hold it.
- **A failure has to come from the app's own path.** To show a failed save, make the staged
  database refuse it (a `raise(abort, ...)` trigger in `records`) rather than raising the toast.
- **The bar stops its events reaching the page**, so a dialog stays open while it is used; its
  arrow moves it out of the way of what is being looked at.
- **A record a state writes is gone on the next load.** Every change on the bar reloads and builds
  the window from nothing.
- **From Git Bash, a `/path` argument to node becomes a Windows path**; prefix the command with
  `MSYS_NO_PATHCONV=1`.

## What it cannot show

Anything past the shell: the Tauri window's own frame and its native menus, file and print
dialogs, the updater, a real sync or organization round trip, credentials, and the Rust side's
own messages. Text is drawn by Chromium as WebView2 draws it, so a difference that only WebKit
(macOS) would show is out of reach too. Such a check stays a check in the running app.

Established 2026-10-11 against Vite 8.2, SvelteKit 2.70, Svelte 5.56, sql.js 1.14 and Chrome 154 on
Windows 11, effort 861.
