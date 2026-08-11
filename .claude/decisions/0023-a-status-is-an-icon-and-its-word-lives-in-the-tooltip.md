---
owner: repository
status: accepted
load-when: a status is rendered, or a status is added to the model
sources: [src/lib/design/cell/status.svelte]
supersedes: []
superseded-by: []
---

# A status is an icon, and its word lives in the tooltip

A status was a translated word in a badge, and the sentence saying what that word *means* was
written for the six contract statuses and shown in exactly one place — a detail header reached
after the scanning is over. **A status now renders as an icon carrying no visible text; its
name and its description reach the reader through a tooltip and an accessible label.** The
trade is density and glanceability against a meaning that is available only on hover: the row
stops spending width on a word most readers already recognise by position, and the reader who
does not recognise it gets a full sentence instead of a single word. This binds every surface
showing a status, and the vocabulary is nine — the six contract statuses, `occupied`, `vacant`,
and `overdue` — so the three without a description gain one.

## Considered Options

**Icon and text together, tooltip on the icon.** Legible without hover, scannable without
learning the glyphs, and the safe answer. Rejected because it does not replace the status, and
replacing it is what was asked for. It remains the cheap retreat if the glyphs fail: the
treatment is one component and restoring the word is additive.

**Icon alone in lists, icon and text in detail views.** Rejected because the same status would
then look like two things depending on where it was met, which is the divergence the
one-treatment-everywhere rule exists to prevent.

## Consequences

**A status is unreadable to a pointer user who does not hover, and to a touch user at all.**
Accepted knowingly. It is bounded by the fact that this application has no touch input, and it
is not an accessibility regression — the accessible name is on the element, so a screen reader
gets more than the badge ever gave it.

**A surface that suppresses pointer events suppresses the meaning.** The work queue lays its
click target over content with pointer events disabled; a status there must be exempted the way
the phone number already is, or its tooltip silently never fires. A surface that renders the
treatment inside such an overlay and does not exempt it has shipped a status nobody can read.

**Nine glyphs must be told apart at a row's icon size**, including two pairs of contract
statuses that differ only by whether the contract is paid in full. Whether that holds is not
answerable from a description, so the ticket that builds it carries a `prototype` increment.

**The contract detail header's private status map goes.** It carried its own variant table and
its own description table beside the shared treatment's; folding the description into the shared
one leaves a single home, which is the second reason to make this change and not a side effect.
