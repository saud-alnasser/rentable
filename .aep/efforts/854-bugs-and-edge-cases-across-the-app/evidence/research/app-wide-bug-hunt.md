---
use-when: "building or reviewing a fix in the app-wide bug and edge-case effort, and the finding behind a requirement is needed"
---

# App-wide bug hunt at c9d9c4ba

Four read-only hunters swept the app on 2026-10-06, one each over the Rust shell, the
frontend data layer, the domain rules, and the interface. Every finding below was traced end
to end through the code; the ones marked *reproduced* were also run (throwaway node probes
against the real routers and the in-memory database, or a scratch Rust program). The
orchestrator re-read the headline claims (undo stack, route params, rank comparison, loopback
socket, persisted record) before writing the spec. `cargo test --lib` at c9d9c4ba: 774 passed,
0 failed, 11 ignored.

Ids are the spec's requirement numbers.

## Data and undo

- **R1. The undo stack outlives the workspace.** `inverseStack.clear()` has no caller outside
  tests. `startup/switch.ts:75-81` drops the query cache and context only; `startup/wall.ts`
  `signOut` / `select` / `remove` and `startup/machine.ts:103` (`raiseSignInWall`) the same.
  `undo/undo.ts:56-59` and `undo/move.ts:797` admit a replay against another workspace would
  corrupt. Every inverse closes over plain `api.*` calls that resolve against the open
  workspace, so deleting tenants in A, switching to B and pressing Ctrl+Z creates A's tenants in
  B and syncs them. The undo toast lasts 8 s and outlives a switch. Found by two hunters
  independently.
- **R8. Undo of a create succeeds silently when the record is gone.** `complex.units.delete`,
  `contract.delete`, `payment.delete`, `complex.delete` answer `undefined` for a missing row
  (*reproduced*). The inverses at `complex/unit/query.ts:189`, `contract/query.ts:243`,
  `contract/renewal/query.ts:20`, `payment/query.ts:210`, `complex/query.ts:186` treat that as
  success, write a "deleted" history entry, and redo recreates the row. `tenant.delete` throws
  (`ensureTenantStillExists`). Contradicts `rules/data` *Undo*.
- **R9. Bulk-delete redo reuses the original `result.deleted`.** `tenant/query.ts:239-240`,
  `complex/unit/query.ts:162-163`, `payment/query.ts:270-271`,
  `contract/selection/query.ts:139-140`. `complex/query.ts:279-287` keeps what the last redo
  removed; the others do not, so a partially refused redo records every record as deleted and
  the next undo hits `idTaken`.
- **R23. Renewal and unit reassignment write no history.** `useRenewContract`,
  `useSetContractUnits`; `renewed` and `assigned` exist in the vocabulary.
- **R24. `useCreateComplex` undo asks for `deleteUnit`** even when the complex has no units, so
  a member without that flag is refused an undo they may perform.

## Transfer (import and export)

- **R5. Contract import can double-book a unit.** `contract/transfer.ts:248-299` never calls
  `ensureUnitsAssignable` and never dedupes `namedUnits`; `contract_unit` has no unique
  constraint. Two rows naming `C / U1` over overlapping terms, one row naming `C / U1; C / U1`,
  or a row taking a unit an existing contract holds all import (*reproduced*: U1 assigned to G1
  twice and G2 once). `contract.create` (`contract/router.ts:121`) refuses with
  `contract.unitsTaken`.
- **R6. Tenant import keys on the pair, the schema on each column.** `tenant/transfer.ts:52-70`
  marks both `nationalId` and `phone` as `identity: true`, so `planImport` keys on the pair; the
  schema has each unique alone. A row with a held national id and a new phone plans as
  importable and the write fails whole with `UNIQUE constraint failed: tenant.national_id`
  (*reproduced*), a generic error naming no row.
- **R7. Payments land on an arbitrary contract when two share a fallback reference.**
  `transfer/reference.ts:59` gives `nationalId @ start` to a numberless contract;
  `transfer/router.ts:153-160` builds `ids` with `Map.set` (last wins). Two numberless contracts
  for one tenant starting the same day (allowed by `contract.create`) make a payment row land on
  either (*reproduced*). Exporting such a workspace and importing it into an empty one is
  refused whole, because the two contract rows collide.

## Domain rules

- **R3. Ranking compares money with no tolerance.** `contract/rank/rank.ts:184`
  `getExpectedAmountBy(contract, now) - paidAmount > 0`. Money is REAL; 12 x 4166.67 against the
  sum of twelve 4166.67 payments leaves 1.45e-11. The contract derives `expired` (EPSILON
  elsewhere: `contract.ts:82`, `schedule.ts:141`, `contract.ts:122`) but ranks `overdue`, shows
  0 outstanding, offers a reminder, and `contract.reminder` refuses with
  `contract.nothingToRemind` (`schedule/router.ts:41-46`). The directory's SQL bound
  `paid_amount < expected_amount` (`directory/router.ts:147`) has the same gap.
- **R4. Restoring a terminated contract skips the overlap rule.** `contract/router.ts:314-349`
  `unterminate` and `selection/router.ts:197-225` `unterminateMany` check status only. A
  terminated, B takes the unit (allowed: `assignment.ts:71` ignores terminated), restoring A
  leaves two live contracts on one unit. Distinct from `restoreMany`, the undo of a deletion,
  which `rules/data` deliberately lets bring its units back.
- **R21. Arabic-Indic digits.** `tenant/component/form.svelte:35` strips `[^0-9]` per
  keystroke, so `٥٠١٢٣٤٥٦٧` vanishes; `identityField` (`tenant/tenant.ts:46`), payment amount
  (`payment/component/form.svelte:43-51`) and contract cost (`contract/form.ts:30-38`) refuse
  them through `Number()` with misleading messages. `platform/database/search.ts:33-35` already
  folds them for search.
