---
owner: repository
status: implemented
sources:
  - src/lib/design/block/form-surface.svelte
  - src/lib/design/primitive/form/
  - src/lib/design/primitive/dialog/
  - src/lib/design/primitive/sheet/
  - src/lib/tenant/component/form.svelte
  - src/lib/contract/component/form.svelte
  - src/lib/complex/component/form.svelte
  - src/lib/payment/component/form.svelte
---

# feat: forms get one surface, and it answers the window

Closes the last entry on [#211](https://github.com/saud-alnasser/rentable/issues/211)'s *Not yet
specified* list — *"The forms, in detail"* — and answers the question left open on #250's
blocked note: whether a concept's surfaces diverge per operation as well as per concept.

## Problem

**The field layer is already right and is not the problem.** `design/primitive/form/` wraps
formsnap over `sveltekit-superforms` and `zod`, and all four concept forms import it.

**The container layer is the problem, and it is the list problem one layer up.** One block
(`form-sheet.svelte`) is used by exactly one form. The other three reach for `Dialog` directly
and hand-roll the same four things each time — panel, header, scrolling body, footer:

| Form | Container | Lines | Header / body / footer |
| ---------- | ------------------ | ---: | ---------------------- |
| tenant | `FormSheet` block | 242 | owned by the block |
| contract | `Dialog` directly | 702 | hand-rolled |
| complex | `Dialog` directly | 139 | hand-rolled |
| payment | `Dialog` directly | 220 | hand-rolled |

Three copies of one layout, and a block whose documentation says it is *"the side sheet every
create and edit form opens in"* when it serves one of four.

**Nothing answers the window.** A form is a sheet or a dialog because of which module it
imported. A 4-field complex form occupies a full-height sheet as readily as the 702-line
contract form occupies a 672px dialog, and neither changes when the window does. The supported
range starts at 640×480, where a centred dialog with a 702-line form inside it has nowhere to go.

## Goal

One form surface, owned by the design system, that presents itself according to the window and
the form's own weight — and a form supplies fields, never a container.

## Constraints

- **The surface is one component, not two swapped.** `sheet-content.svelte` and
  `dialog-content.svelte` both wrap `Dialog` from bits-ui; a sheet here is a dialog with
  different positioning. Presentation therefore changes in CSS, on one mounted subtree.
- **Nothing is lost when the window crosses a breakpoint** — typed values, validation errors,
  scroll position and focus all survive, because nothing unmounts. This is the constraint the
  single-component rule exists to satisfy; an implementation that swaps components and restores
  state by hand has failed it, however well it restores.
- **Supported range 640×480 upward**, and both locales. The surface enters from the inline-end
  edge, mirroring with the locale, as `form-sheet` already does.
- **Motion follows [ADR 0016](../decisions/0016-motion-responds-and-uses-what-is-installed.md).**
  Opening and closing are triggers, so they animate; the presentation changing under a resize is
  not a trigger the user aimed at, and does not.
- **The field layer is not rewritten.** formsnap, superforms and zod stay exactly as they are.
- **Generated primitives are edited by hand, never regenerated**, and any primitive this touches
  takes Rhea's geometry ([ADR 0007](../decisions/0007-rhea-geometry-is-hand-ported.md), #211).

## Architecture

**One surface, two presentations, chosen by weight then checked against the window.**

`design/block/` holds the surface. It owns the panel, the `form` element, and the three bands
inside it — header, scrolling body, footer — exactly as `form-sheet` does today. What it gains
is a **presentation** it computes rather than inherits:

```
weight     the form declares light or heavy — a property of the form, not the window
window     narrow (< md) or wide (>= md)

           light + wide    → centred panel, sized to content
           light + narrow  → centred panel, full width less margin
           heavy + wide    → edge sheet, full height
           heavy + narrow  → edge sheet, full width
```

The four cells are two presentations, and the rule is one sentence: **a heavy form gets the
sheet, a light form gets the centred panel, and narrow makes either one fill the width it has.**
Weight is declared because the alternative — measuring the form — makes the surface reflow while
the user types.

The seam is the same one [ADR 0013](../decisions/0013-list-presentation-is-per-concept.md) drew
for lists, and stating it that way is the point: **the shell owns the mechanism, the concept
supplies what is inside.** Above the seam is the panel, the bands, the scroll container, the
error summary placement, the action row and the motion. Below it are fields and buttons.

The axes differ, and conflating them is the failure mode to watch: **lists diverge per concept;
forms diverge per viewport and weight.** A form surface that grows a per-concept prop has
adopted the wrong axis, and that is the signal to come back here rather than add the flag.

## Approach

The surface first, since four forms consume it, then one form at a time — lightest first, so the
surface is proven on the simple cases before the 702-line one lands on it. Each form moving is
demonstrable on its own and leaves the tree green.

The contract form goes last and is the only one that is not a move. At 702 lines it is the form
#211 could not specify without density values, and those now exist
(`.claude/evidence/research/rhea-geometry-scale.md`). What its interior becomes — sections,
progressive disclosure, or a split — is a decision only partial code can answer, so it is a
declared increment rather than a guess made here.

### The tickets

Cut under root #276.

| # | Ticket | Blocked by | Carries |
| --- | --- | --- | --- |
| #277 | feat: build the form surface | — | the presentation rule, both bands, motion, RTL; replaces `form-sheet` |
| #278 | refactor: move the tenant form onto the form surface | #277 | proves the sheet path on the form already using a block |
| #279 | refactor: move the complex and payment forms onto the form surface | #277 | proves the centred path, and deletes two hand-rolled dialogs |
| #280 | feat: rebuild the contract form on the form surface | #277 | the 702-line form; increment: what its interior becomes (`prototype`) |

#278 and #279 are independent of each other and may run in either order or together; both need
only #277. #280 is blocked by #277 alone, but is sequenced last by intent rather than by edge —
landing it before the surface has been proven on a simple form puts the hardest case on the
least-tested mechanism, which is how #250 failed one layer up.

## Acceptance criteria

- A form declares its weight and supplies fields; no concept component imports `Dialog` or
  `Sheet`, and none renders a header, footer or scroll container of its own.
- Resizing the window across the `md` breakpoint mid-form changes the presentation and loses
  nothing — values, errors, scroll position and focus all survive.
- Every form holds from 640×480 upward, in both locales, in both directions.
- Opening and closing animate; the presentation changing under a resize does not.
- `form-sheet.svelte` and the three hand-rolled dialog containers are gone when 04 lands.

## Risks

- **The surface grows a prop per form.** The same risk the list shell carries, and the same
  detection: a prop that serves exactly one concept means the axis is wrong. It goes back to
  design rather than into a flag.
- **The contract form is not a move and may not fit the surface.** It is the one case that could
  invalidate the architecture, which is why it is last and why its interior is a declared
  increment — the failure mode #250 hit is the failure mode to avoid repeating.
- **"Weight" becomes taste.** Two values, declared per form, with the rule written down. If a
  third value is proposed, that is the signal the axis is wrong.

## Out of scope

- **The field layer.** formsnap, superforms and zod are untouched.
- **Validation rules and domain schemas.** Nothing about what a form accepts changes.
- **The delete confirmation** (`delete-dialog.svelte`), which is a confirmation rather than a
  form and takes no fields.
- **The lists.** #250 remains blocked pending its own redesign, and nothing here depends on it.
