---
status: open
---
# docs(aep): the rules say what the code does

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Converge round one found statements the finished tree contradicts: `rules/data` says there are no optimistic updates while the appearance write is one (before and after this effort); `rules/api-layer` does not describe the plugin IPC names (`plugin:<name>|<command>`, the Rust name `<feature>_<act>` with its `rename`); `rules/interface` says switching workspace empties the undo stack while nothing in production clears it; `print/host.ts` names `tauri/src/print.rs`, now `tauri/src/print/`; `rules/module-layout` names `pnpm db:generate` as a root script where it is the desktop's. Each is corrected to what the code does, never the code to the text.

## Acceptance Criteria

Traces requirement 18 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 18.

- [ ] Each statement above reads as the code does; a search finds no rule or context naming a path that does not exist (criterion 18).
- [ ] `validate.mjs` and the governance test pass (criterion 18).

## Relevant areas

- `.aep/rules/data.md`, `.aep/rules/api-layer.md`, `.aep/rules/interface.md`, `.aep/rules/module-layout.md`, `src/lib/print/host.ts`

## Constraints

- No code behaviour changes; a comment is the only source edit.
- One commit ([[rules/version-control]]).
