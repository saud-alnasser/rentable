---
status: accepted
load-when: a form reports validation errors
sources: [src/lib/design/block/field-error.svelte, src/lib/design/primitive/form/]
supersedes: []
superseded-by: []
---

# A validation error belongs to its field, not to a summary the surface places

Every form in the application used to report validation the same way: an empty
`<Form.Description />` under each control, and one callout at the foot of the sheet listing every
message. That callout named the problem and never the field. A user reading *cost per cycle must
be greater than zero* had to map it back to a control themselves, and the mapping gets harder
exactly as it matters more — the contract form has seven fields and the summary sat below all of
them.

`Form.FieldErrors` had been in `design/primitive/form/` the whole time and **no form imported
it.** The mechanism for doing this properly already existed and had never been wired up.

An error now marks its own field: the destructive border and ring the control primitives already
draw from `aria-invalid`, plus an icon on the label line, with the message revealed on hover or
focus. `design/block/field-error.svelte` is that treatment, and all five forms use it. The
summary callout is gone, and `form-errors-summary.svelte` was deleted with it.

Two properties of the treatment are load-bearing rather than decorative, and an implementation
that drops either has not implemented this decision:

- **The mark is always visible.** An error whose only evidence is a hover is one a keyboard or
  touch user never learns about. The ring and icon say *which* field; the reveal says *what*.
- **The message keeps the id `Form.FieldErrors` generates**, so it stays wired to its control for
  a screen reader whether or not anything is pointing at it.

## Where the seam moved

[`form-presentation-spec.md`](../designs/form-presentation-spec.md) put *the error summary
placement* above the seam, among the things the shell owns.
[ADR 0017](0017-a-form-surface-is-one-component.md) is why that mattered: **forms diverge per
viewport and weight, never per concept**, so an error presentation belonging to one form would be
the wrong axis and the signal to come back to design.

That is what happened. The treatment was settled by looking at one form, and adopting it there
alone would have made the contract form the only one of five presenting errors that way.

The seam did not need to move to accommodate it — the entry above it did. There is no summary to
place, so *the error summary placement* is no longer a thing the shell owns. A field and the
message about that field are both **inside**, which is the concept's side of the same seam, and
they are uniform across all five forms because the treatment is shared rather than because the
surface enforces it. The axis in ADR 0017 is untouched: nothing here varies per concept, and the
form surface gained no prop.

## Considered Options

**Keep the summary and add field errors as well** — rejected. It says the same thing twice, once
where the user is looking and once where they are not, and the duplicate is the one that has to
be scrolled to. It also leaves the summary as a thing the shell places, which is only worth
paying for if it earns its position.

**Adopt it in the contract form alone and let the others follow** — rejected, and this is the one
the work was on course for. It is the per-concept divergence ADR 0017 exists to prevent, and
"the others follow later" is a state nobody schedules. Four forms with eleven fields between them
is not enough work to justify shipping an application that reports errors two ways.

**Reveal the message on hover only, with no persistent mark** — rejected on accessibility rather
than taste. Hover does not exist on touch and is not reachable by keyboard, so the presence of an
error would depend on a gesture some users cannot make. The persistent mark is what makes the
reveal a progressive disclosure rather than the only channel.

**A tooltip primitive on each control** — rejected. bits-ui's tooltip trigger is focusable, which
adds a tab stop per errored field, and the thing the user wants to reach by tabbing is the
control that is wrong rather than the note about it.

## Consequences

**`aria-invalid` is now load-bearing on every control.** A control that does not set it renders
no border, no ring, and no evidence of the error but the icon. Anything that restyles a control's
border has to keep the `aria-invalid` rules winning — the contract form's inset treatment had to
restate them explicitly to survive its own transparent border.

**A field carries `group relative` or its error does not appear.** The reveal is
`group-hover`/`group-focus-within` and the positioning is absolute. This is a contract stated in
prose that nothing enforces, and it is the most likely way a sixth form adopts this incorrectly.

**A form-level error has nowhere to go.** Every message today is field-scoped — no schema-level
`refine`, no pathless `setError` — and the failures that are not field-scoped already reach the
user as a toast. A future validation that genuinely belongs to the form rather than to a field
needs somewhere to land, and that is a return to design rather than a quiet reinstatement of the
callout.
