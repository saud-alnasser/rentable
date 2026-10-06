---
use-when: "building or reviewing a ticket in effort 854 (the app-wide bug fixes and refunds), and the approach is not obvious from the spec"
---

# Architecture

Three independent bodies of work share one branch: the bug fixes in the data, undo, domain and
transfer layers; the bug fixes in the Rust shell and the interface; and refunds. Each fix lands
where its defect lives, as a test that fails first and the smallest change that passes it. Refunds
are the one design, and the one schema change.

**Refunds are a direction on the payment row** (design A, part three), chosen by the human on
2026-10-06 over a separate refund record (B: a second record feature that every figure must sum
beside the first) and negative amounts with no migration (C: defeats the schema gate, so older
builds keep opening the workspace and print a سند قبض for money paid out). Net paid comes almost
free, because every settlement reads payments through `paymentsOf` and `getPaidAmount`.

**Decisions taken in planning**, each recorded where it applies below:

| Question | Decision | By |
| --- | --- | --- |
| Refund storage | direction column, migration 0006 | human |
| Terminated contracts in transfer | honoured on import; a round trip gives back the exported state | human |
| Restoring a refunded contract | goes through; the contract owes what was returned | human |
| Refunds on a terminated contract | edited and deleted in place; received payments stay locked and say why | human, on the orchestrator's recommendation |
| Replica bound | 30 s without progress, 10-minute ceiling (inactivity, not a deadline) | plan |
| Loopback connections | a reader thread per connection | plan |
| Unopenable record (locked, no permission) | never overwritten; a message and exit | plan; spec 17 narrowed |
| Failed new build with the route back showing | still refuses a further update, as today | plan |
| Wrong `state` with no `error` | neutral page, consent stays open | plan |
| Contract fallback reference | end day, then ordinal; Rust upgrade composer mirrors it | plan |
| `renewed` history | on both predecessor and successor | plan |
| Digits folded | Arabic-Indic and `٫`, as search does | plan |
| Bulk undo when the redo deleted nothing | the undo does nothing | plan |
| Undo's deletion of a vanished record | the routers refuse (as `tenant.delete` does), not the inverses | plan |

# Technical Approach

One commit per ticket, in this order. Independent fixes come first so the refund work lands on a
settled base, and the transfer round trip lands last because it pins everything before it.

| # | Ticket | Requirements | Depends on |
| --- | --- | --- | --- |
| 01 | Undo is forgotten when the session or workspace changes | 1 | none |
| 02 | Undo and redo stand down under a cover | 12 | 01 (`undo/component/shortcut.svelte`) |
| 03 | Shortcuts answer the character first | 14 | none |
| 04 | Undo inverses: vanished records refused, bulk redo tracks what it removed, complex undo flags | 8, 9, 24 | 01 |
| 05 | Renewal and unit reassignment record history | 23 | 04 |
| 06 | Rank compares money with the domain's tolerance | 3 | none |
| 07 | Restoring a terminated contract refuses a taken unit | 4 | none |
| 08 | Import identities per column; tenant write refuses named duplicates | 6 | none |
| 09 | Contract import keeps terminated status and refuses double-booking | 5, 30 (status) | 07, 08 |
| 10 | Contract references disambiguated; ambiguous resolution refused; Rust composer mirrors | 7 | 09 |
| 11 | Arabic-Indic digits in phone, id, amount and cost | 21 | none |
| 12 | Record pages follow their address | 2 | none |
| 13 | The way in fails visibly and keeps the workspace name | 10, 11 | none |
| 14 | The update download outlives the tab | 13 | none |
| 15 | Replica sync is bounded and lets go of the lock | 15 | none. Measure first; return to plan if a query stalls behind a stalled sync |
| 16 | The consent callback keeps listening, checks state first and escapes | 16, 20 | none |
| 17 | Persisted records are durable and recover | 17 | none |
| 18 | A pending update record no longer blocks updates | 18 | 17 (`Update::new`) |
| 19 | A failing credential store says so | 19 | none |
| 20 | Payments carry a direction (migration 0006, Rust seed at six) | 25 | 11 (`payment/component/form.svelte` order) |
| 21 | What a contract counts as paid is net of refunds | 27 | 20 |
| 22 | Refunds are recorded within their limit | 25, 26 | 21 |
| 23 | The landing page shows money returned | 28 | 20 |
| 24 | Refunds in the ledger, form, acts, page and history; locked rows explain | 25, 26 | 22 |
| 25 | A refund prints a payment voucher | 29 | 22, 24 |
| 26 | Export then import gives back the same state | 30 | 09, 10, 22 |

The contract context (`.aep/contexts/desktop/contract.md`) changes with tickets 07 (restore and
overlap), 09 (transfer keeps terminated) and 21 (paid is net; Refund, Voucher). Each ticket's
changeset rides with it.

# Migration

Migration 0006 adds `payment.direction text DEFAULT 'received' NOT NULL`; the workspace version goes
from 6 to 7. Every existing row reads `received`, so no figure moves. The Rust lease seeds gain
`SEEDED_AT_SIX` (`rules/migrations`, *Every shipped version is seeded*). Older builds refuse the
workspace at their next open; one already open across the migration reads refunds as received until
it closes (Technical risks, part three). Files exported before this effort import with every
payment received and with terminated statuses honoured. Persisted records gain a `.bak` on the
first launch of this build.

# Operational Considerations

- The live migration test (`migration_live_every_shipped_migration_commits_in_one_transaction`)
  runs against Turso before merge.
- The release note says an older build left open while another machine updates may show refunds as
  payments until it is restarted.
- Human checks at the close: a refund and its voucher printed in Arabic and English, the returned
  figure on the landing page, Ctrl+Z after a workspace switch doing nothing, and an owner's Turso
  consent on Windows.

# Testing Strategy

Every requirement's test is named in its part below, and each ticket writes it failing first
(`rules/testing`). Criterion 30's round-trip test is ticket 26 and is the effort's widest pin.

# Part one: data, undo, domain and transfer

Requirements 1, 3, 4, 5, 6, 7, 8, 9, 21, 23, 24. Paths are under `apps/desktop/src/lib/` unless
stated. Read at the `_run` worktree (c9d9c4ba plus nothing).

Correction to the evidence: R1 cites `undo/move.ts:797`; the file is 197 lines. The admission is
`undo/undo.ts:56-58` and `undo/move.ts:75-77` ("Nothing in the application clears the stack yet").

---

### R1. Undo stack cleared on leaving a workspace or session

**Approach.** Startup reaches the world through `StartupPorts` (`startup/ports.ts:12`), so the clear
goes in as a port, not as an import of `$lib/undo` into `machine.ts`/`wall.ts`.

- `undo/undo.ts`: add `export function forgetEveryChange() { inverseStack.clear(); }` and export it
  from `undo/index.ts` (the index is "the only way in", `undo/index.ts:4-6`). `clear()` already bumps
  the generation (`undo.ts:134-139`), so an inverse in flight cannot land, and `move.ts:78-82`
  already withdraws the outstanding offer when both stacks are empty. Nothing new is needed for the
  toast.
- `startup/ports.ts`: add `undo: { forget(): void }`; wire it in `startup/browser.ts` (beside
  `cache`, ~line 84) to `forgetEveryChange`.
- Call it at each change of session or workspace:
  - `switch.ts:56`, right after `machine.set({ state: 'loading', ... switching })` and before
    `openWorkspace` (line 68). Before the open, not after: a failed open may or may not have moved
    the shell, and the inverses are wrong for either outcome the user asked to leave.
  - `machine.ts:104` `raiseSignInWall`, beside `this.ports.cache.clear()`. This covers
    `admit()` raising the wall, `standingChanged` after `signedOutElsewhere` (`machine.ts:238`), and
    `linkRefused` ending a session (`wall.ts:254-258`).
  - `wall.ts:91` `signOut`, beside `forgetContext()` (the wall goes up by `machine.set` at :92
    without `raiseSignInWall`, so it needs its own call).
  - `wall.ts:157` `select` and `wall.ts:203` `remove`, after the busy guard, unconditionally (the
    spec says selecting or removing empties both stacks).
- Update the two comments that say nothing clears it (`undo.ts:56-58`, `move.ts:75-77`).

**Tests (node:test).** `startup/tests/harness.ts`: add `undoForgotten` to the journal and an
`overrides.forgetUndo` hook, mirroring `forgetContext` (`harness.ts:144,345`). In
`startup/tests/wall.test.ts` (sign out, select, remove, wall raised) and `running.test.ts` (switch),
wire the override to the real `inverseStack`. Record an inverse first, then assert
`undoable === null && redoable === null` after each act. Offer withdrawal on clear: pin it in
`undo/tests/move.test.ts`, which already clears in `beforeEach` (:97-99). Assert that
`notify.dismiss` is called for an outstanding offer when `forgetEveryChange()` runs.

---

### R3. Rank compares money with tolerance

**Approach.** `contract/rank/rank.ts:184` becomes
`if (!hasSatisfiedContractPaymentRequirement(paidAmount, getExpectedAmountBy(contract, now)))`,
reusing the domain's one tolerant comparison (`contract/contract.ts:81-83`, `EPSILON` at :72). The
reminder refusal (`schedule/router.ts:34-37`) and the client's reminder offer both read
`getContractRank`, so they follow without change.

