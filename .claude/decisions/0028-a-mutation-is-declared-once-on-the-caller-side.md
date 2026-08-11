---
owner: repository
status: accepted
load-when: a data mutation is added, or where a mutation's cache invalidation, toast, or inverse is written is in question
sources: [src/lib/design/mutation.ts, src/lib/design/query.ts]
supersedes: []
superseded-by: []
---

# A mutation is declared once, on the caller side

Every data mutation was written twice: once as a procedure, and once as a hook that differed
from its siblings in two facts — which procedure it called and which message it showed —
while repeating twenty lines around them. Fifteen mutations, and the drift duplication
produces was already visible: two deletions of the same shape, one checking its result before
invalidating and one not, with nothing saying why.
[ADR 0026](0026-undo-is-a-session-stack-of-inverses.md) would have added a fourth thing to
remember in each of them. **A mutation is now declared once — the call, the message, what it
touches, and its inverse — and the hook, the cache invalidation and the undo entry are
derived from that declaration.**

## This is not the layer ADR 0002 rejected

[ADR 0002](0002-no-repository-layer.md) rejected an abstraction **between a router and the
database**, and nothing here goes near that seam: routers still validate, call the domain,
persist and reconcile with Drizzle directly, and this decision does not touch one. The
declaration sits where the shared mutation helper already sits — between a component and the
in-webview caller — and replaces hand-written repetition on that side with a statement of
what varies.

The distinction is worth writing down because the two are easy to conflate from the outside:
both are "don't write the same thing fifteen times", and only one of them was rejected. The
test is which seam is crossed. A future proposal to extend this declaration *into* the
routers, so that autosync and reconcile are derived from it too, is the rejected layer
arriving by a different road, and should be read as one.

## Consequences

**The server-side obligations stay where they are, unconsolidated.** A procedure still has to
remember its autosync middleware and its reconcile call with the right touch-set, and
forgetting either is still silent. That is the cost of the boundary above, and it is the same
cost ADR 0002 already accepted and recorded: the discipline is carried by review and by the
API-layer rule rather than by the architecture.

**Cache invalidation stays coarse for now.** The declaration names what a mutation touches, so
narrowing invalidation to that set becomes a change in one place rather than fifteen — but it
is deliberately not made here. Getting a touch-set wrong shows a stale row, and a stale row is
wrong data rather than slow data, which is the failure the workspace cache policy
([ADR 0012](0012-the-query-cache-is-trusted-until-told-otherwise.md)) is written to avoid.
Declaring the touch-set first and acting on it later means the risky half can be taken alone,
against a codebase where every mutation already states its answer.

**A mutation with no declaration is outside undo, and nothing fails.** The same shape as the
autosync middleware's, and accepted for the same reason.
