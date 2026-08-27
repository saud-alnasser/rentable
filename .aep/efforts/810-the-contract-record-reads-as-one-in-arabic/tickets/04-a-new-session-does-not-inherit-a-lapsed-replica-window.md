---
status: resolved
---

# fix(sync): a new session does not inherit the replica window of the one before it

## Outcome

A sign-in the control plane accepts admits the machine that made it. The replica window a new
session starts with is the one the mint gives it, not the one the previous session left behind, so
a machine whose replica credential lapsed while it was offline gets back in by signing in, which
is the only thing the screen offers it.

## Acceptance Criteria

Traces requirement 4 of the spec, and its criterion 4 and criterion 5.

- [x] Signing in on a machine holding a lapsed `replica_expires_at` reaches the workspace, with no
      relaunch and no second sign-in. Verified against the running application by putting a lapsed
      window back and watching one process through it:

      ```
      09:45:28  process start, replicaExpiresAt 2026-08-26, lapsed
      09:45:32  the wall
      09:45:38  sync.signIn.started        one sign-in
      09:45:52  sync.session.established
      09:45:52  startup.started            the gate opened
      09:45:54  sync.workspace.minted      a live replica window
      09:45:55  startup.completed          the workspace
      ```

      Against the same machine before the change, from the same lapsed state:
      `sync.session.established` at 09:28:26 and then nothing at all, with the wall still up.
- [x] A refresh still carries the replica window it was holding, so a lapsed replica credential
      goes on refusing replication. `renewing_keeps_a_replica_window_the_answer_did_not_carry`
      passes unchanged in what it asserts.
- [x] A Rust test covers both directions: a session established fresh drops the held window, and a
      refresh keeps it. `signing_in_does_not_inherit_a_lapsed_replica_window` is the first;
      `renewing_keeps_a_replica_window_the_answer_did_not_carry` is the second.
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass, and the Rust suite passes.
      `cargo test` reported `155 passed; 0 failed; 4 ignored`, `cargo fmt --check` is clean, and
      `clippy` reports nothing new — its two warnings are in `settings.rs` and `sync/store.rs`,
      neither of which this touches.

## Relevant areas

`apps/desktop/tauri/src/sync/control.rs:488` is `record_control_plane_session`, and the `or_else`
that carries the held window forward is the line the defect is on. Its own doc comment states the
rule for a refresh and is the argument for keeping that half.

Its four callers are what separate the cases: `establish_session` (the sign-in) and
`establish_held_session` (the retry with an identity already held) begin a session; `mint_workspace`
answers with a real replica window of its own; the rename path refreshes.

`apps/desktop/src/lib/sync/session.ts` is `windowClosesAt`, which takes the earliest of the three
moments, and `apps/desktop/src/lib/sync/admission.ts` is what turns that into the wall. Neither
needs changing — they are correct given a correct window — but they are how the defect surfaces.

`apps/desktop/tauri/src/bootstrap.rs` is where the mint runs, behind the gate.

## Constraints

- **Do not drop a lapsed window wherever it is found.** The spec's fourth constraint has the
  reason. What separates the cases is whether the session is new.
- **The control plane is not changed.** What it answers is already right; this is about what the
  client does with the answer.
- **The three situations the wall tells apart stay three.** `noAccount`, `windowClosed` and
  `noSession` are not merged, renamed, or re-derived here.

## Notes

Folded into this effort by the human's decision on 2026-08-27, having been found while verifying
tickets 01 and 02 and having blocked that verification. It is not what the effort was opened for,
and the spec says so where it describes the defect.

Measured on 2026-08-27: the control plane answered `POST /account/sign-in` with `200`, the shell
wrote `sync.session.established` with `expiresAt` 2026-08-30, and the held state carried
`replicaExpiresAt` 2026-08-26, fifteen hours past. `absoluteExpiresAt` was 2026-09-26. The screen
went on reading *sign in again to continue* through four consecutive sign-ins.