The SQL bound `paid_amount < expected_amount` (`directory/router.ts:147-149`) stays. It is a
necessary condition that narrows to a superset (`rank.ts` *ContractRankBounds*), and the directory
then applies `getContractRank` to every row (`directory/router.ts` ~:364-382). A contract with
1.45e-11 of float dust passes the bound and is dropped by the rank. Leave a comment there saying so,
so nobody "fixes" the bound into an epsilon in SQL.

**Tests.** `contract/rank/tests/rank.test.ts` (unit): a 12-month contract at 4166.67 with paid
`Array(12).fill(4166.67).reduce(+)` is neither `owing` nor `overdue`, both inside the term and past
its end. `contract/directory/tests/router.test.ts` (router): the same contract seeded with twelve
payments is absent from `rank: 'owing'` and `rank: 'overdue'`. Add one assertion that
`contract.reminder` refuses it, which today's code reaches the other way round.

---

### R4. Restoring a terminated contract refuses an overlap

**Approach.**
- Single: in `contract/router.ts:331` after `ensureContractUnterminable`, read the contract's units
  (`contractUnit` by `contractId`) and `selectAssignmentsForUnits(ctx.db, unitIds)`
  (`contract/row.ts:17`), then `getConflictingAssignedUnitIds(assignments, existingContract, id)`
  (`assignment/assignment.ts:61`). That function already excludes the contract itself and every
  terminated holder. If any unit conflicts, refuse with a new **`contract.unitsTakenNamed`**
  `{ named }`, where `named` is the units as `toUnitReference(complex, unit)` joined by
  `UNIT_LIST_SEPARATOR` (read with a join on `unit` and `complex`). Add a helper in
  `assignment/assignment.ts`, `ensureUnitsFreeToRestore(assignments, contract, id, nameOf)`, so the
  rule stays single-homed (`rules/api-layer`, *Where things live*).
- Selection: `whatRefusesContractAction` (`contract.ts:391-410`) gains a reason **`units-taken`**
  for `restore`. `planContractSelection` (`selection/router.ts:56`) reads assignments for `restore`
  as well as `delete` (today :67-71), and also reads the other holders of those units. A contract
  whose units conflict with a live holder is refused. So is one that conflicts with a contract
  restored earlier in the same walk: two terminated contracts on one unit with overlapping terms,
  selected together. Track the units claimed so far in a set, in the walk at :88-108.
  `ContractRefusalReason` (`contract.ts:381`) widens. `selection-actions.svelte:99,136-141` gains
  `'units-taken'` in `REFUSAL_ORDER.restore` and a sentence `contracts.selection.refusedUnitsTaken({count})`.
  The `satisfies Record<ContractRefusalReason, …>` makes a missing sentence a build failure.
- The undo of a terminate (`contract/query.ts:345` → `unterminate`) and of `terminateMany`
  (→ `unterminateMany`) inherit the refusal, as the spec's assumption asks. `restoreMany` is not
  touched.
- i18n: `contract/i18n/en.ts` and `ar.ts` `refusals.contract.unitsTakenNamed`, e.g. "{named} is held
  by another contract over these dates. free it before restoring this one."; add the code to
  `contract/refusal.ts`, mapped to no field. Regenerate the i18n types.

**Tests.** `contract/tests/router.test.ts`: A terminated, B takes A's unit, `unterminate(A)` rejects
`contract.unitsTakenNamed` naming the unit, and A stays terminated. `contract/selection/tests/router.test.ts`:
`planMany({action:'restore'})` and `unterminateMany` refuse A with `units-taken` and restore the
rest. Two overlapping terminated contracts selected together restore one and refuse the other. A
pin that `restoreMany` still brings A back holding the taken unit already exists in this file;
extend it if it does not cover this exact shape. `api/tests/undo.test.ts`: undoing a terminate after
the unit was taken is refused, and the entry stays on the stack.

---

### R5. Contract import never double-books a unit

**Plan side.** The planning pass is client-side and only sees `held` names (`transfer/transfer.ts:283-391`),
so the workspace's existing holds have to reach it. Two parts:

1. *Row names a unit twice*: no workspace data is needed. The contract sheet's `validate`
   (`contract/transfer.ts:175-209`) returns `row.units` when `namedUnits(row)` has a repeat
   (compared by `toTransferKey(...toUnitParts(u))`). The plan rejects it as `invalid`, naming the row.
2. *Two rows overlapping* and *a row on a held unit*: add an optional sheet member to `Sheet` and
   `AnySheet` (`transfer/sheet.ts:79,175`):
   ```ts
   claims?: {
     held(db: Database): Promise<Claim[]>;      // live contracts' holds, read by transfer.held
     of(record: TRecord): Claim[];               // what a planned record would hold
     clash(a: Claim, b: Claim): boolean;          // the concept's own rule (rangesOverlap)
   };
   type Claim = { key: string; label: string; start: number; end: number };
   ```
   `transfer.held` (`transfer/router.ts:102-112`) returns `claims` beside the names, under a new
   optional `WorkspaceHeld` member. It is empty where the member may not view the kind, as names
   already are. `planWorkspaceImport`, after a sheet's rows resolve (:357-374), checks each created
   record's claims against held claims and against earlier rows. A clash with a held claim rejects
   the row with a new `ImportRejection.reason` **`'claim-taken'`** and `detail` = the unit
   reference. A clash between two rows of the file is an `ImportCollision` `{ rows, identity: unit }`,
   which refuses the file whole. That is the module's own rule for rows that contradict each other
   (`import.ts:14-18`). The contract sheet supplies `claims` from `contractUnit ⋈ contract` where
   status ≠ terminated, and `clash` is `rangesOverlap` (`assignment.ts:40`). Transfer stays
   concept-free.

**Write side.** In `contract/transfer.ts` `write` (:258-306), refuse a contract whose units repeat
with a new **`contract.unitRepeatedNamed`** `{ named }`. After resolving unit ids, read
`selectAssignmentsForUnits(writing.db, allUnitIds)` once and run `getConflictingAssignedUnitIds`
against live holders and against earlier file contracts, accumulated in memory. Refuse with
**`contract.unitsTakenNamed`** `{ named: unitRef }`, the R4 key. The whole batch fails, so no
`contract_unit` row is written. i18n: the transfer's rejection sentence for `claim-taken` goes in
`transfer/i18n`, and `unitRepeatedNamed` in `contract/i18n`.

**Alternative that lost.** Encoding holds as extra values of the contracts' `HeldName` arrays. It
needs no type change but overloads a field documented as "the identity a row repeating one is turned
away under" (`sheet.ts:102-106`), and `transfer.ts:338` keys identities on every held value.

**Tests.** `transfer/tests/transfer.test.ts` (plan): one test each for the three shapes, each
asserting the row named. `transfer/tests/router.test.ts` (write): each shape rejects
`contract.unitRepeatedNamed` or `contract.unitsTakenNamed`, and `select().from(contractUnit)` is
unchanged.

**Decided (human, 2026-10-06): a round trip gives back the exported state.** Import reads the
exported `Status` column and honours `terminated`; terminated rows are left out of claims. Old
files keep importing, since every exported file already carries the column. In a whole-workspace
import the contract is written active, its payments are written, and `terminated` is applied at
the end of the same batch, so the payments of a terminated contract survive the round trip; a
payments-only file naming an already-terminated held contract is still refused
(`payment/transfer.ts:162`). Ticket 09 owns this.

---

### R6. Tenant import: national id and phone each unique

**Approach.** Generalise `ImportField.identity` (`transfer/import.ts:52`) to `boolean | string`.
`true` keeps today's single composite identity, so every other sheet is unchanged. A string names an
identity *group*. Fields sharing a group form one key, and each group is checked on its own.
- `planImport` (:151): compute one key per group,
  `toImportIdentity(group === '' ? values : [group, ...values])`. A row is `duplicate-of-existing`
  if *any* group's key is held (`detail` = that group's value), and `seen` becomes per-group.
  Collisions are reported per group, with the colliding value as `identity`. `isIdentified` and
  `isUnreadable` read "has any identity".
- Export a helper `toHeldIdentities(fields, values: string[]): string[]` from `import.ts`. It aligns
  a held name's values with the identity fields in declaration order and builds the same per-group
  keys. `transfer.ts:338` uses it instead of `key(...namesOf(name))`. A sheet with one group gets
  exactly today's key.
- `tenant/transfer.ts:58-64`: `identity: 'nationalId'` and `identity: 'phone'`. `held` already
  returns `[nationalId, phone]` (:49-55).
- Write guard (`tenant/transfer.ts:93-106`): `write` is async and has `writing.db`. Repeat what
  `tenant.createMany` does (`tenant/router.ts:325-349`): check repeats inside the set
  (`tenant.repeatedInSet`), then `ensureIdentityAvailable` and `ensurePhoneAvailable` with the
  *Named* refusals (`tenant/tenant.ts:76,89`). Factor the three checks out of `createMany` into one
  `ensureTenantsAvailable(db, tenants)` in `tenant/tenant.ts`, or beside the router, so the two
  callers cannot drift. That is a factoring call, not a decision. No new refusal keys.

