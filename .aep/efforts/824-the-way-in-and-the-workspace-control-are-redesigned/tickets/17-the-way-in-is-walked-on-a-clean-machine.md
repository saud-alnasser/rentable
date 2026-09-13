---
status: open
blocked-by: [12, 13, 14, 15, 16]
---

# refactor(organization): the way in is walked on a clean machine

## Outcome

Every string the second half of the effort added reads as written in both locales, nothing in the
tree names an email, a display name, a join or a restore where the spec retired them, and the
whole way in has been walked by hand on the human's machine after it forgot the old shape.

## Acceptance Criteria

Traces requirement 16, requirement 17, requirement 18, requirement 19 and requirement 20 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 16, criterion 17, criterion 18, criterion 19 and criterion 20 (the by-hand halves).

- [ ] A read of both locales for every string tickets 09 to 16 added, recorded under Notes with
      anything corrected; `grep` over `apps/desktop/src` and `apps/desktop/tauri/src` for
      `displayName`, `display_name`, `email`, `onJoin`, `onRestore` finds nothing but the retired
      sentences that say so.
- [ ] On the human's machine: the first launch forgets the two organizations and opens on the
      first screen; the walk creates an organization with a username and ends in the workspace;
      an account is made and its three facts copied; disconnect asks once and returns to the
      first screen; connect by the link reaches the wall; the username and handed password sign
      in and force the change. Recorded under Notes with times.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass.

## Relevant areas

Everything tickets 09 to 16 touched.

## Constraints

- **The by-hand walk is the human's to see**; the run drives the app and shows the captures.
