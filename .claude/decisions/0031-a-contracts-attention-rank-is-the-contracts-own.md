---
owner: repository
status: accepted
load-when: a contract's rank, grouping or follow-up order is in question, or a surface outside the dashboard needs one
sources: [src/lib/contract/, src/lib/dashboard/]
supersedes: []
superseded-by: []
---

# A contract's attention rank is the contract's own

Which rank a contract is filed under — overdue, behind, ending soon — is decided from its status,
its end date and what it owes today, and the rules deciding it live in `src/lib/dashboard/`. They
are rules about a contract in a module named for the surface that happened to read them first.
**The rank moves into the contract domain, and the dashboard reads it rather than deriving it.**

The question arrived when the contracts list needed to filter by rank, so that the landing
screen's `see all` had somewhere honest to land ([ADR 0030](0030-the-landing-screen-is-figures-over-sections.md)).

## Considered Options

- **The contracts list imports the rule where it stands.** One import, nothing moves, still one
  rule and no duplication. Rejected: it makes the contract domain depend on the dashboard. A view
  depending on a domain is ordinary and a domain depending on a view is not, and the next caller
  needing a rank outside the dashboard meets the same question with one more importer in the way.
- **A dashboard-owned page showing one rank at full length**, so no other surface ever needs the
  rule. Rejected by the user in favour of the filter, and separately because it partly rebuilds
  the long queue ADR 0030 replaced.
- **Duplicating the rule on the contract side.** Rejected without argument: two copies of a
  ranking rule disagree the first time either is edited, and the derived-status model in this
  repository has already paid that cost once.

## Consequences

**`src/lib/dashboard/` becomes a view and holds no domain rule.** What remains there is what the
screen shows and how it is laid out. Anything answering *what is true of this contract* belongs on
the other side of that line, and a rule appearing in the dashboard module again is the signal this
decision was worked around.

**The rank is available to any surface, not only to the screen that named it.** That is the point,
and it is also the risk: a concept reachable from everywhere accumulates callers. The rank is
defined by the contract's own fields and nothing about a surface, which is what keeps it honest —
a rank that needed to know who was asking would be a view again.

**The ordering moves with the rank.** Follow-up order — largest debt first inside a money rank,
soonest end first inside renewals, tenant name breaking either tie — is part of what a rank means
rather than a presentation choice, so a second reader of the rank gets the same order without
restating it.

**The rules keep their tests and gain no new ones for moving.** They were already pure functions
over a contract's fields, which is what makes this a move rather than a rewrite — and is the
evidence that they were the contract's all along.