**Tests.** `transfer/tests/import.test.ts`: two groups, a held id with a new phone, a held phone
with a new id, two rows sharing a phone, two rows sharing an id. Pin that a single `true` group
behaves as before. `transfer/tests/transfer.test.ts`: tenants plan with `held.tenants`.
`transfer/tests/router.test.ts`: write a held national id with a new phone and get
`tenant.nationalIdTakenNamed`, never `UNIQUE constraint failed`.

---

### R7. Ambiguous contract fallback reference

**Constraint.** A reference that resolved uniquely before resolves the same way. So the bare
`nationalId @ day` (`transfer/reference.ts:55-65`) stays the reference of every numberless contract
whose tenant and day are unique, which is every contract any file could have referenced
successfully.

**Approach: disambiguate a set, only where needed.** New in `transfer/reference.ts`:

```ts
export function toContractReferences(
  contracts: readonly { id: string; govId?: string | null; tenant: string; start: number | Date; end: number | Date }[]
): Map<string, string>
```

- Group numberless contracts by `toTransferKey(base)`. A group of one keeps `base`.
- A larger group appends the end day, `base..YYYY-MM-DD`. Anyone who missed the old shape still
  reads the tenant, start and end.
- If any members of the group still share the end day, those members also get ` #n`, numbered
  by `id`. Ids are time-ordered (`platform/database/identity.ts:32-45`), so numbering by id is
  creation order and holds across export and re-import: the import writes rows in file order and
  mints ascending ids.
- `FALLBACK_REFERENCE` (:25) must accept all three shapes,
  `/^\S+ @ \d{4}-\d{2}-\d{2}(\.\.\d{4}-\d{2}-\d{2})?( #\d+)?$/`. Otherwise `toGovIdFromReference`
  (`contract/transfer.ts:275`) stores an extended reference as a government number. This is the
  sharpest edge in the requirement, so give it its own test.

**Every place that composes a contract reference** switches to the set function over *all*
contracts: `contract/transfer.ts` `read` (:143-144, which must select `id` and `end`), `held` and
`answers.ids` through `withTenants` (:69-80, which gains `end`), and `payment/transfer.ts`
`referencesOf` (:32-44). A function over the whole set returning a map is why `held` and `ids` must
not filter first.

**Resolution never picks silently.** `transfer/router.ts:150-153` builds `answering` with
`Map.set`, so the last one wins. Record a key that arrives twice with different ids in an
`ambiguous` set, and have `resolve` (:158-172) refuse it with a new
**`workspace.ambiguousReference`** `{ name }`. With the set function this only triggers on data no
current spelling produces. It is the defect itself, though, and it costs four lines.

**How it reads end to end.** Exporting a workspace with two numberless same-day contracts writes
two distinct references, and each payment row carries its contract's. Importing into an empty
workspace: no collision in the plan, `writing.name` maps each to its new id, each payment lands on
its own. An *old* file that holds two such rows still collides in the plan and is refused whole, as
today. A payments-only file naming a bare reference that two held contracts now answer to as
`..end` fails to resolve. It is dropped and named as unresolved in the plan, and refused at the
write. It is never resolved silently.

| | A: end day, then ordinal (recommended) | B: ordinal only (`base #n`) |
|---|---|---|
| Advantages | Readable: what a person would say next. Stable across workspaces when ends differ, which is the common case. | One rule and one regex arm. Always disambiguates. |
| Disadvantages | Two tiers to test. | `#2` means nothing to a reader, and it depends on id order even when the end days differ. |
| Risks | A `..` inside a national id is impossible; ids are digits. | Deleting one contract silently renumbers the other between two exports. |
| Maintenance | Rust `upgrade/record.rs:227-234` would need to mirror two tiers. | Mirror one tier. |

A third option, appending units, lost. Unit references contain ` / ` and `; ` (`reference.ts:19-21`),
two contracts can hold none, and the reference would change whenever units change.

**Tests.** `transfer/tests/transfer.test.ts` (pure): `toContractReferences` gives the bare form for
unique pairs, `..end` for differing ends, ` #n` for identical terms, and `toGovIdFromReference` is
undefined for all three. `transfer/tests/router.test.ts`: seed two numberless same-day contracts
for one tenant, each with a payment, `transfer.get`, then `importWhole` into a fresh `createApi()`.
Both contracts arrive, and each payment sums onto its own (`paidAmount`). An ambiguous key is
refused `workspace.ambiguousReference`. The existing `export.json` and `workbook.json` fixtures still
import, which pins old files.

**Decided:** A, the end day then an ordinal. The Rust upgrade composer
(`tauri/src/upgrade/record.rs:227-234,359-366`) mirrors the rule in the same ticket, so a legacy
workspace holding such a pair upgrades into a workbook that imports.

---

### R8. Undo of a create fails visibly when the record is gone

**Approach.** Make the four deletions refuse a missing row, as `tenant.delete` does
(`tenant/router.ts:250`, `ensureTenantStillExists` at `tenant/tenant.ts:103`):
- `complex/unit/router.ts:359-361`: `return ensureUnitStillExists(deleted)` (`complex/complex.ts:145`).
- `complex/router.ts:304-327`: read the row first, or check `deleted`. Throw `complex.gone`
  (`ensureComplexStillExists`, `complex.ts:136`). The early `refuseMissing` flag check for units
  stays first.
- `contract/router.ts:363-365`: `throw refuse('contract.missing')`.
- `payment/router.ts:422-424`: `throw refuse('payment.missing')`.

Renewal's undo is `contract.delete` (`renewal/query.ts:20`), so it is covered. `#apply` leaves a
throwing inverse on its stack (`undo.ts:157-162`), and `applyInverse` records history only on
success (`move.ts:163-168`). So the refusal moves nothing, writes no entry, and redo cannot reach
it. No refusal keys are added; all four exist.

| | Routers refuse a missing row (recommended) | Inverses check `undefined` client-side |
|---|---|---|
| Advantages | One place per concept. Matches tenant and `rules/data` *Undo*. Also fixes the redo of a deletion and a direct delete of a vanished record, which today toasts "deleted". | No procedure contract changes. |
| Disadvantages | Changes four procedures' answers; any test pinning `undefined` changes. | Five inverses, each remembering. The success toast on a direct delete stays wrong. |
| Risks | A caller relying on the silent `undefined`: only the `result &&` guards in the `useDelete*` inverses, which stay harmless. | The next inverse forgets the check. |
| Maintenance | None. | Per declaration. |

**Tests.** `api/tests/undo.test.ts`: for unit, contract, renewal, payment and complex, run the
create, delete the record through `caller` directly, `applyUndo`, and assert it rejects with the
code. `inverseStack.undoable` is still the entry and `redoable` is null, so redo cannot recreate
the record. `caller.history.getMany` has no new entry. Each router test adds "deleting a missing
record is refused" (`complex/tests/router.test.ts`, `contract/tests/router.test.ts`,
`payment/tests/router.test.ts`, and the unit test in `complex/tests/router.test.ts` or wherever unit
deletions are tested now).

---

### R9. Bulk-delete redo tracks what it deleted

**Approach.** Apply `complex/query.ts:278-288`'s pattern to `tenant/query.ts:234-248`,
`complex/unit/query.ts:157-168`, `payment/query.ts:265-275` and `contract/selection/query.ts:134-145`:
`let removed = result.deleted`; `undo` restores `removed`; `redo` sets
`removed = (await …deleteMany(...)).deleted`; `records` and `describe` read `removed`, not
`result.deleted`. Complex's own `records` (:289-292) has the same gap, so fix it too.

Edge: a redo that deleted nothing leaves `removed` empty, and `createMany` requires `.min(1)`
(`tenant/router.ts:318`). Let `undo` resolve without a call when `removed` is empty. A shared helper
(`rememberingDeletion`) is optional; that is a factoring call.

**Tests.** `api/tests/undo.test.ts`: bulk-delete two tenants, undo, give one a contract, redo (one
is refused), undo. Only the one comes back, there is no `idTaken`, and the history entries name one.
Repeat for units, payments and contracts. A payment is refused by terminating its contract; a
contract by giving it a payment.

---

### R23. Renewal and unit reassignment write history

**Approach.**
- `useSetContractUnits` (`contract/query.ts:463-486`): capture both the units and the contract,
  `capture: async (v) => ({ units: await api.contract.units.getMany(...), contract: await api.contract.get({ id: v.contractId }) })`,
  and adjust the inverse (:472-476). Add `records` to the declaration and to the inverse
  (`action: 'assigned'`, `recordId: contractId`, `record: toContractName(captured.contract)`).
- `useRenewContract` (`renewal/query.ts:13-30`): `records` writes `renewed` on the predecessor
  (`variables.contractId`, name captured with `api.contract.get`) and on the successor (`result`).
  The inverse's `records` mirrors it: undo writes `deleted` on the successor. `flagOfEntry`
  (`history/history.ts:64-68`) asks `editContract` for `renewed` and `assigned`, which both
  procedures already require (`renewal/router.ts:53`, `assignment/router.ts:239`), and
  `deleteContract` for the undo's `deleted`, which the inverse already asks.

