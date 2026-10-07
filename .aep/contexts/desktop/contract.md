---
paths:
  - apps/desktop/src/lib/contract/**
  - apps/desktop/src/lib/payment/**
use-when: "the request touches contracts, payments, unit assignments, or any derived status"
---

# Contract

The agreement between a tenant and the units they rent, and the arithmetic that decides
whether it is being honoured. Every derived status in the application — contracts and
units alike — is computed here.

## Language

**Contract**:
An agreement between one tenant and one or more units, over a fixed period, at a fixed
cost per interval.

**Payment**:
An amount that moved between a tenant and a contract on a date, in one of two _directions_:
_received_ from the tenant, or a _refund_ returned to them. One that names no direction was
received, which is how every payment recorded before refunds existed reads. Recorded, never
derived — payments are the input the whole status model is computed from. A payment may also say how it was paid (its
_method_: cash, bank transfer, cheque or Ejar), the transfer, cheque or SADAD number it was made
under (its _reference_, which is what a payment is searched by), and a note; each is optional and
reads as not recorded where it was not.

**Refund**:
A payment whose money went back to the tenant: a row in the payment table with the direction
_refund_, never a negative amount and never a record of another kind. It is taken off what the
contract counts as _paid_, and it is never part of what the landing page reports as _collected_,
which is every payment received as recorded. How much may be refunded depends on the contract's
state: on one not terminated, only what it received past its total cost, so a refund never makes
it owe; on a terminated one, up to what it received. Each less earlier refunds
(`getRefundableAmount`). An edited refund may always keep or lower its amount, even past that
limit, since a restored contract may already hold refunds past it; only raising one is weighed.
That limit is for changes a person makes. An undo or a redo replays a change rather than making
one, and is held only to refunds staying within what the contract received: undoing a refund's
edit or deletion puts back exactly what was recorded, past the limit or not. An intended change is
reversed by another change, which the limit weighs; an unintended one is undone back to the state
before it (the human's ruling of 2026-10-07). A file is the one place a refund is written as a negative amount, the
workspace file and a contract's ledger export alike, with its method, reference and note beside
it as a payment received has them. A file's refunds on one contract, weighed together with what
the contract already holds, may not exceed what it received; the limit by state governs recording a
refund, not reproducing one, since a restored contract may hold refunds past it and still be
exported and imported back.
_Avoid_: a negative payment, a reversal

**Voucher**:
The one-page statement that a refund was paid out (سند صرف), as the receipt is that a payment was
received, from the same print preview and in either language. It names the refund by a number taken
from its identity, gives the note as the reason, and ends with a line for the tenant's signature.
It is not a tax document.
_Avoid_: receipt, which is for money received

**Paid**:
What a contract counts as paid: what it received less what it refunded (`getPaidAmount`). The one
figure every settlement reads: the contract's materialised `paid_amount`, its status, its schedule
and allocation, its outstanding, whether it is paid in full, its rank, its directory row and its
receipts. Never the gross of what was received, which is _collected_ and is the landing page's.

**Assignment**:
The link between a contract and a unit. A unit may be held by at most one non-terminated
contract over any given period.

**Interval**:
The billing period — monthly, quarterly, semi-annual, or annual. Fixed at creation.

**Cycle**:
One elapsed interval within a contract's period. A twelve-month contract on a quarterly
interval has four cycles, counted from the start date.

**Schedule**:
A contract's period laid out as its cycles, every one of them, each with its due date (the start
date, then the first day of each following interval), its amount (the cost), the part of it the
payments cover, and its state: _paid_, _late_, _due_, _partly paid_ or _upcoming_. Computed on
read by `scheduleContract` in `contract/schedule/schedule.ts` and never stored. On a contract that is not
terminated, what the late and due cycles leave uncovered is the _outstanding_, so the schedule and
the figure are one answer; a terminated contract's schedule reads no cycle as late or due. The
contract record shows it as its _schedule_ section, read through `contract.schedule`.

**Allocation**:
How payments are taken against the schedule: oldest first, by date and then by the order they
were recorded, each filling the earliest cycle not yet covered before the next. A payment may
cover several cycles, and what is paid past the total cost covers none. Refunds are then taken
off, first from what was paid past the total cost and then from the newest covered cycle back, so
the cover left is what the _paid_ amount covers oldest first, and a refund covers no cycle. Always
oldest first; nobody chooses which cycle a payment pays.

**Receipt**:
A one-page statement that a payment was received (سند قبض), in Arabic or in English as chosen in
the print preview, printed or saved as a PDF from there. It names the payment by a _receipt number_ taken from the
payment's identity, never by a sequence, and states the cycles the payment covers by the
_allocation_ and what remains of the _total cost_ after it, net of the refunds the allocation takes
before it. Read on demand from the payment as it stands (`payment.receipt`) and never stored. It is not a tax invoice.
_Avoid_: invoice (فاتورة), which it is not

**Reminder**:
A message to a contract's tenant about the rent, naming the tenant, the amount, the date and the
contract by its number, or *your contract* where it has none: it fits every contract, however
many units it holds. The act, *remind tenant*, shows it first in the language the application is showing, which
the landlord can switch to the other, and then opens WhatsApp with it written. Offered on a
contract that is _overdue_, _owing_ or _due soon_, never on a terminated one. The landlord reads it
and sends it; the application sends nothing and records nothing about it.

**Cost**:
The amount owed _per interval_, never the contract total. Prefer the fuller reading
whenever the bare word could be taken either way.

**Total cost**:
Cost multiplied by every cycle in the period — what the whole contract is worth.

**Amount due**:
Cost multiplied by the cycles elapsed so far — what is owed as of a given moment. Distinct
from total cost, and the two are not interchangeable: what is outstanding today is
measured against amount due, while being paid in full is measured against total cost.

**Outstanding**:
Amount due as of today, less what the contract counts as _paid_, floored at zero. The debt as it
stands — never scoped to a month, a cycle, or any other window. A figure measured over a window is
that window's name followed by the amount, never the bare word.

**Paid in full**:
What the contract counts as _paid_ meets its total cost. Not "up to date" — a contract one month
in with the whole term prepaid is paid in full.

**End-date tolerance**:
The slack permitted, currently five days, between a contract's recorded end date and the
date a whole number of cycles would produce. It exists because calendar months vary in
length, so a period agreed as "one month" rarely lands on the computed boundary. A period
outside the tolerance is not a valid period for that interval.

**Overlap**:
Two contracts competing for the same unit over intersecting dates. Rejected. A terminated
contract keeps its units but holds none of them, so another contract may take one meanwhile;
restoring the terminated contract, singly, in a selection or by undoing its termination, makes it
live again and obeys this rule, refused naming the unit. Two terminated contracts on one unit
restored together restore the first and refuse the second. Undoing a _deletion_ is the exception:
it puts rows back as they were (`contract.restoreMany`, [[rules/data]] under *Undo*). A workspace
file obeys it too: a row naming a unit twice, two live rows on one unit over intersecting terms,
or a live row on a unit a live contract holds is named in the import's plan and refused by its
write; a terminated row claims none of its units.
_Avoid_: conflict — that word belongs to remote sync

**Ending soon**:
A contract whose end date falls inside the user-configured notice window. A presentation
concern, never a stored status.

**Owing**:
A contract inside its period, not terminated, whose outstanding is above zero. What the
work queue groups on, and a presentation concern like _ending soon_ — a contract is not
`defaulted` for being behind, and being behind is not a status.

**Overdue**:
A contract past its end date, not terminated, and still outstanding. Every `defaulted`
contract qualifies, because past the end date the amount due is the total cost — so the
two coincide, and the word is the queue's rather than the status model's.

**Due soon**:
A contract owing nothing today whose next cycle, in its _schedule_, falls due within the next
seven days and is not covered in full. Read after _owing_ and before _ending soon_, and like them a
presentation concern rather than a status. Nothing is owed on it yet, so it adds nothing to the
_outstanding_; a contract that owes today and has a cycle coming due is _owing_ only.
_Avoid_: مستحق for it in Arabic, which is _owing_'s word

None of these reaches a terminated contract, whatever it owes: termination locks the contract
and the payments it received, so the debt is a closed matter rather than work.

**Contract status**:
Derived from the period and whether the contract is paid in full — nothing else.

| Status       | Means                                                                   |
| ------------ | ----------------------------------------------------------------------- |
| `scheduled`  | the start date is in the future                                         |
| `active`     | within the period, not paid in full                                     |
| `fulfilled`  | within the period, paid in full                                         |
| `defaulted`  | past the end date, not paid in full                                     |
| `expired`    | past the end date, paid in full                                         |
| `terminated` | ended by explicit action; authoritative, never overridden by derivation |

Being _behind schedule_ plays no part, despite what `defaulted` and `active` suggest. A
contract that has paid nothing but is still inside its period is `active`, not `defaulted`.
An older glossary described a model built on current-versus-behind; the code has never
implemented it, and the tests pin what is here deliberately.

**Unit status**:
A unit is `occupied` when today falls inside the period of one of its assignments whose
contract derives to `active`, `fulfilled`, or `defaulted`. Otherwise `vacant`.

## Boundaries

- **This domain owns unit-status derivation as well as contract-status.** The property
  context owns the entities; the rule that decides whether a unit is occupied is here,
  because it is a question about contracts.
- **A contract's tenant is fixed at creation. Its units are mutable only until a payment
  exists** — the first payment locks the assignment set.
- **A terminated contract is locked, and so are the payments it received; its refunds are
  not.** `terminated` is the one status a user sets, and no derivation overrides it. Nothing
  about the contract changes and no payment is received on it, but a refund on it is recorded,
  edited and deleted directly, since returning money is what is left to do once it has ended.
- **Transfer keeps a terminated contract terminated.** It is the one status a workspace file's
  `Status` column is read for; every other status is derived again once the import lands. A
  whole-workspace import writes the contract live, writes its payments, and lands the termination
  at the end of the same batch, so its payments come back with it. A payment received that a
  file adds to a contract the workspace already holds terminated is still refused; a refund is
  taken, as it is by hand.

## Constraints

- **Whole days, UTC.** Every date in this domain is a UTC day. Time-of-day is never part of
  a comparison, so a contract does not change status partway through a day depending on the
  machine's timezone.
