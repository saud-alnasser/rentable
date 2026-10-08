---
status: resolved
---

# fix(desktop): the dashboard's two rings sit on one line

## Outcome

The occupied units card heads itself with its label, as the collected card does, on a row as tall
as the period control, so the two progress rings line up across the band. Found by the human in
the running app on 2026-09-25.

## Acceptance Criteria

Traces requirement 6 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criterion 6.

- [x] The occupied units label sits at the top of its card and the two rings share one baseline,
      checked on a screenshot of the dashboard in both directions. Built in `landing.svelte` (the label heads the card, lines 202-216). Ticked on the human's word on 2026-10-09 ("all efforts are implemented"), after the effort merged as #833; the check itself is not recorded here.

## Relevant areas

- `apps/desktop/src/lib/dashboard/component/landing.svelte`
