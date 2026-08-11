---
owner: repository
status: accepted
load-when: a primitive is being regenerated, added, or restyled
sources: [src/lib/design/primitive/]
supersedes: []
superseded-by: []
---

# Rhea's geometry is hand-ported, and the primitives are a permanent fork

shadcn-svelte's Rhea style (May 2026) is the density this interface is being rebuilt toward —
smaller spacing, denser surfaces, built for focused product interfaces — but the documented way
to adopt a style is `init --reinstall`, which replaces the primitive files. More than thirty
files across eighteen primitive families here read the i18n store for translated strings and for
`dir`; a regenerated file carries neither, still compiles, and renders silently English and
silently LTR. Rhea's geometry is therefore transcribed by hand onto the existing primitives,
applied together with the black-and-blue palette, and `design/primitive/` is accepted as a
permanent fork of upstream rather than a generated tree.

## Considered Options

**Install Rhea through the CLI** — rejected. It is the one operation that silently breaks Arabic
and RTL across eighteen families, and the breakage renders rather than errors, so it would reach
users. No amount of care at the call site helps: the damage is inside the replaced files.

**Adopt Rhea through CSS variables only** — rejected as insufficient. Rhea adjusts component
geometry and density directly, in the component class strings, rather than by multiplying
variables — deliberately, so that Tailwind's utility scale keeps meaning the same thing across
styles. There is no variable-only subset that produces it.

**Stay on the current geometry and change only the palette** — rejected. Density is the point of
the overhaul, not a side effect of it; a black repaint over 360px cards does not deliver it.

## Consequences

No shadcn-svelte style can ever be installed here, and this is now true permanently rather than
for this effort. Upstream geometry changes have to be read and applied by hand if they are wanted
at all.

`add` for a genuinely new primitive still works and stays safe — but it arrives in upstream's
default style, not Rhea's, so fitting it to the surrounding geometry is part of adding it, in the
same way wiring it to the i18n store already is.
