---
status: resolved
blocked-by: [23]
---
# refactor(desktop): every feature that crosses to Rust owns its host port

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

The rest of `platform/host.ts` that is a feature's (remote sync, update, print, export, import, earlier records, settings, bootstrap) moves the way the organization's did. `platform/host.ts` keeps window, dialog, the database transport and diagnostics.

## Acceptance Criteria

Traces requirement 7 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 7.

- [x] `platform/host.ts` holds only platform capabilities (criterion 7). Verified: `platform/host.ts` declares only `PlatformHost` (`window`, `opener`, `dialog`, `diagnostics`), `DiagnosticRecord` and `Unlisten`; a search of `src/lib/platform` for an import of any feature or capability that owns a port prints nothing. sync, update, settings, startup, workspace, print and transfer each own `host.ts` and `tauri.ts`, composed in `app/host.ts`; `remoteSync` became `sync` and `bootstrap` became `startup.bootstrap` everywhere. The child's comparison of every invoke, listen and event constant: identical apart from one added `settings_get` call behind `diagnostics.directory()`, the command `revealDiagnostics` already read.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree, after the child rebased onto 38's split: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0, `cargo test --lib` 642 passed; tests changed only in paths, mock targets and the composed fake.

## Relevant areas

- `src/lib/platform/host.ts`, `src/lib/platform/tauri.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
