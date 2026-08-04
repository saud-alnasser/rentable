---
status: accepted
---

# A form surface is one component that presents two ways, not two components swapped

Forms needed to present as a centred panel on a narrow window and an edge sheet on a wide one.
The obvious construction — render `Dialog` below the breakpoint and `Sheet` above it — destroys
and recreates the subtree every time the window crosses `md`, taking the user's typed values,
validation errors, scroll position and focus with it. Instead **one component presents both
ways in CSS**, so nothing unmounts and nothing has to be preserved.

What makes this available rather than merely desirable: `sheet-content.svelte` and
`dialog-content.svelte` both wrap `Dialog` from bits-ui. **A sheet here is already a dialog**,
differing in positioning and variants. There was never a second component to swap to — only a
second set of classes.

Which presentation appears is decided by a **weight the form declares** — light or heavy — with
the window deciding only whether that presentation fills the width it has. Weight is declared
rather than measured because measuring makes the surface reflow while the user types. Specified
at [`form-presentation-spec.md`](../designs/form-presentation-spec.md).

## Considered Options

**Swap the two components at the breakpoint** — rejected, and it is the construction a reader
will expect, which is why this is recorded. Everything inside unmounts on the crossing. Form
state can be hoisted above the conditional to survive, but scroll position and focus cannot be
without explicitly capturing and restoring them, and a restoration that is nearly right is worse
than no motion at all: the caret lands somewhere the user did not put it.

**Pick the container when the form opens and keep it** — rejected. No crossing to survive, so no
state to lose, and it is genuinely simpler. But a user who opens a form on a small window and
then maximises keeps a cramped dialog on a wide screen, which is the original complaint with an
extra step.

**Per concept, as [ADR 0013](0013-list-presentation-is-per-concept.md) did for lists** —
rejected, and the rejection is the interesting one because the precedent points the other way.
Lists diverge per concept because a contract queue and a payment ledger answer different
questions. Forms do not: a create form answers the same question for every concept, and what
actually varies is how much of it there is and how much room there is to show it. Adopting the
per-concept axis here would reproduce exactly the four hand-rolled containers this replaces.

## Consequences

**The axis is viewport and weight, and a per-concept prop is the signal it went wrong.** The
same detection the list shell carries: a prop that serves exactly one concept means the surface
has taken the wrong axis, and it returns to design rather than gaining a flag.

**Weight has two values and gains no more.** A third proposed value means the same thing a
per-concept prop means. Two values are declarable at a glance; a scale is a judgement call
repeated per form, which is how a vocabulary becomes taste.

**A resize is not a trigger, so it does not animate.** Under
[ADR 0016](0016-motion-responds-and-uses-what-is-installed.md) motion answers something the user
aimed at. Opening and closing qualify; dragging a window edge and having the panel re-present
itself does not, and animating it would draw attention to the mechanism rather than the content.

**`design/primitive/form/` is untouched.** The headless field layer over formsnap, superforms and
zod was never the problem and is not rewritten. This decision is entirely about what surrounds
the fields.
