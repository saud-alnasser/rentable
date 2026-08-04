# What should the contract form's interior become — sections, progressive disclosure, or a split?

Verified against: Svelte 5.56.8 / SvelteKit 2, bits-ui 2.18.1, Tauri 2, in the running desktop app, 2026-08-04
Conclusion: Successful

The declared increment on [#280](https://github.com/saud-alnasser/rentable/issues/280),
reached once the form rendered on the shared surface with real data. It opened as one
question and closed as four: the arrangement was settled on the first look, and each answer
exposed the next question underneath it.

## Hypothesis

#280 declared the increment with three candidate answers, against evidence only visible once
the form was on the surface: the old dialog was `sm:max-w-2xl` (672px), the heavy surface is
`md:max-w-lg` (512px) and does not widen above `md`, and the interior was a two-level nested
grid — both levels `md:grid-cols-2`, both keyed off the viewport rather than the container —
holding seven fields in one flat block.

The expectation was **progressive disclosure**: 160px had been taken away, the interior was
laid out for the width it no longer had, and steps are the arrangement that answers a width
problem by refusing to need the width. Sections were expected to read as today-with-headings.

That expectation was wrong, and wrong in an interesting direction — see below.

## Method

Sub-shape A: the variants rendered inside the real contract form, on the real `FormSurface`,
against the user's own contracts and tenants. The seven fields were extracted into shared
snippets first, so every variant rendered the same seven and the comparison was between
treatments rather than between rewrites.

Two pieces of tooling were built for this run and kept, since neither is throwaway:

- `pnpm prototype <route>` opens the desktop app with its window on one route. It merges an
  override over `tauri.conf.json` through `tauri dev --config` rather than editing the tracked
  file, so a killed run cannot leave a dev URL behind.
- `src/lib/prototype/switcher.svelte`, a `dev`-only bar. Its selection is remembered per
  prototype name, and several bars stack rather than overlap, which is what let two
  independent questions run in one session.

**Two defects in the switcher had to be fixed before anything could be judged**, and both are
general to any prototype mounted inside a modal:

- bits-ui dismisses a modal from a **bubble-phase `pointerdown` on `document`**
  (`use-dismissable-layer.svelte.js:90`), so clicking the bar counted as a click outside and
  closed the surface under test. Stopping the event at the bar keeps it off the document.
- an open modal sets `document.body.style.pointerEvents = "none"`
  (`internal/body-scroll-lock.svelte.js:129`), so the bar took no clicks at all until it
  declared `pointer-events-auto`.

Keyboard shortcuts were tried and abandoned: focus inside a modal form is always in a field,
so bare arrow keys are typing, and every modifier combination that survives that is one the
webview or Windows may already own. The arrows on the bar are the control.

Four rounds, each starting from the previous answer:

1. **arrangement** — sections / steps / split
2. **field treatment** — raised card / inset wells / carved rows
3. **reaching a tenant** — popover-empty-until-typed / popover-opens-on-the-list / inline, no overlay
4. **where an error goes** — under the field / floating bubble / red field with the message on hover

## Result

**Round 1 — split wins; steps lose on a reason the mockup could not show.** Splitting the form
into steps hides the dependency between the fields: the end date is computed from start, cost
and cycles, and stepping puts those on three different screens, so you set the inputs and only
meet what they produced a step later. Sections did read as today-with-headings. The split — a
live read-out of tenant, total (`cost × cycles`) and period as a range, pinned above the fields
that decide it — was the only variant that answers *did I get this right*, which the form has
never answered.

**Round 2 — inset wins.** Fields cut into the surface rather than boxed on top of it: no border
of their own, a darker fill, an inner shadow along the top edge. The raised card reads as a
form pasted onto a sheet; carved rows dissolved the fields into a settings list and lost the
sense that anything was editable.

**Round 3 — the popover should open on the tenants.** The finding that decided it is not visual:
`useFetchTenants` already fetches every tenant into memory and `tenantOptions` filters that list
client-side, so the *start typing to search* empty state costs a round trip of nothing and buys
nothing. Opening on the list and letting typing filter it removes a gesture from the field that
matters most. The fully inline search — no overlay at all — lost on space: it is permanently
open, and 512px of width has no room for a results list that never collapses.

**Round 4 — the error belongs to its field, shown on hover.** The starting finding here is a
defect: `Form.FieldErrors` exists in `design/primitive/form/` and **no form in the application
imports it.** All five render an empty `<Form.Description />` and rely on the summary callout at
the foot of the sheet, which names the problem but never the field. The chosen treatment marks
the field permanently — destructive border, ring, and an icon on the label line — and reveals
the message on hover *or focus*.

Two things about that treatment were deliberate rather than incidental, and an implementation
that drops either has not implemented it:

- **the mark is always visible.** An error whose only evidence is a hover is one a keyboard or
  touch user never learns about. The ring and icon say *which* field; the tooltip says *what*.
- **the message keeps the id `errorProps` carries**, so it stays wired to its control for a
  screen reader whether or not anything is hovering.

**One hazard for whoever implements this.** The inset treatment sets `border-transparent` at a
descendant-selector specificity that **outranks** the `aria-invalid:border-destructive` every
control primitive already carries, so the invalid state silently disappeared. It has to be put
back explicitly at equal specificity. Anything that restyles a control's border inherits this
trap.

## Limitations

- **Only the contract form was looked at.** The other four forms were not, and three of the four
  answers are not contract-specific: the inset treatment, the error treatment, and the unused
  `Form.FieldErrors` are properties of the design system.
- **Arabic and RTL were not exercised.** The treatments use logical properties throughout, but
  that is a claim about the code rather than an observation of the rendering.
- **Dark mode is not a limitation, and recording it as one was an error.** There is only one
  theme: `src/app.html` sets `class="dark"` statically, nothing toggles it, and `app.css`
  defines the variant as `&:is(.dark *)`, which therefore always matches. Everything above was
  looked at on the only surface the application has. Corrected here rather than left standing,
  because a limitation that is not real invites work to remove it.
- **640×480 was not exercised**, so #280's criterion that the form holds from that floor upward
  without a horizontal scrollbar remains unverified — it was unverified before this prototype
  and this prototype did not touch it.
- **The read-out shows the total unformatted.** Currency formatting was out of scope for looking
  at a layout and is not evidence that the number should be rendered that way.
- **Nothing was measured.** Every answer here is a judgement made by looking, which is what the
  prototype branch is for; none of it is a performance or accessibility result.

## Conclusion

Successful, and the increment is answered: the interior is a **split** — a live read-out of what
the contract will be, above the fields that decide it — with the fields **inset** into the
surface, the tenant popover **opening on the tenants**, and a field's error marking the field
with the **message on hover or focus**.

Not *steps*, which was the expected answer, because the objection to them is structural rather
than aesthetic: the seven fields are not seven independent answers, and any arrangement that
separates start, cost and cycles from the end date they produce hides the one relationship the
form exists to get right. That reasoning survives whatever the width turns out to be, which is
why the answer is not merely a preference between three pictures.

Not recorded as a Decision: three of the four answers are treatments the design system will
either adopt or not, and that adoption is a wider question than one form's interior. Promoting
any of them is a fresh implementation effort — the prototype's code informed it and was deleted.