**Decided:** both, `renewed` on the predecessor and on the successor.

**Tests.** `api/tests/undo.test.ts`, or a new `contract/tests/history.test.ts` modelled on
`payment/tests/history.test.ts`: renew, then `caller.history.getMany` holds `renewed`. Set units
and find `assigned`.

---

### R24. Complex create undo asks for `deleteUnit` only with units

**Approach.** `complex/query.ts:181-184`:
`undo: result.units.length === 0 ? ['deleteComplex'] : ['deleteUnit', 'deleteComplex']`, mirroring
`redo`. If another device has added units since, `complex.delete` refuses with `FORBIDDEN` naming
`deleteUnit` (`complex/router.ts:308`). That failure is visible, which is correct.

**Test.** `api/tests/undo.test.ts`: with a caller and `memberPermissions` lacking `deleteUnit`,
create a complex with no units, and `inverseStack.refusal('undo', LL)` is `undefined`, so the undo
succeeds. With units it is refused, which pins the other half.

---

### R21. Arabic-Indic digits in phone, national id, amount and cost

**Where the one fold lives.** `platform/locale.ts` is where "figures use Western digits" is decided
(`rules/frontend` *i18n*, `getIntlLocale`). It imports nothing at runtime, so node tests load it.
Move `ARABIC_INDIC_DIGITS` there from `platform/database/search.ts:36-38`, export
`toWesternDigits(value: string): string`, and have `search.ts` import the table. That keeps one
table, as search's own header demands (:13-15).

**Fold on read; do not rewrite the field.**
- Tenant form (`tenant/component/form.svelte:35`): `normalizePhoneNumberInput = (v) => toWesternDigits(v).replace(/[^0-9]/g, '')`.
  National id: the form-local schema field validates `toWesternDigits(v)` against `identityField`
  (`z.string().trim().refine((v) => identityField(msg).safeParse(toWesternDigits(v)).success, msg)`),
  and the payload (:118-122) sends `toWesternDigits(form.data.nationalId).trim()`.
- Payment form (`payment/component/form.svelte:47-51,123,238`): fold inside the refines, at the
  submit (`Number(toWesternDigits(form.data.amount))`) and in `enteredAmount`.
- Contract form (`contract/form.ts:30-38,134`): fold in the cost refines and at `cost: Number(...)`.
  Fold `cycles` (:39-44) too, since it is the same field shape.
- Router schemas are unchanged: `TenantSchema` still refuses non-ASCII, which keeps
  `ASCII_ONLY_COLUMNS` true (`tenant/tenant.ts:56-58`).

| | Fold on read (recommended) | Fold as typed (rewrite the input) |
|---|---|---|
| Advantages | No schema transforms, so superforms' `defaults(zod4(...))` introspection is untouched. No caret handling. | The field shows Western digits, as figures render. |
| Disadvantages | The field shows what was typed until saved. | Setting the bound value moves the caret to the end in WebView2, so selection must be restored. |
| Risks | A new reader of the value forgets the fold; three sites. | Fights superforms' tainted/bind flow. |
| Maintenance | One function, called at each parse. | A shared input handler on four fields. |

**Tests.** `platform/tests/locale.test.ts`: `toWesternDigits('٥٠١٢٣٤٥٦٧') === '501234567'`, plus
a test that `SEARCH_FOLDINGS` still contains the digit table. `tenant/tests/form.svelte.test.ts`:
type and paste `٥٥١٢٣٤٥٦٧` into phone and `١٢٣٤٥٦٧٨٩٠` into national id; the create receives
`+966551234567` and `1234567890`. `payment/tests/form.svelte.test.ts`: amount `١٥٠٠` submits 1500.
`contract/tests/form.test.ts` (new, node:test, since `contract/form.ts` is pure): cost `٤١٦٦٫٦٧`,
if the decimal separator is folded (see the question), or `٤١٦٦` parses.

**Decided:** match search exactly: Arabic-Indic digits and `٫` as the decimal point; Persian
digits and group separators are not folded.

# Part two: Rust shell and interface

Read at the `_run` worktree (c9d9c4ba + nothing). Paths are under `apps/desktop/tauri/src/` (Rust),
`apps/desktop/src/` (app) or `packages/design/src/` (design) unless written in full.

### Rust shell

#### 15. Replica network calls are bounded

**What happens today.** Every replica sync call reaches `turso::sync::Database::{push,pull}`
(turso 0.8.1 per `Cargo.lock`, not pre.7 as the evidence says). The engine runs each HTTP request
on one IO-worker thread, one at a time, through a hyper client with no timeouts
(`turso-0.8.1/src/sync.rs` `IoWorker::run_loop`, `process_http`). The callers:

- `database/mod.rs:60-90` `replicate_engine`, `:331` `push_replica`, `:345` `pull_replica`,
  `:378` `replicate`.
- `organization/store/mod.rs:283-322` `push`/`pushed`/`pull`/`pulled`. The organization replica is
  a replica too, and the heartbeat pulls and pushes it under `member.write()`
  (`organization/session/heartbeat.rs:44-64`).
- The lock holders: `organization/workspace/open.rs:103-177` pulls under `db.write()`.
  `organization/session/command.rs:741-744,778-779` replicates under `db.read()`.
  `sync/command.rs:31` pushes under `db.read()`. `startup/mod.rs:27,57` holds `update.write()`
  across `open_database`.

**Offline already has a shape, and the timeout reuses it.** `Pulled { completed: false, brought:
false }` (`database/mod.rs:49-55`), `push_replica` → `false`, and `Replicated { completed: false,
refusal: None }`. The store answers `false` from `push`/`pull`, and `Err(turso::Error)` from
`pulled`/`pushed`. `forget.rs:292-295` only treats `database_is_gone` errors as a deletion, so a
timeout error cannot be read as one. A bounded call that runs out answers exactly these values, so
no caller changes what it does.

**The approach.**

1. Add `database/bound.rs` with `pub(crate) const SYNC_BOUND: Duration = 30 s` and
   `pub(crate) async fn bounded<T>(bound: Duration, call: impl Future<Output = Result<T,
   turso::Error>>) -> Result<T, turso::Error>`. When the call runs out, it answers
   `turso::Error::Error("the remote did not answer within …")` and logs `replica.sync.timedOut`.
2. Wrap all five engine calls in it: `replicate_engine` (each half separately),
   `push_replica`, `pull_replica`, and the store's `pushed` and `pulled`. `replicate_engine` gains
   a `bound: Duration` argument. `Database` and `OrganizationStore` hold a `bound` field set to
   `SYNC_BOUND`, with a `#[cfg(test)] fn with_bound(…)`.
3. Let go of the write lock before the pull. In `open.rs`, take
   `let db = tokio::sync::RwLockWriteGuard::downgrade(db);` after the replica is tracked
   (`:162`) and before `pull_replica` (`:177`). Queries then run beside the first pull. The
   heartbeat already uses read locks, so with the bound a queued writer waits at most one bound.

**The bound: two approaches.**

| | A. Deadline on the whole call (`tokio::time::timeout`) | B. Inactivity bound: no IO progress for 30 s |
|---|---|---|
| Advantages | Standard and about 5 lines. The number is easy to reason about | Matches the requirement's "does not answer". A large first pull on a slow but working link is never cut. That is the spec's named risk |
| Disadvantages | A first pull of a big workspace can run past any fixed number. It then reads as "has not reached this machine yet" for good | About 40 lines: a waker that counts wakes from the engine's IO worker and resets a `Sleep`. A link that trickles bytes forever needs a ceiling as well |
| Risks | A bound set long enough for that first pull (minutes) makes a stall last minutes | Assumes the worker wakes the waiting future on each chunk. `process_http` does call `notify_progress` per frame, and the test checks it |
| Maintenance | None | One small module with its own tests |

**Decided: B**, 30 s without progress, the same number the platform API uses
(`turso/platform/live.rs:28`), plus a 10-minute ceiling.

**Cancellation.** When the bound runs out, the engine's operation future is dropped. The
`IoWorker` thread keeps the request it is awaiting until the socket dies, so later sync calls on
that engine also run out and read as offline. That is what the requirement asks for.

**The open measurement.** Every query opens a connection through `database.connect()`
(`database/mod.rs:628-638`), which is an engine operation driven through the same IO worker
(`sync.rs:489`). If `connect` ever needs the worker to make progress, a stalled request would stall
local queries no matter what lock we hold. Step-level IO passes its own waker (`lib.rs:420-440`),
so it probably does not. Criterion 15 measures this. **If the "another query runs" assertion fails,
stop and return to plan.** The fallback is to hold one long-lived connection per engine rather
than one per query.

**Tests (Rust, `--test-threads=1`).** Add a shared helper `sync/test/server.rs::SilentServer`:
a `std::net::TcpListener` that is bound and never accepted. The kernel completes the handshake and
nothing ever answers. Then:

- `database/mod.rs`: a replica pointed at the silent server with `bound = 300 ms`. `replicate`,
  `push_replica` and `pull_replica` each return offline within 2 s. While `replicate` waits under
  `db.read()`, `execute_single_sql("select 1")` on the same `Database` completes.
