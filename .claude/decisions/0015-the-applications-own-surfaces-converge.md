---
status: accepted
load-when: a surface the application shows about itself — starting, failing, recovering, choosing a workspace — is being built or restyled
sources: [src/lib/layout/component/, src/lib/sync/component/, src/routes/+error.svelte]
supersedes: []
superseded-by: []
---

# The application's own surfaces converge, where its concepts' surfaces diverge

[ADR 0013](0013-list-presentation-is-per-concept.md) gave each list the shape its data has,
because a contract queue and a payment ledger answer different questions and one presentation
answered neither. The surfaces the application shows *about itself* — starting, failing,
recovering, asking which workspace to open, and reporting an error nothing anticipated — have
no data of their own to take a shape from, so the reasoning that made the lists diverge does
not reach them: what they have in common is the whole of what they are, and they converge onto
one shared surface in the design system instead.

## Considered Options

- **Restyle each in place.** Seven hand-rolled instances of one geometry, which is what already
  exists and what already drifted: the six that were built as cards picked three different
  widths independently, and the seventh was never styled at all.
- **Converge the four startup states only.** Coherent as a family, and it strands the two
  surfaces a confused user is likeliest to reach — a settings page that failed to load, and an
  unhandled route error.

## Consequences

The route error boundary stops being a stub. It was eight lines printing a status code with no
retry, no way back and no locale, and it was never going to be worth a ticket of its own; it
becomes finished as a consequence of having somewhere to render.

The two directions are easy to mistake for an inconsistency, so the test is worth stating: a
surface presenting a concept's records takes that concept's shape, and a surface presenting the
application's own state takes the shared one. A future surface belongs to whichever side owns
the thing it is showing.

The claim is falsifiable and the design document says how — six callers share one body snippet,
and a prop appearing on the block to serve exactly one of them means this was the wrong seam.
