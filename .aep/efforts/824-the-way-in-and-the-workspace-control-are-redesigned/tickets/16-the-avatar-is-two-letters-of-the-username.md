---
status: resolved
blocked-by: [09]
---

# feat(layout): the avatar is two letters of the username

## Outcome

The rail's account control and each members row draw the first two characters of the username,
upper-cased, in the avatar.

## Acceptance Criteria

Traces requirement 24 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 24.

- [x] `accountInitials` reads the username and returns its first two characters upper-cased,
      padding a shorter string rather than throwing; `account-menu.svelte` calls it with
      `session.username` and shows the username where the display name was. Asserted in the
      sidebar's test. *Verified 2026-09-13 on the effort branch: `node --import tsx --test src/lib/sync/tests/account.test.ts` printed `pass 3, fail 0`; `npx vitest run src/lib/layout/tests/account-menu.svelte.test.ts` in the same run printed 2 passed, asserting the fallback reads `OL` and the trigger names the username.*
- [x] Each members row renders the same avatar with the member's initials. Asserted in
      `members.svelte.test.ts`. *Verified: `npx vitest run src/lib/organization/tests/members.svelte.test.ts` printed 5 passed, the new case reading `OL`, `AD`, `SA` on three fallbacks.*
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass. *Verified: `svelte-check` on the effort branch printed `9277 FILES 0 ERRORS`; the child's prettier, eslint, node:test (904) and vitest (82) runs are in its return.*

## Relevant areas

`apps/desktop/src/lib/layout/component/account-menu.svelte`, `sync/account.ts` (`accountInitials`),
`organization/component/members.svelte`,
`packages/design/src/lib/primitive/avatar/` (read, not changed).

## Constraints

- **The design package is read and not changed.**
- **A changeset rides with the change.**

## Notes

Built 2026-09-13. What a later reader needs:

- **`accountInitials` pads to two with its `fallback`**, which defaults to `?`: `'a'` draws `A?`
  and an empty, null or undefined source draws `??`. The old function drew one `?` for an empty
  source and one letter for a one-letter word; nothing asserted either. The whole of the old
  word-splitting is gone: `ada lovelace` draws `AD` now, since a username has no space in it.
- **Two other callers were not touched and now draw the new pair.** `organization/component/identity.svelte`
  still hands `session.username || session.organizationName` (the identity block is ticket
  15's), and `workspace/component/members.svelte` already drew the disc this ticket adds to the
  organization's list, at `size-10 rounded-full` with `text-xs`; the new cell copies it so the
  two lists read alike.
- **The rail has no sidebar test**, so criterion 24's rail half is read in a new
  `layout/tests/account-menu.svelte.test.ts`, rendered through `rail-providers.svelte`. It
  carries its own copy of `workspace-menu.svelte.test.ts`'s `inAWideWindow` stub (the shell
  breakpoint and `ResizeObserver` jsdom lacks); lifting that into `layout/tests/` scaffolding
  would touch the other test, so it is left as a seam.
- **Ticket 12's row action lands outside the cell.** The avatar sits inside `Field.Content`'s
  new flex wrapper; the actions `div` beside it is untouched.
- **Two comments in `account-menu.svelte` still say "the name and the address"** (the second
  docstring, and the comment over the menu's heading). Ticket 09 removed the address; the
  sentences are stale and were left, since this ticket changes nothing else in the menu.
