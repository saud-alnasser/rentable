---
status: resolved
blocked-by: [10]
---

# feat(organization): the link screen connects

## Outcome

The join screen is the connect screen: paste a link, it is read, the organization is recorded on
this machine, and the wall stands. No password is asked for on it, and the restore and refused
steps are gone.

## Acceptance Criteria

Traces requirement 18 and requirement 1 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 18 (the component half) and criterion 1.

- [x] `join-screen.svelte` has the steps `paste`, `inspecting`, `unreadable` and `unreachable`
      and no other; no input of type password renders on any of them; `grep -c "restore"
      join-screen.svelte` is zero. `paste` and `unreadable` carry the corner back to the wall;
      `inspecting` and `unreachable` to `paste`. *Verified 2026-09-13 on the effort branch: `grep -c "restore" join-screen.svelte` printed 0; `npx vitest run src/lib/organization/tests/join-screen.svelte.test.ts` printed 11 passed, holding the four steps, no password input, and one corner back per step with its destination.*
- [x] On a readable link, `onConnect(link)` is called and the route runs the connect port then
      `startup.standingChanged()`, which raises the wall naming the organization. Asserted in the
      component test and in `startup.test.ts` (a held organization with no member raises the wall
      as `locked`). *Verified: the same vitest run's submit case (`onConnect` with the pasted link); `node --import tsx --test src/lib/layout/tests/startup.test.ts` on the effort branch printed `pass 32, fail 0`, including the held-without-member case reaching the wall as `locked`.*
- [x] The strings for the removed steps are gone from both locales and the connect step's
      sentences are written in both. *Verified: the child's `grep` over `src` for the removed `join.*` keys printed 0 and its Arabic render case passed; the locales carry the connect step's sentences in both.*
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass. *Verified on the effort branch: `svelte-check` 9278 files 0 errors; the child's prettier, eslint, node:test (905) and vitest (87) runs are in its return.*

## Relevant areas

`apps/desktop/src/lib/organization/component/join-screen.svelte` and its test,
`routes/organization/join/+page.svelte`, `organization/join.ts`, `layout/startup.ts`,
`sync/admission.ts`, the locales.

## Constraints

- **Read [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]], *The connect screen*.**
- **A changeset rides with the change.**

## Notes

Landed 2026-09-13. What a later reader needs:

- **The route calls the host's `tauri.organization.connect(link)` and not the router's
  `organization.connect` procedure**, as the inspection it replaces called `linkInspect`. The
  screen branches on the Rust code of a refusal, `invalidInput` (the `unreadable` step) against
  everything else (`unreachable`, with the sentence as detail), and the tRPC caller wraps a
  host rejection in a `TRPCError` whose `code` is `INTERNAL_SERVER_ERROR` and keeps the Rust
  code only on `cause` (`@trpc/server`, `error/TRPCError.ts`, `getTRPCErrorFromUnknown`). The
  router procedure ticket 10 added stays, unused by a screen; a caller that wants it reads
  `error.cause`. `startup.ts` gained no port: the plan's shape is the route running the connect
  and then `standingChanged()`, which was already enough, since `sync/admission.ts` reads any
  held organization with no session as `locked` and never looked at the member.
- **A connect that succeeds reaches the shell whatever step is on screen.** The corner back is
  live during the read, so a person may be at the field when the answer lands; a refusal is
  written only over the wait it was asked for (ticket 03's rule), but a success has already
  recorded the organization, so the route goes to the way in and calls `standingChanged()`
  regardless. Leaving it to the step would have left a machine holding an organization under a
  wall still reading `noOrganization`.
- **The screen's props are `step`, `onConnect(link)` and `onBack`.** `onOpenLink` became
  `onConnect`, since submitting the field and pressing try again are the same act now;
  `isJoining`, `errorMessage`, `onJoin`, `onRestore` and `onSignInInstead` went with their
  steps. `join.ts` lost `inspected` and every `LinkFacts` read, so ticket 11's trimming of
  `LinkStanding` touches nothing here. The primary reads `common.actions.connect` with the
  walk's `PlugIcon`; the join namespace keeps `title`, `description`, `linkLabel`, `reading`,
  `unreadable`, `unreachable`, `tryAgain`, `back`, the first four rewritten in both locales.
- **Raised, not taken.** A `rentable://` link the operating system hands to a machine that
  already holds an organization still lands on this screen (`+layout.svelte` navigates to
  `THE_JOIN` on every arriving link); `connect` refuses it as `preconditionFailed` and the
  screen shows that as `unreachable` with Rust's sentence. Where an arriving link should go on a
  held machine is the shell's question, not this screen's.
- `THE_JOIN`'s one-line comment in `layout/shell-surface.ts` described the invitation and the
  password and was corrected; the address and its name are unchanged.