- **Q1 (open). Collected and due cover different contract sets.** `dashboard/router.ts` "due"
  (~:540) excludes terminated contracts, "collected" (~:552) sums every payment in the period.

## Interface

- **R2. Record pages read `page.params.id` once.** `routes/tenants/[id]`, `contracts/[id]`,
  `complexes/[id]`, `complexes/units/[id]`, `contracts/payments/[id]`, `contracts/units/[id]`
  each hold `const id = page.params.id ?? ''`. SvelteKit reuses the component within a route,
  so Renew (`contract/component/host.svelte:268-270` goes to the successor) and a palette jump
  between two records of one kind keep showing the first. `routes/settings/workspaces/[id]`
  does it right with `$derived` and `{#key}`.
- **R10. A failure opening the workspace after sign-in is silent.** `startup/wall.ts` `signIn`
  has `try/finally` and no catch around `admit` / `hasWorkspace`; called as
  `void startup.signIn(...)` (`startup/component/root.svelte:338`). `refuse_newer` or an
  offline lease leaves the wall with no error while the shell holds the session.
  `standingChanged` (`machine.ts:429`) sets `loading` first and hangs there on the same throw.
  `start()` does it right with `machine.fail(e)`.
- **R11. The workspace name is cleared after a failed create.**
  `organization/workspace/component/dialog.svelte:44-57`,
  `startup/component/no-workspace.svelte:39-49` call `superForm` without `resetForm: false`
  (superforms 2.30.2 defaults to reset). Every other form spreads `surfaceForm`
  (`lib/form/form.ts`).
- **R12. Undo and redo keys fire behind open dialogs.** `undo/key.ts:39-64` guards only the
  event target; `create/component/shortcut.svelte:18-22` has `isCovered()`. Ctrl+Z with focus on
  a button inside an edit sheet undoes underneath it, and saving writes the stale values back.
- **R13. Update download state dies with the settings tab.** `settings/component/updates.svelte`
  `onDestroy` (:120-124) closes `availableUpdate` mid-download; `settings/component/area.svelte:127`
  renders the card only on the general tab. The restart button (:331) is not disabled while
  `restartAppMutation` is pending.
- **R14. Shortcuts match on the physical key first.** `packages/design/src/lib/shortcut.ts:41-43`
  `event.key === c || event.code === Key{C}`: on QWERTZ Ctrl+Y reports `code: KeyZ` and undoes;
  on AZERTY Ctrl+W undoes.

## Rust shell

- **R15. Replica push and pull have no timeout and hold the database lock.**
  `organization/workspace/open.rs:103-177` pulls under `db.write()`;
  `organization/session/command.rs:741-744,778-779` replicate under `db.read()`;
  `sync/command.rs:31` pushes on close. The engine (`turso-0.8.0-pre.7/src/sync.rs:696-705`)
  builds a hyper client with no timeouts and nothing in the crate wraps the call. A silent
  network stalls launch on the loading screen, or stalls a heartbeat holding the read lock so a
  queued writer blocks every later query (tokio RwLock is fair).
- **R16. The OAuth loopback fails on a silent first connection.**
  `turso/oauth/loopback.rs:73-96`: the listener is non-blocking, the accepted stream inherits
  it on Windows, `set_read_timeout` has no effect and one `read` returns `WouldBlock` at once
  (*reproduced*, 15 µs). The consent settles `Failed` and the listener closes after the first
  connection, so a browser preconnect fails the owner's consent. One `read` can also return a
  partial request.
- **R17. A corrupt JSON record stops the app launching.** `persisted.rs:31-35` returns
  `Error::Integrity` on a parse failure and the plugin setups `.expect()` it
  (`settings/plugin.rs:61`, `sync/plugin.rs:43-48`, `update/plugin.rs`). `persisted.rs:95-96`
  renames the staging file without `sync_all`, and `remote-sync.json` is rewritten on every
  replication, so a power loss can leave it empty and the app never starts again.
- **R18. A pending update recovery blocks updates.** `update/mod.rs:155-160` refuses `Busy`
  whenever the record is `Pending`; `startup/mod.rs:31-35,59-65` resolves it only when the
  running version is the recorded previous or target. A failed download cannot be retried until
  restart, and a hand-installed version that is neither leaves it pending for good.
- **R19. A credential-store failure reads as "Turso not connected".**
  `turso/platform/live.rs:504-506` maps every `platform_token` error to `no_authority()`, which
  advises a second consent, which (`platform/mod.rs:206`) retires the first token.
- **R20. The consent callback trusts any local request.** `turso/consent.rs:271-284` handles
  `error=` before checking `state`, and `consent.rs:276` with `loopback.rs:117-121` puts the
  message into the HTML page unescaped.

## Checked and sound

Mutation ordering and invalidation, the undo stack's generation guard, permission bitmask
maths, transfer identity encoding and the payment rules on plan and write, migrations 0000-0005
(additive), month-end schedules and cycle counting, payment allocation, status derivation,
renewal successor dates, receipt reference encoding, backups, credential separation of absent
from failed, platform API timeouts, the corrupt-replica set-aside, print window cleanup, palette
permission filtering, autosync timers, organization dialogs clearing their secrets.

## Noted, not taken

- A transfer round trip drops a payment's method, reference and note: effort 835's plan
  (line 272) records it as "Noted, not changed".
- "Today" is the UTC day, so statuses roll over at 03:00 in Riyadh: by design.
- The CSV reader splits on `lines()`; only payment notes are multi-line and they are not
  exported, so it is not reachable today.
