---
owner: repository
load-when: the request touches contracts, payments, unit assignments, or any derived status
sources: [src/lib/contract/, src/lib/payment/]
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
An amount received against a contract on a date. Recorded, never derived — payments are
the input the whole status model is computed from.

**Assignment**:
The link between a contract and a unit. A unit may be held by at most one non-terminated
contract over any given period.

**Interval**:
The billing period — monthly, quarterly, semi-annual, or annual. Fixed at creation.

**Cycle**:
One elapsed interval within a contract's period. A twelve-month contract on a quarterly
interval has four cycles, counted from the start date.

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
Amount due as of today, less every payment ever received against the contract, floored at
zero. The debt as it stands — never scoped to a month, a cycle, or any other window. A
figure measured over a window is that window's name followed by the amount, never the bare
word.

**Paid in full**:
Payments received meet the contract's total cost. Not "up to date" — a contract one month
in with the whole term prepaid is paid in full.

**End-date tolerance**:
The slack permitted, currently five days, between a contract's recorded end date and the
date a whole number of cycles would produce. It exists because calendar months vary in
length, so a period agreed as "one month" rarely lands on the computed boundary. A period
outside the tolerance is not a valid period for that interval.

**Overlap**:
Two contracts competing for the same unit over intersecting dates. Rejected.
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

Neither reaches a terminated contract, whatever it owes: termination locks the contract,
so the debt is a closed matter rather than work.

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
- **A terminated contract is locked.** `terminated` is the one status a user sets, and no
  derivation overrides it.

## Constraints

- **Whole days, UTC.** Every date in this domain is a UTC day. Time-of-day is never part of
  a comparison, so a contract does not change status partway through a day depending on the
  machine's timezone.
