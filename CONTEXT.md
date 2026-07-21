# Context

Domain vocabulary for `rentable`, an offline-first desktop rents payment tracker.

This file is the source of truth for terminology. When code, issues, or commits name a
domain concept, use the term as defined here.

## Core entities

**Tenant** — a person who rents. Identified by a **national identity number** (see below),
a name, and a phone number. Tenants are not scoped to a complex; the same tenant may hold
contracts across several.

**Complex** — a named building or property at a location. Owns units.

**Unit** — a rentable space within a complex. Carries a **status** of `occupied` or
`vacant`. That status is _derived_, never authored — see **Reconcile**.

**Contract** — an agreement between one tenant and one or more units, over a fixed period,
at a fixed **cost per interval**. Carries a **status** and an optional **government ID**
(`govId`, the externally-issued reference). A contract's tenant is fixed; its units are
mutable until payments exist.

**Payment** — an amount received against a contract on a date. Payments are recorded, not
derived. They are the input from which contract and unit status are computed.

**Assignment** — the link between a contract and a unit (`contract_unit`). A unit may be
assigned to at most one active contract over any given period; overlapping assignments are
rejected.

## Contract vocabulary

**Interval** — the billing period: `1m`, `3m`, `6m`, or `12m`. Fixed at creation.

**Cycle** — one elapsed interval within a contract's period. A 12-month contract on a `3m`
interval has four cycles. Cycles are counted from the contract's start date.

**Cost** — the amount owed _per interval_, not the contract total. The column is
`cost_per_interval`; prefer that reading whenever the bare word is ambiguous.

**Expected amount** — the total owed as of a given moment: cost × cycles elapsed. Compared
against payments received to determine whether a contract is in good standing.

**End-date tolerance** — the permitted slack, currently five days, between a contract's
recorded end date and the date a whole number of cycles would produce. It exists because
calendar months vary in length, so a period agreed as "one month" rarely lands exactly on
the computed boundary. A period within tolerance counts as that many whole cycles; a period
outside it is not a valid period for the interval.

**Contract status** — one of:

| Status       | Meaning                                                                        |
| ------------ | ------------------------------------------------------------------------------ |
| `scheduled`  | Start date is in the future                                                    |
| `active`     | Within its period and payments are current                                     |
| `defaulted`  | Within its period but payments are behind expected                             |
| `fulfilled`  | Period ended with the full expected amount paid                                |
| `expired`    | Period ended without full payment                                              |
| `terminated` | Ended early by explicit action. Authoritative — never overridden by derivation |

`terminated` is the only status a user sets directly. All others are derived.

**Ending soon** — a contract whose end date falls within the user-configured notice window
(`endingSoonNoticeDays` in settings). A presentation concern, not a stored status.

## Derived state

**Reconcile** — recompute derived state from its source of truth and write the result back.
Two subjects use this word:

- _Status reconciliation_ — recompute contract and unit status from dates and payments.
  Must run after any mutation touching contracts, payments, or assignments, or statuses
  go stale.
- _Manifest reconciliation_ — recompute a backup manifest from the snapshot files actually
  present on disk.

Both mean the same operation on different subjects. This word replaces the former local
meaning of `sync` (see **Words we avoid**).

## Remote and backup vocabulary

**Sync** — always means _remote_: exchanging workspace state with Google Drive. Never used
for local recomputation.

**Workspace** — the unit of syncable state: the local database plus its metadata, mapped to
one remote location.

**Snapshot** — a point-in-time copy of the workspace database, stored as a file. Both local
backups and remote copies are snapshots.

**Manifest** — the index describing which snapshots exist and which is current. Exists in
both local and remote forms.

**Link** — the act of connecting a workspace to a remote account, and the OAuth session
that performs it. A workspace is _linked_ or _unlinked_.

**Autosync** — the scheduled push to the remote that follows a successful mutation. Always
remote; see **Sync**.

**Conflict** — a divergence between local and remote workspace state requiring a user
decision. Distinct from an _overlap_, which is two contracts competing for one unit.

## Identity

**National identity number** — the government identifier held on a tenant (`national_id`).
A single field accepting two document types: a Saudi citizen's national ID (prefixed `1`)
or a resident's iqama (prefixed `2`).

Use **national identity number** for the field and the concept. Use **iqama** only when
specifically discussing the resident-permit case. The former naming of the whole field as
`iqama` was inaccurate — it described one of the two accepted forms.

## Words we avoid

**These describe the target vocabulary, not the current tree.** The codebase still uses
every term in the left-hand column; the renames land across the refactor programme (see
issue #95 — the `sync`/`reconcile` split in #107, the module layout in #123–#126). Until
then, expect to read the old names and write the new ones. Do not treat a left-column name
in existing code as a defect to fix opportunistically; it has a ticket.

| Avoid                                            | Use instead                      | Why                                           |
| ------------------------------------------------ | -------------------------------- | --------------------------------------------- |
| `sync` for local recomputation                   | **reconcile**                    | `sync` means remote everywhere else           |
| `iqama` for the tenant ID field                  | **national identity number**     | The field accepts both document types         |
| `utils` as a module name                         | the concept's own name           | A grab-bag name invites unrelated code        |
| `common` as a directory                          | `ui`, `platform`, or the concept | Same                                          |
| `mod.ts`                                         | the concept's own name           | A Rust/Deno idiom; unclear in TypeScript      |
| `contracts` / `tenants` (plural) as module names | singular                         | A directory names a concept, not a collection |

## Architectural constraints

**Target state, agreed but not yet built.** These are decisions the refactor programme
(issue #95) implements; none of them describe the tree as it stands today. They will be
restated in `CLAUDE.md` by issue #97, at which point that file is the authority and this
section is a pointer.

- Google Drive HTTP and OAuth live in Rust, and credentials never cross the IPC boundary.
  Today the client is in TypeScript and receives both the OAuth client secret and a refresh
  token — issues #114–#118.
- Domain rules live with their concept rather than in routers or a shared `utils` bag, and
  there is no repository layer; routers use Drizzle directly — issues #107, #108.
- Modules are organised by concept, not by layer, with `src/routes/` as the acknowledged
  exception — issues #123–#126.