- `organization/store/mod.rs`: `pull` and `push` against the silent server return `false` within
  the bound.
- `organization/workspace/open.rs`: `open_database` with the silent remote returns within the
  bound, and a query issued during it runs.
- `database/bound.rs`: B's reset (a future that makes progress every 200 ms under a 300 ms bound
  completes) and the ceiling.

#### 16 + 20. The consent callback

**What happens today** (`turso/oauth/loopback.rs:69-102`). The listener is non-blocking, and on
Windows the accepted stream inherits that, so `set_read_timeout` does nothing and the single
`read` (`:92`) returns `WouldBlock` at once. Only one connection is ever accepted. The thread then
ends, and `consent.rs:421-434` settles the consent `Failed`. In `read_callback`
(`consent.rs:271-302`), `error` is read before `state`. `respond` (`loopback.rs:118-121`)
interpolates the message unescaped, and that message carries Turso's `error`
(`consent.rs:780-782`).

**The approach.**

- `LoopbackCallback::accept` keeps accepting until a request that belongs to the consent arrives,
  the caller abandons, or patience runs out.
- Each accepted stream gets `set_nonblocking(false)` and the read and write timeouts. It is read on
  a short-lived thread of its own by `read_head(stream) -> io::Result<String>`, which loops on
  `read` until `\r\n\r\n`, EOF, the 16 KiB limit or the timeout.
- Each reader sends `(LoopbackRequest | error)` over a `std::sync::mpsc` channel. The accept loop
  polls the listener and `try_recv` on that channel at the existing 200 ms interval.
- A connection that errors, times out or does not parse is dropped and logged. **It never settles
  the consent.**
