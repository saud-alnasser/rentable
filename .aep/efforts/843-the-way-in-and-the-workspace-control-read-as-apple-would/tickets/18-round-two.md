---
status: resolved
blocked-by: []
---

# fix(desktop): what review round two found is closed

## Outcome

The first run's connect to an existing organization and a link arriving on the no-workspace screen
take no crossing, the plan and the frontend rule say what tickets 14 and 16 built, and the comments
and spacing the earlier fixes missed are corrected.

## Acceptance Criteria

Traces requirements 1, 4 and 9 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
and its criteria 1 and 9. From review round 2: correctness 1 and 2; standards 1 to 6.

- [x] The first run holds the address still while the owner is connected to an existing
      organization, as it does for a create, and lets go on a refusal; a component test drives a
      connect whose state refetch brings a session and finds no move before the loading. *Verified:
      `first-run.svelte.test.ts`, "connecting to an existing organization holds the walk until the
      loading, and lets go on a refusal", finds the step working and no `goto` while the connect is
      out, and the step back on a refusal. The mocked state does not refetch, so the test holds the
      hold rather than the race itself.*
- [x] `navigationCrossing` answers `null` on the no-workspace screen; a `node:test` covers a link
      arriving there. *Verified: "a link arriving on the no-workspace screen takes no crossing";
      `screen.test.ts` printed 33 pass.*
- [x] `plan.md` records `returning`, `navigationCrossing`, `holdWayInMotion`, `reducesMotion`, the
      settings page's `wayIn` and the existing-connect arrival, with the files they live in, and its
      count of departures is right. *Verified: three dated bullets for tickets 14 and 16, the
      as-built block's signatures, three file rows, and "eight places".*
- [x] `rules/frontend`: the `animate:flip` sentence is back in its paragraph, the way-in paragraph
      wraps at 100 columns, the `size-7` row aligns, and the reduced-motion paragraph is scoped to
      what it records. *Verified: read in place; the paragraph names the list's commit and why it
      reads no reduced-motion setting.*
- [x] `standalone-surface.svelte` says five screens throughout, with no sign-in example, and two
      neutral; `connect-screen.svelte`'s doc comment wraps at 100 columns; `loading.svelte` uses no
      spacing step off the ladder. *Verified: the comments corrected with dated notes; `awk` finds
      no comment over 100 columns in either file; `loading.svelte` uses `gap-2`.*

## Relevant areas

- `apps/desktop/src/lib/organization/setup/component/first-run.svelte`, `startup/screen.ts`
- `.aep/efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/plan.md`, `.aep/rules/frontend.md`
- `packages/design/src/lib/block/standalone-surface.svelte`, `connect-screen.svelte`, `loading.svelte`

## Notes

*Appended 2026-10-01 from review round 2, the last round; built by the orchestrator.*
