---
owner: repository
status: accepted
load-when: the shell changes shape with window width, or a breakpoint is being added, moved, or read from script
sources: [src/app.css, src/lib/design/is-below-shell-breakpoint.svelte.ts]
supersedes: []
superseded-by: []
---

# The shell's breakpoint is one declaration, and the navigation still swaps at it

The shell changed shape at 768 because two independent statements of that number happened to
agree — a constant deciding which navigation component renders, and the styling framework's
default medium breakpoint deciding how the shell looks and whether the desktop navigation is
visible at all. **The breakpoint is now declared once, in the styling theme, and both
languages read that declaration**: the framework as a named variant, and the navigation state
as a custom property read from the rendered document. Moving the shell's breakpoint is one
edit, and the two halves cannot drift apart into the state where the navigation is absent
entirely.

## Considered Options

**Two declarations with a comment linking them** — rejected. It is what was already there
minus the coincidence, and a comment is not a mechanism: the failure it guards against is
silent, produces no error, and shows up as a missing sidebar across a band nobody routinely
resizes into.

**Retire the narrow presentation and let the rail serve the whole supported range** —
rejected, and it is the strongest rejected option. The window cannot be sized below 640, so
the drawer serves a 127-pixel band that exists only because the primitive was written for the
web; deleting it would remove the crossing rather than make it correct, and take three
separate faults with it. It was rejected on direction rather than on cost: the shell adapts
across the range it supports, and at the narrow end a rail leaves the lists a width they are
not comfortable in.

**One navigation presenting both ways in styling alone**, the construction
[ADR 0017](0017-a-form-surface-is-one-component.md) chose for forms — rejected, and this is
the rejection most likely to be re-proposed. 0017 states the condition that made it
available: a sheet was already a dialog, so there was never a second component to swap to,
only a second set of classes. **That condition is absent here.** A static rail is not already
an overlay with a focus trap, an escape route and a scrim, so this option means building those
semantics onto an always-mounted subtree — the most expensive path available, bought for the
least return, because what a sidebar loses on a crossing is navigation links rather than a
half-typed form.

**Raise the window floor to 768 so the band cannot exist** — rejected. The 640×480 floor is
an accepted range verified by hand in both locales; reopening it is its own decision with its
own reasoning, not a side effect of tidying a breakpoint.

## Consequences

**ADR 0017 does not bind the shell, and this is where that is written down.** The sidebar
performs the component swap 0017 rejected, and does so deliberately. A reader who finds the
swap and reaches for 0017 will either apply it wrongly or file the divergence as drift; both
are avoided only by this paragraph existing.

**Forcing the theme variable into the emitted stylesheet is load-bearing, not defensive.**
Unused-value elimination drops theme variables that nothing references, and a dropped
declaration leaves the runtime read returning nothing and the media query silently wrong —
failing open, at the width where the navigation disappears. The forcing directive is the
whole reason a single declaration is available at all.

**A width-gated style in the shell names the shell's breakpoint, never the framework's
generic medium size.** A `md:` reappearing in the sidebar family is the signal this decision
has been worked around rather than followed: it compiles, it renders, and it re-creates the
exact drift this removed.

**Input modality is never inferred from width.** The affordances that existed for fingers —
expanded hit areas, actions revealed without hover — were gated on how wide the window was, in
an application with no touch input and a window the user drags with a mouse. Width answers how
much room there is and nothing else.