- `accept` takes a judge, `FnMut(&HashMap<String, String>) -> Judged { Ours | Stranger }`. A
  `Stranger` request is answered with a neutral page ("This window is not part of a connection
  Rentable is waiting for…") and the loop goes on.
- `read_callback` checks `state` first. A mismatch is a new outcome,
  `ConsentOutcome::Stranger`, which `settle` never applies. `error` and `code` are read only after
  the state matches.
- `LoopbackRequest::respond` HTML-escapes `message` through a private `escape_html` (`& < > " '`),
  so every page is escaped and not only the failure page.

**Two approaches for the connections.**

| | A. Accept and read one at a time, with a short read timeout per connection | B. A reader thread per connection, with a channel back to the accept loop |
|---|---|---|
| Advantages | No threads or channel | A silent preconnect never delays the real request. It matches "keep accepting" literally |
| Disadvantages | The real callback waits in the backlog behind a silent socket for the whole timeout. A browser often sends the real request on the preconnected socket, so a short timeout closes the very socket the callback was coming on | One thread per connection, and only a handful ever arrive |
| Risks | Choosing the timeout is a guess against browser behaviour | Reader threads outlive the consent until their timeout. They only drop a socket |
| Maintenance | Low | Low to moderate |

**Decided: B.**

**Tests (Rust, `turso/consent.rs`, reusing `arrive_at_the_callback` and the scripted token
server).**

- A raw `TcpStream` connects and sends nothing. A second one writes `GET /callback?code=…&state=…
  HTTP/1.1\r\n` and then, after a pause, `Host: …\r\n\r\n`. The consent settles `Granted` and is
  never `Failed`.
- `error=server_error` with a wrong `state` leaves the session `Pending`. A later right callback
  still settles it.
- `error=<script>x</script>` with the right state produces a page containing
  `&lt;script&gt;`. A unit test on `escape_html` covers the rest.
- `loopback.rs` gets its own test of `read_head` with a request written in three pieces.

#### 17. Persisted records survive a bad file

**The records.** All three go through `persisted.rs:29-65`:

- `settings.json`: `settings/plugin.rs:60`, `.expect` at `:61` and `:74`.
- `remote-sync.json`: `machine/record.rs:912` from `sync/plugin.rs:39-44` `.expect`.
- The update recovery record: `update/mod.rs:127` from `update/plugin.rs:24-25` `.expect`.

A parse failure is `Error::Integrity` (`persisted.rs:33`). `commit` writes and renames with no
`sync_all` (`:95-96`).

**The approach in `persisted.rs`.**

- **`commit`.** Write the staging file with `File::create`, `write_all` and `sync_all`, then
  rename it over the primary. On Unix, also open the parent directory and `sync_all` it (Windows
  cannot open a directory that way, so skip it there). *Then* write `<name>.json.bak` through the
  same staging, fsync and rename routine. The backup is therefore always the last committed
  content and never the content before it.
- **`Persisted::recover(path, clock: &dyn Clock) -> Result<Self, Error>`**, the production entry:
  1. Run `load` as today.
  2. On `Integrity` (an empty, truncated or zero-filled file all fail to parse), rename the
     primary to `<name>.corrupt-<ms>` (the replicas' convention, `database/corrupt.rs:344-348`) and
     log `persisted.corrupt.setAside` naming both files.
  3. Parse `.bak`. If it is good, sanitize it, commit it as the primary and log
     `persisted.recovered`.
  4. Otherwise start from `T::default()`, commit, and log `persisted.reset`.
  5. A primary that loads cleanly with no `.bak` beside it gets one written, so installs in the
     field gain a last good copy on their first launch of this build.
- **`load` stays strict.** It is what `recover` calls and what the existing tests use.
- **The callers.** `RemoteSync::new` calls `recover` with the clock it already holds.
  `Update::new(settings, clock)` gains a clock. The settings setup moves into
  `settings::open(data_dir, db_dir, clock) -> Result<Persisted<Settings>, Error>` so a test can
  reach it. The plugins read `app.state::<clock::Shared>()`, which `lib.rs:51` manages before any
  plugin. **An I/O failure** (locked file, no permission) is never recovered: committing
  defaults over a readable but locked `remote-sync.json` would forget every organization. The
  plugin setup returns the error instead of `.expect`ing it, and `lib.rs` shows a native message
  naming the file and the reason (a blocking message box; the implementer picks the dialog plugin
  or `rfd` by what is available before the plugin is set up) and exits non-zero. Spec requirement
  17 says this.

**The risk that a backup brings back a removed organization.** A copy of the *previous* file
(copy, then replace) would undo exactly the last write, and that write is often a forget
(`organization/session/forget.rs:75`). Writing the backup *after* the fsynced primary means it
lags the primary only while the primary is already durable. So a backup is restored only when the
primary was damaged after both writes landed, and it then holds the removal. Nothing more is needed
for the constraint. A cross-check against the `org-<id>.db` files was rejected: an organization
that is held but has never pulled has no file.

**Tests (Rust).**

- `persisted.rs`: for an empty, a truncated and a zero-filled primary, with and without a good
  `.bak`, the result equals the backup or the default. The bad file sits beside it as
  `data.json.corrupt-<ms>` with its bytes unchanged. A commit leaves `.bak` byte-equal to the
  primary.
- `machine/record.rs`: `RemoteSync::new` over a truncated `remote-sync.json` with a `.bak`
  holding two organizations comes up holding both.
- `update/mod.rs` (zero-filled recovery record) and `settings/mod.rs` (empty `settings.json` via
  `settings::open`).

fsync itself cannot be observed in a test. It is reviewed, not tested.

#### 18. A pending update record no longer blocks updates

`update/mod.rs:156-161` answers `Busy` for any pending record. `startup/mod.rs:31-35` resolves a
record only when `previous == running && target != running`.

**The approach.** Move the launch logic into `Update::settle_at_launch(&mut self, running: &str)
-> Result<(), Error>`, which:

- resolves any pending record whose `target != running`, logging `startup.recovery.notInstalled`
  as today, or a new `startup.recovery.elsewhere` when `previous != running` too;
- leaves `target == running` alone, because `bootstrap` resolves or fails that one after
  `open_database` (`:65-74`).

`prepare` then refuses `Busy` only while the pending record's target is the running version (the
route back is on screen). A record whose target is not the running version is overwritten. That
covers a failed download in the same session. No interface change is needed: `installUpdate`
calls `prepare` on every attempt.

**Tests (Rust, `update/mod.rs`).** Prepare 0.5.1→0.5.2, then prepare 0.5.1→0.5.2 again, succeeds.
`settle_at_launch("0.6.0")` over a pending 0.5.0→0.9.9 record leaves it `Obsolete`. The existing
`prepare_rejects_when_recovery_is_already_pending` is rewritten to seed `target == running`.

#### 19. A failing credential store is not "not connected"

`turso/platform/live.rs:504-506` maps every error from `platform_token` to `no_authority()`.
`platform_token` (`consent.rs:838-845`) already tells the two apart: absent is
`no_platform_authority()` (`TursoNotConnected`), and a failing store is `Error::Credential`
(`credential/mod.rs:65-68`).

**The fix.** `authority` returns `platform_token(credentials, account)` and maps only the
`TursoNotConnected` refusal to `no_authority()` (the platform port's wording). Everything else
passes through unchanged.

**What the interface shows.** The `credential` code's sentence is "the saved credentials could not
be used." (`lib/i18n/en/index.ts:77`), with Rust's message behind the disclosure
(`error/message.ts`). The setup walk no longer sends the owner back to the consent, because
`credential` is not in `BACK_TO_THE_CONSENT` (`organization/setup/setup.ts:235-242`). No string
changes.

**Test (Rust, `live.rs`).** Add `Memory::refuse_the_next_read()` beside `refuse_the_next_store`
(`credential/memory.rs:37`). A Platform API call then answers `Error::Credential`. The existing
`no_authority_is_a_refusal_before_any_request_is_made` (`:1212`) keeps pinning the absent case.

### Interface

#### 2. Record routes follow their address

The search over `src/routes` and `src/lib` finds exactly seven readers of `page.params`. Six read
it once, with `const <x> = page.params.id ?? ''`:

- `tenants/[id]:6`
- `contracts/[id]:6`
- `complexes/[id]:5`
- `complexes/units/[id]:6`
- `contracts/payments/[id]:6`
- `contracts/units/[id]:6` (its `+page.ts` redirects on load, but the component is still mounted)

The seventh, `settings/workspaces/[id]`, already uses `$derived` and `{#key}`. Nothing else reads
a route parameter. The assumption holds.

**The fix.** Each of the six becomes `const id = $derived(page.params.id ?? '')` and wraps its one
child in `{#key id}`, exactly as `routes/settings/workspaces/[id]/+page.svelte` does. Remounting
discards per-record state as well: the open section, sheet state and selections.

**Test (Vitest, `src/routes/tests/record-params.svelte.test.ts`).** `layers.test.ts` already
skips `tests/` under routes.

- Add a scaffold `src/routes/tests/address.svelte.ts` that exports a `$state({ params: { id } })`.
- `vi.mock('$app/state')` returns `page` with getters over that state.
- The fetch hooks of the six concepts are mocked to answer by id, as
  `tenant/tests/permission.svelte.test.ts` mocks `useFetchTenant`.
- Render each route under `#tests/providers.svelte`, see record A, set `params.id = B`,
  `flushSync`, then see B's name and not A's.

#### 10. A failure opening the workspace reaches the error screen

`startup/wall.ts:52-62` has `try/finally` with no catch around `admit` and `hasWorkspace`.
`startup/machine.ts:417-433` (`standingChanged`) has neither, after setting `loading` at `:393`.

**The fix.**

- In `signIn`: `try { … } catch (error) { await machine.fail(error); return; } finally {
  machine.set({ isSigningIn: false }) }`.
- In `standingChanged`, wrap `rememberSession`, `admit` and `hasWorkspace` the same way.
- `start` already does this (`machine.ts:316-319`).

**Tests (node:test, using the startup harness `startup/tests/harness.ts`).**

- `wall.test.ts`: `signIn` with `ports.organization.openWorkspace` throwing ends with `state ===
  'error'` and `isSigningIn === false`.
- `running.test.ts`: the same throw under `standingChanged()` ends in `'error'`, never
  `'loading'`.

#### 11. Workspace create forms keep the typed name

`organization/workspace/component/dialog.svelte:44` and `startup/component/no-workspace.svelte:85`
are the only `superForm` calls that do not spread `surfaceForm` (`lib/form/form.ts`).

**The fix.** Spread `...surfaceForm` first in both, then keep their `id` and `validators`.
`resetForm: false` is the part that matters. The dialog's reset on open (`:62-66`) still empties
a fresh dialog.

**Tests (Vitest).**

- A new `organization/workspace/tests/dialog.svelte.test.ts`.
- `startup/tests/no-workspace.svelte.test.ts`, beside the existing `no-workspace-locked`.

Each renders the surface with an `onCreate` that does nothing (a failed create leaves the surface
open), types a name, submits, and finds the field still holding it.

#### 12. Undo and redo stand down while something covers the page

`undo/key.ts:39-64` guards only the event target. `create/component/shortcut.svelte:18-22` holds
`isCovered`.

**The fix.**

- Move `isCovered(root: ParentNode = document)` to `shortcut/covered.ts` and export it from
  `shortcut/index.ts`. Both `create` and `undo` are capabilities and already import `shortcut`.
- `create/component/shortcut.svelte` imports it from there.
- `toUndoShortcuts` gains a fourth parameter, `isCovered: () => boolean`. Each `run` becomes
  `() => { if (!isCovered()) apply(intent) }`.
- `undo/component/shortcut.svelte` passes the shared function.

The palette stays excluded, because the predicate skips a dialog that holds `[data-slot=command]`.
Running undo by name from the palette therefore still works.

**Tests.**

- node:test, `undo/tests/key.test.ts`: with `isCovered` true, `run` applies nothing.
- Vitest, `undo/tests/covered.svelte.test.ts`: render `#tests/palette-harness.svelte` with an
  open sheet holding a focused button, press Ctrl+Z and Ctrl+Y, and see `apply` not called. With
  only the palette open, it is called.

#### 13. The update download survives leaving the tab

All the state in `settings/component/updates.svelte` (lines ~45-60) is local, and `onDestroy`
(~:120-124) closes `availableUpdate` mid-download. The restart button (~:343) is never disabled.

**The fix.**

- Add a rune module `settings/update-download.svelte.ts`, beside `update-announcement.ts`. The
  module-layout table already places the update's block in `settings`.
- It holds one module-level `UpdateDownload` instance: `release`, `available`, `checking`,
  `installing`, `installed`, `hasChecked`, `downloaded`, `total`, and the methods
  `check(checkFn)` and `install(prepareFn)`. The card passes in its mutations' `mutateAsync`.
  Mutations keep running after their observer unmounts.
- The card reads the instance and drops its `onDestroy` close. An update is closed only when a
  check replaces it, or after install.
- The restart button gets `disabled={restartAppMutation.isPending}`, and `restartApp` returns
  early while pending.

**Test (Vitest, `settings/tests/updates.svelte.test.ts`).** Mock `$lib/update/ui` (as
`app/tests/settings-area.svelte.test.ts:71-75` does) with a `downloadAndInstall` that emits
`Started` and `Progress` and then awaits a deferred promise.

- Check, install, `unmount`, render again, and see the download state and progress.
- Resolve the deferred, see restart, give `useRestartApp` a pending mutation, and see the button
  disabled.

#### 14. Shortcuts match the character first

`packages/design/src/lib/shortcut.ts:41-43` matches `key` *or* `code`.

**The fix.** `matchesShortcutKey`:

- if `event.key.toLowerCase() === character`, it matches. Lowercasing keeps Ctrl+Shift+Z, which
  reports `Z`, working;
- else, if `event.key` is a single printable ASCII character, it does not match. The layout
  produced another Latin character;
- else, it falls back to `event.code === toPhysicalKey(character)`.

The fallback covers Arabic letters, the two-character `لا` on B, `Dead`, `Process` and
`Unidentified`. Named keys (`ArrowUp`, `Enter`) are unchanged, because their `key` equals the
character.

**Every registered shortcut on an Arabic layout:**

| Shortcut | Arabic `key` | Result |
|---|---|---|
| Ctrl+N (`create/key.ts:22`) | ى | falls back to `KeyN` ✓ |
| Ctrl+K (`palette.svelte:10`) | ن | `KeyK` ✓ |
| Ctrl+B (sidebar, `constants.ts:6`) | لا | `KeyB` ✓ |
| Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y (`undo/key.ts:41,54-55`) | ئ / آ / غ | ✓ |
| `/` search (`list/keyboard.ts:172`) | ظ | `Slash` ✓ |
| Arrows and Enter (`list/keyboard.ts:193,201`) | named | ✓ |

On QWERTZ, Ctrl+Y (`code: KeyZ`, `key: y`) now redoes and never undoes. On AZERTY, Ctrl+W
(`key: w`, `code: KeyZ`) does nothing.

**Test (node:test, `packages/design/src/lib/tests/shortcut.test.ts`).** Pins the three cases in
criterion 14, plus Ctrl+Shift+`Z`, every row of the table above, and `ArrowDown`/`Enter`.

# Part three: refunds

Paths are under `apps/desktop/src/lib/` unless they say otherwise.

### Framing

What exists now:

- **One seam carries every contract's settlement.** Reconcile, the unit statuses and
  `contractStatusesAt` read payments only through `contributions.contract.paymentsOf`
  (`contract/reconcile.ts:109,152,173,194,212`, contributed at `payment/feature.ts:18`, defined at
  `payment/payment.ts:37`). Three other places read the rows directly:
  `selectPaymentsForContract` (`contract/row.ts:39`), the receipt (`payment/router.ts:294`) and the
  selection planner (`payment/selection/router.ts:58,165`).
- **Most figures read the materialised `paid_amount`, not the rows.** That covers rank
  (`contract/rank/rank.ts:184,188`), the directory (`contract/directory/router.ts:148,376,394`),
  the dashboard queue (`dashboard/router.ts:135-151`), the form default (`contract/contract.ts:111`)
  and the act gating (`payment/acts.ts:176`). If reconcile writes net paid, all of these follow.
- **Arithmetic over the rows is single-homed in the contract domain**: `getPaidAmount`
  (`contract/contract.ts:32`), `getOutstandingExpectedAmount` (`:133`) and `scheduleContract`
  allocation (`contract/schedule/schedule.ts:118-155`). The receipt's running total is the one
  exception: it sums the rows itself (`payment/receipt.ts:91-93`).
- **Three sums bypass the domain.** The dashboard's `collected` is a SQL `sum`
  (`dashboard/router.ts:213-218`), the directory's `paymentCount` is a SQL `count`
  (`contract/directory/router.ts:78-80`), and the ledger's month totals are summed in
  `payment/ledger.ts:75`.
- **Older builds and the version gate.** Each migration raises the workspace schema version. That
  version is the count of `.sql` files (`packages/workspace-migrations/README.md`, *The version
  number*). An older build refuses at open any workspace recorded above what it ships, and reads
  nothing (`tauri/src/organization/lease/mod.rs:355-372`). Before that check it pulls the
  organization replica (`tauri/src/organization/workspace/command.rs:149-180`). **The one gap is an
  older build that already has the workspace open** when a newer build migrates it. No check runs
  mid-session, and shipped builds cannot be changed after the fact.

### Designs

**A. A `direction` column on `payment`** (`'received' | 'refund'`, NOT NULL DEFAULT `'received'`).
A refund is a payment row whose money goes out. The procedures, page, acts, history concept,
permissions and undo inverses all stay the payment's. The domain signs amounts by direction at the
points listed above.

**B. A separate `refund` table and record kind**, with its own router, page, acts and transfer
sheet. `paymentsOf` would gain a sibling, `refundsOf`, and the contract domain would take two lists.

**C. A negative `amount` in the existing table, with no migration.** The sign is the direction.

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **A** | One migration, purely additive. Every existing row reads `received`, so no figure moves. Undo inverses carry `direction` with no new code, because `api.payment.create(result)` (`payment/query.ts:211,311`) and `createMany(result.deleted)` (`:271`) pass the row back as it was. Permissions, history concept, page, palette and print path are all reused | Every reader of `s.payment` must know about direction. That means the three bypassing sums and every `select().from(s.payment)` that feeds arithmetic | An older build with the workspace already open reads a refund as money received (drizzle names its columns, so it never sees `direction`). It reconciles `paid_amount` gross, edits and exports refunds as payments, and may ping-pong `paid_amount` against a newer build's full reconcile on each pull until it closes. This is bounded by that session's life | Low. One concept, one table. The sign rule sits in `getPaidAmount` and the allocation |
| **B** | An older open build simply doesn't see refunds (it reports gross paid, but never shows a refund as a payment). `collected` and `paymentCount` stay correct without edits | Duplicates a whole record feature: router, page route, acts, host, search, history, i18n, transfer sheet. A new `RECORD_KINDS` entry would mean new permission flags and a new `history.concept` value (`platform/database/schema.ts`, `HISTORY_CONCEPTS`), which an older build's `HistorySchema` enum cannot parse. So B has to borrow the payment flags and history concept anyway. The ledger becomes a union of two queries, so its sort and search (`payment/router.ts:196-211,388-424`) need rework | `paid_amount` ping-pong with older open builds is the same as A. Two lists threaded through every domain signature makes it easy to miss one, which is exactly the spec's named risk | High. Two concepts that must stay in step for every payment change from now on |
| **C** | No migration and no schema gate. An older build sums signed amounts, so its `paid_amount` is already net | With no version bump, older builds keep opening the workspace indefinitely. They show refunds as negative payments, print a receipt (سند قبض) for money paid out, net them out of `collected` (against req 28), and their own form refuses to edit a refund (`payment/payment.ts:94`). Allocation skips a negative row silently (`schedule.ts:141`) | Mixed versions never end. The gate exists to stop exactly this (`lease/mod.rs:24-27`) | A sign convention spread across every `amount > 0` check |

**Recommendation: A.** It is the smallest interface and keeps everything inside one concept. Its
migration is the additive shape `rules/migrations` asks for, and the version gate then shuts out
every older build at its next open. The only unprotected case is an older build already open, which
B shares and which heals itself: a newer build reconciles the whole table on start, on every pull
and at each day crossing (`contract/reconcile.ts:104`, `rules/data` *Query cache*). B buys nothing
for that case beyond hiding refunds from the older build, and pays for it with a second record
feature. C avoids a migration only by defeating the gate.

### Design A in detail

#### Data model and migration

- `platform/database/schema.ts:101-147` gains `PAYMENT_DIRECTIONS = ['received', 'refund']`,
  `direction: text('direction', { enum }).notNull().default('received')`, and
  `PaymentSchema.direction: z.enum(...).default('received')`. With the default, every existing
  caller and file stays valid.
- `pnpm db:generate:desktop` produces `0006_*.sql`:
  `ALTER TABLE payment ADD direction text DEFAULT 'received' NOT NULL`. Hand-finish it with WHY
  notes in the style of 0005 and delete any `PRAGMA foreign_keys` (persistence context). The
  workspace version goes from 6 to 7.
- Rust (`tauri/src/organization/lease/apply.rs:799-1030`) needs a `SEEDED_AT_SIX` seed (payments
  carrying method, reference and note) with its `carried_from_six`, and `carried_from_five` updated
  so every payment carries `direction = 'received'`. `rules/migrations` *Every shipped version is
  seeded*.
- `serializePayment` (`payment/serialize.ts:12`) returns `direction`.

#### The limit (req 26)

Add to `contract/contract.ts`, beside `getPaidAmount`:

- `getReceivedAmount` and `getRefundedAmount`.
- `getPaidAmount = received − refunded`. Every existing caller now reads the net.
- `getRefundableAmount(contract, payments)`. When terminated: `received − refunded`. Otherwise:
  `max(0, received − totalCost − refunded)`.
- `ensureRefundWithinLimit(contract, payments, amount)`, which refuses with
  `contract.refundAboveLimit { limit }` (allowing `EPSILON`).
- `ensureRefundsCovered(payments)`, the hard invariant `refunded ≤ received`, refusing with
  `contract.refundsExceedReceived`.

Where each one runs:

| Write | Rule |
| --- | --- |
| `payment.create` with `direction: 'refund'` | skips the terminated lock and the paid-in-full gate (`payment/router.ts:457-458`), then `ensureRefundWithinLimit` against the contract's rows, plus the amount and future-date rules |
| `payment.update` of a refund | the limit, computed over the rows without this refund. Allowed on a terminated contract. `direction` is not in the update input (`router.ts:485-492`), so an edit never flips it |
| `payment.delete` of a refund, and `deleteMany` | always allowed, on a terminated contract too. That is what makes the undo of creating a refund work. `whatRefusesPaymentDeletion` (`payment/payment.ts:80`) takes the direction |
| `payment.delete`, `deleteMany` or `update` of a **received** payment on a live contract | refused only where the result breaks `ensureRefundsCovered`. New `PaymentRefusalReason` `'refunds-exceed-received'`, planned in `planPaymentSelection` per contract over the whole selection |
| `createMany` (undo of `deleteMany`) | the terminated lock and paid-in-full gate apply to the received rows only. Refunds are checked with `ensureRefundsCovered` over the final set, because the undo is putting back rows that were legitimately recorded (`rules/data` *Undo*: "an undo restores rows") |
| Undo of a single refund delete | goes through `create` with its id and re-checks the state-dependent limit, as a payment's undo re-checks paid-in-full today (`router.ts:458`). A refusal leaves the entry on the stack |
| Transfer import | per contract, held rows plus the file's rows must satisfy `ensureRefundsCovered`, refused in `write` naming the contract. Received payments onto an already-terminated held contract stay refused (`payment/transfer.ts:162`); a contract the same file imports as terminated takes its payments before the status lands (ticket 09) |
| Terminate, unterminate, contract edit of cost or period | no new refusal. Terminating only raises the limit. Unterminating (directly or by undo), or raising the cost, can leave refunds above the live surplus, and the contract then reads owing: decided by the human ("the system represents the current timeline"). Deleting or lowering a received payment on a live contract with refunds is refused only where refunds would exceed what was received; otherwise the contract owes |

#### Net paid through every figure (req 27)

- Reconcile is unchanged in code: `getContractPaymentSummary` → `getPaidAmount` is net, so
  `paid_amount`, status (`contract.ts:159-171`), rank, directory, dashboard queue, the form default
  and the act gating all read net with no edits. `isContractPaidInFull` and
  `getOutstandingExpectedAmount` (`contract.ts:127,133`) also go through `getPaidAmount`.
- **Allocation** (`schedule.ts:137-155`): allocate the received rows oldest first, exactly as now.
  Then take the total refunded off, first from what overflowed every cycle, then from the newest
  covered cycle backwards. Each cycle keeps a stack of `(paymentId, taken)`, so the cover removed
  also comes off the coverage of the payment that supplied it. On a live contract a refund never
  goes past the overflow, so its schedule is unchanged. Per-cycle cover then equals allocating the
  net amount oldest first, which is what rank's single-payment stand-in assumes
  (`rank.ts:103-119`). Refunds get no `coverage` entry.
- **Receipt** (`payment/receipt.ts:82-101`): `cycles` is the payment's coverage after refunds.
  `remaining` = total less (received minus refunded) through this payment in allocation order,
  floored at zero.
- **Directory `paymentCount`** (`directory/router.ts:78`) counts received rows only.
- **The reminder** (`contract/schedule/reminder.ts:81`) and `contract.schedule`
  (`schedule/router.ts:83`) pass the rows through and need no edit.
- **`whatBlocksContractDeletion` and `ensureContractUnitsAreMutable`** (`contract.ts:325-350`): a
  refund is a row, so it locks units and blocks deletion just as a payment does. That is right,
  since a refund implies received money.

#### Dashboard (req 28)

`dashboard/router.ts:213-218`: `collected` gains `where direction = 'received'`. A second sum,
`returned`, adds `direction = 'refund'` under the same `isWithinPeriod`. `DashboardSummary.money`
(`:79`) becomes `{ due?, collected?, returned? }`, with `returned` present only when it is above
zero. `landing.svelte:136-181` shows it beside collected, and the ring stays collected over due.

#### Voucher (req 29)

- `payment.receipt` (`router.ts:275-339`) answers a union on `direction`. A `received` row answers
  exactly as now. A `refund` row answers `{ kind: 'voucher', reference: toReceiptReference(id),
  payment, tenant?, contract?, units? }`, with no cycles and no remaining. The same permission
  trimming applies.
- `payment/component/host.svelte:133-185` and the `printedReceipt` snippet (`:319`) render a new
  `payment/component/voucher.svelte` when the kind is voucher. Its title is سند صرف / Payment
  voucher, it shows the method, reference and the note as the reason, and it ends with a signature
  line for the tenant. It goes through the same `sendPage` and `PrintPreview`, so the Rust print
  module (`tauri/src/print/mod.rs`), which knows no payment, is untouched.
- The act `payment.receipt` (`acts.ts:107`) labels itself by direction.

#### Transfer (req 30, refunds half)

The payments sheet (`payment/transfer.ts`) exports a refund as a **negative amount**. It also
gains `Method`, `Reference` and `Note` columns (Arabic headers alongside), optional on import, so
every field a person entered on a payment round-trips; a file without them imports as today. A file
exported before this effort has no negative amounts, so every row reads as received. A negative
row reads as a refund of its absolute value, and zero stays invalid. An older build fed a new file
rejects the refund rows by name (`hasValidPaymentAmount`, `:130`) and imports the rest, instead of
taking them in silently as received. A `Direction` column would be ignored by an older build
(columns are matched by header), and that is silent corruption. The held identity
(`:82-93`) is `String(amount)`, so a refund (`-1000`) never matches a payment (`1000`).
`TransferPayment` gains a signed amount or `direction`. The ledger's own export (`ledger.svelte:248-268`)
follows the same sign. The Rust side (`tauri/src/transfer/export.rs`) only writes the cells it is
handed, so it is unchanged.

#### Permissions, UI, history, i18n

- **Permissions**: reuse `createPayment`, `editPayment` and `deletePayment`
  (`packages/workspace-permission/index.ts:66-69`). No new flags or kinds, so no change to stored
  role masks.
- **Ledger** (`payment/component/ledger.svelte`): refund rows read as money going out, with a
  "Refund" tag and an outgoing sign. Month headers state received and, where non-zero, returned,
  without netting either (`payment/ledger.ts:20-27,75` gains `returned`). A second create act,
  "Record refund", comes with `toRefundCreateUnavailable` in `acts.ts`: it refuses where
  `getRefundableAmount` is zero and names why. On a terminated contract
  (`ledger.svelte:101,117`) the refund act stays available and row actions are allowed on refund
  rows only. `toWriteUnavailable` (`acts.ts:69`) takes the direction.
- **Form** (`payment/component/form.svelte`): a `direction` prop sets the title, and the form
  states the most that may be refunded before an amount is typed (and, where it is zero, why). It
  does not prefill the amount. The router refusal is still the authority.
- **Locked rows explain themselves** (spec requirement 25): on a terminated contract, a received
  payment's row actions are replaced by a short note that the contract is terminated and restoring
  it unlocks its payments, rather than vanishing (`ledger.svelte:101,117`).
- **Payment page and palette** (`details.svelte`, `router.ts:350`): show the direction.
- **Undo and history** (`payment/query.ts`): the inverses are unchanged. `toPaymentHistoryEntry`
  (`:54`) freezes the record name as "Refund 1,000" for a refund. The concept stays `payment` and
  the actions stay `created`, `edited` and `deleted`, which older builds parse. The toasts get
  refund variants.
- **i18n keys** (`payment/i18n/{en,ar}.ts`, `dashboard/i18n/*`, `common`):
  `payments.refund.{title,new,tag,limitHint,unavailable.nothingToRefund,historyName}`,
  `payments.voucher.{title,print,reason,signature,number}`, `dashboard.figures.returned`, and the
  refusals `contract.refundAboveLimit { limit }`, `contract.refundsExceedReceived` and
  `payment.refundsExceedReceived` (`payment/refusal.ts`, `contract/refusal.ts`).
- **Context**: `.aep/contexts/desktop/contract.md` (Payment, Outstanding, Paid in full, Receipt)
  gains Refund and Voucher, and Paid becomes net. Same commit.

### Interfaces

| Procedure or function | Change | Callers that must change |
| --- | --- | --- |
| `payment.create` | input accepts `direction` (default `received`) | `useCreatePayment` toast; form host |
| `payment.update` | unchanged input; branches on the stored direction | none |
| `payment.delete`, `planMany`, `deleteMany`, `createMany` | refund-aware rules; new refusal reason | `ledger.svelte:150-162` reason map; `query.ts:287` notice |
| `payment.receipt` | union `receipt \| voucher` | `host.svelte` preview and print; `PaymentReceipt` type (`query.ts:134`) |
| `dashboard` summary | `money.returned?` | `landing.svelte` |
| `getPaidAmount` | net | none (single-homed) |
| new `getReceivedAmount`, `getRefundedAmount`, `getRefundableAmount`, `ensureRefundWithinLimit`, `ensureRefundsCovered` | `contract/contract.ts` | `payment/router.ts`, `selection/router.ts`, `payment/transfer.ts` |
| `scheduleContract` | refunds strip cover from the newest cycle back | `allocateReceipt` (`receipt.ts:82`) |
| `whatRefusesPaymentDeletion(status, direction)` | signature | `selection/router.ts:88`, `acts.ts` |
| `PaymentLike` | gains `direction?` (absent reads received) | test fixtures only |

### Testing (per `rules/testing`)

| Criterion | Tests |
| --- | --- |
| 25 | Router: `payment/tests/router.test.ts` covers a refund on an active and on a terminated contract, an undo-shaped delete, re-create by id, existing payments untouched, and a received payment on a terminated contract still refused. Component: `payment/tests/ledger.svelte.test.ts` shows the refund row as outgoing and the refund act available on a terminated contract. Mutation: `payment/tests/history.test.ts` checks the inverses and the frozen refund name |
| 26 | Unit: `contract/tests/contract.test.ts` covers `getRefundableAmount`. Router: on a live contract paid 1,000 beyond its total, 1,000 is accepted and 1,001 refused naming the limit; on a contract paid exactly its total, any refund is refused; on a terminated contract with 5,000 received, 3,000 then 2,000 go through and 1 more is refused. Selection: `selection/tests/router.test.ts` covers the `refunds-exceed-received` plan |
| 27 | Unit: `schedule/tests/schedule.test.ts` checks a refund strips the newest cycle first and leaves a live schedule alone; `payment/tests/receipt.test.ts` checks remaining and cycles. Router: after a refund, `paid_amount`, status, `contract.schedule`, outstanding and the directory row (`contract/directory/tests/router.test.ts`) all read net; a terminated contract refunded in full stays terminated and owes nothing |
| 28 | `dashboard/tests/router.test.ts`: collected unchanged and returned equal to the refund, with returned absent when there is none. `dashboard/tests/landing.svelte.test.ts`: the figure shows only when it is non-zero |
| 29 | `payment/tests/receipt-host.svelte.test.ts` (or a new `voucher.svelte.test.ts`): prints a refund in Arabic and in English and finds every field; the existing receipt tests stay unchanged |
| 30 | `transfer/tests/round-trip.test.ts` (new, ticket 26): build every record kind and field named in the criterion, `transfer.get`, import into a fresh `createApi()`, compare field by field with ids mapped through references; the existing `export.json` and `workbook.json` fixtures (exported before this effort) still import with every payment received |
| migration | Rust `apply.rs` walks the seeds from five and from six. The live `migration_live_every_shipped_migration_commits_in_one_transaction` should run before merge |

### Technical risks

- **Older builds already open across the migration** read refunds as received, reconcile
  `paid_amount` gross, and can ping-pong it against a newer build until they close. They can also
  export refunds as payments. This is unfixable in shipped builds. Say so in the release note.
- **A missed sum.** The bypassing sums (`dashboard/router.ts:215`, `directory/router.ts:79`,
  `ledger.ts:75`, `receipt.ts:91`) are the known ones. A lint-style test grepping
  `sum(${s.payment.amount})` outside the domain would pin it.
- **A backdated refund** (dated before the payments it draws on) can make a receipt's running
  `remaining` differ from the net schedule within one day's order. Tests pin the chosen rule.
- **Live shape check**: the `DEFAULT 'received' NOT NULL` column must compare equal to a fresh
  database on Turso's server.
