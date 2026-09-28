---
status: open
blocked-by: [56]
---

# feat(desktop): a roles card says little

## Outcome

A roles card in the settings area is quiet: the role's name, how many hold it, and one plain line
of what it can do. The detail is the role editor's.

## Acceptance Criteria

Traces requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]] as amended a
fourth time.

- [ ] A card shows the role's name, its holder count and one line summarising what it can do, in
      plain words, in English and Arabic; no per-kind rows of glyphs and levels.
- [ ] The order, the search, the sort, opening a role and every refusal on the card keep their
      behaviour.
- [ ] Unused strings and helpers retired; component tests updated; `pnpm check`, `pnpm test`,
      `pnpm lint` pass.
