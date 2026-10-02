---
status: resolved
blocked-by: [01]
---

# feat(desktop): sync shows its state at a glance

Blocked by: 01

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The organization section's sync group is a state row on the shared blocks showing one of five named states with its own icon and tone, the last time Turso was reached on a line of its own, and *sync now*. Syncing is read from a small in-flight count kept where every run passes, as the plan's sync table gives it. The callouts and their acts sit under the state row; *open Turso dashboard* gains an icon.

## Acceptance Criteria

Traces requirement 12 and criterion 12.

- [x] `sync/activity.svelte.ts` counts runs through `syncWorkspaceNow` and is exported from `sync/ui.ts`; the button and autosync both pass through it. *Verified: `activity.svelte.ts` wraps `syncWorkspaceNow`'s body in `countRun`, `sync/ui.ts` exports `syncActivity`; grep finds the control (`query.ts`), autosync (`autosync.ts`) and startup (`startup/browser.ts`) all calling `syncWorkspaceNow`; `node --test` over sync status, workspace and autosync tests printed pass 18, fail 0, including the overlapping-runs count.*
- [x] `syncStatusOf` maps to the five states; `sync/tests/status.test.ts` covers each, including in flight over `synced` and over `neverReached`, and a problem keeping its state during a retry. *Verified: the same run: `status.test.ts` covers each of the five states, in flight over up to date and over not yet reached, a problem keeping its state during a retry, the tones and the en and ar words.*
- [x] `syncStandingSentence` splits into the state word and a last-reached line drawn whenever `lastReachedAt` is set. *Verified: the same run covers `syncStatusWord` and `syncLastReachedLine`, the line drawn whenever `lastReachedAt` is set.*
- [x] `organization/tests/standing.svelte.test.ts` drives each state and finds a distinct icon and tone, the last-reached line, *sync now*, and a callout under the state where one applies. *Verified: `vitest run organization/tests/standing.svelte.test.ts` printed 18 passed: a distinct glyph and tone per state, the last-reached line, the control (labelled *sync*, the act sync now, the human's 2026-09-17 naming kept), and each callout inside the row after the state word.*
- [x] The state's icon does not animate (the design package's motion test passes). *Verified: design `node --test src/lib/tests/motion.test.ts` printed pass 9, fail 0; the component test asserts no `animate-` class on the glyph.*

## Relevant areas

- `apps/desktop/src/lib/sync/{status.ts,workspace.ts,ui.ts}`
- `apps/desktop/src/lib/organization/component/standing.svelte`
- `apps/desktop/src/lib/sync/tests/`, `apps/desktop/src/lib/organization/tests/standing.svelte.test.ts`

## Constraints

- This is a user-visible change: it carries its own changeset ([[references/changesets]]).
- This reverses effort 828's requirement 25 at the human's choice of 2026-10-02; say so in `sync/status.ts`'s header.
