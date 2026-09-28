---
status: resolved
blocked-by: [56]
---

# feat(desktop): permissions are groups that fold, and a workspace is access with its permissions beneath

## Outcome

The shared switch list is a list of groups that fold, each opening to its permissions with an
icon, a name and a line of what each allows. A workspace on a member's card is one access switch,
with its permissions folded beneath it, and no read only or reset buttons.

## Acceptance Criteria

Traces requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]] as amended a
fourth time.

- [x] Every group, each kind of record and administration, folds and opens from its head (glyph,
      name, how many are on, chevron). A folded head shows a difference or a refusal inside it.
- [x] Inside a group, each permission is a row with its own icon, its name and a one-line
      description, in English and Arabic, and its switch. The view dependency and the refusals
      keep their behaviour and reasons.
- [x] The role editor, a member's card and a workspace's permissions all draw this one list.
- [x] A workspace row is its access switch; beneath one that is in, a folded *permissions* row opens
      the record groups measured against the member's organization-wide permissions. No read only
      or reset button.
- [x] What is pinned is what differs from the organization-wide permissions when saved, so a switch
      turned back unsets it; a grant minted read-only still reads with its writes off; tests.
- [x] Unused strings retired; component tests updated; `pnpm check`, `pnpm test`, `pnpm lint` pass.
