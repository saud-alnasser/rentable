---
status: resolved
---
# docs(aep): the rules say what the code does

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Converge round one found statements the finished tree contradicts: `rules/data` says there are no optimistic updates while the appearance write is one (before and after this effort); `rules/api-layer` does not describe the plugin IPC names (`plugin:<name>|<command>`, the Rust name `<feature>_<act>` with its `rename`); `rules/interface` says switching workspace empties the undo stack while nothing in production clears it; `print/host.ts` names `tauri/src/print.rs`, now `tauri/src/print/`; `rules/module-layout` names `pnpm db:generate` as a root script where it is the desktop's. Each is corrected to what the code does, never the code to the text.

## Acceptance Criteria

Traces requirement 18 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 18.

- [x] Each statement above reads as the code does; a search finds no rule or context naming a path that does not exist (criterion 18). Verified: `rules/data` confines "no optimistic updates" to workspace data and names the appearance and language writes applied before they are written; `rules/api-layer` states the plugin IPC convention (`plugin:<name>|<command>`, `<feature>_<act>` with `rename`, the three unprefixed transfer and startup commands, the derived lists and `"<name>:default"`); `rules/interface` and the `undo/` comments say a workspace switch does not empty the undo stack; `print/host.ts` names `tauri/src/print/`; `rules/module-layout` and `contexts/desktop/feature.md` place `db:generate` in the desktop package; `rules/frontend`'s block count and chevron bullet match what is left. A sweep of every backticked path in `.aep/rules/` and `.aep/contexts/` finds only dated historical notes, gitignored paths and placeholders missing.
- [x] `validate.mjs` and the governance test pass (criterion 18). Verified: `validate.mjs` passes and the governance test prints `pass 3 / fail 0` in the run's tree; check 0, eslint 0, prettier 0. Source edits are three comments.

## Relevant areas

- `.aep/rules/data.md`, `.aep/rules/api-layer.md`, `.aep/rules/interface.md`, `.aep/rules/module-layout.md`, `src/lib/print/host.ts`

## Constraints

- No code behaviour changes; a comment is the only source edit.
- One commit ([[rules/version-control]]).
