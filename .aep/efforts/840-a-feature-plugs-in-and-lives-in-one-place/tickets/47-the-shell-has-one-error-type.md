---
status: resolved
blocked-by: [46]
---
# refactor(tauri): the shell has one error type and one scratch helper

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`PlatformError`, `SyncRefusal`, `ReplicationRefusal` fold into `error::Error`; `Result<_, String>` goes (`transition/two.rs`, `print.rs`, `authority.rs`); repeated `map_err` becomes `From` where the mapping is the same; the local `refused()` and `integrity()` helpers go. The 28 test scratch-directory helpers become one in `test/`.

## Acceptance Criteria

Traces requirement 13 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 13.

- [x] No error enum beside `error::Error`, no `Result<_, String>`, one scratch helper (criterion 13). Verified: `guard::error::tests::the_crate_has_one_error_type_and_one_scratch_directory` passes; a scratch `fn scratch_bad() -> Result<(), String>` appended to `settings.rs` failed it with `settings.rs:300: a Result that carries a String`; reverted. `PlatformError`, `SyncRefusal`, `ReplicationRefusal` and the private `Refusal` enums are gone; 33 scratch-directory copies call `test::scratch`.
- [x] Every refusal reason string crossing to the interface is unchanged. Verified: the pinning tests `each_failure_crosses_with_the_words_it_always_had` and `a_replication_crosses_with_its_refusal_as_one_word` were run green against the old types, then pass unchanged after the fold; `Replication.refusal` still serialises as `none`, `account` or `credential`; `error/tests/tauri.test.ts` passes. The orchestrator checked `print.rs`: `failed()` and the new `From<tauri::Error>` both give `Internal` with the error's text, and the non-Windows path compiles by reading.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: `cargo fmt --check` 0, `cargo test --lib` `642 passed; 0 failed; 11 ignored` (five new tests), clippy at its seven pre-existing warnings, check 0, `pnpm test` 0. Tests that named a removed type now name its constructor or `Option<Error>`, comparing the same values.

## Relevant areas

- `tauri/src/error.rs`, `turso/platform.rs`, the 28 helper sites

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
