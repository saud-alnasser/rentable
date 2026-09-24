---
status: open
blocked-by: [02, 04, 06, 07, 14, 15, 16, 26, 28, 29, 30, 31, 32]
---

# test(desktop): every route walked in both directions and both appearances

## Outcome

Every route has been looked at in English and Arabic, light and dark, on the seeded workspace, with
screenshots attached to the pull request. Every act in the evidence inventory's [DIFF] list is
resolved or recorded in `[[rules/interface]]` as a stated exception. Whatever the walk finds is
fixed or ticketed.

## Acceptance Criteria

Traces requirements 6 and 22 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criteria 6 and 22(a).

- [ ] Screenshots of every route (dashboard, the three directories, each record page with its
      sections, settings' four sections, the wall, the walk and the join) in four combinations are
      attached to pull request 833.
- [ ] The [DIFF] list in
      [[efforts/832-the-interface-speaks-one-language-and-guides/evidence/research/how-the-app-does-each-act-today]]
      is copied into the pull request, and every line is ticked or points at its exception in the
      rule.
- [ ] `[[rules/interface]]` holds a section per act named in requirement 6.
- [ ] Findings become fixes on this ticket or new tickets. None is left in prose.

## Relevant areas

- the whole application. Launch with `pnpm prototype <route>` from `apps/desktop` in the run's
  worktree, with `CARGO_TARGET_DIR` on the main checkout's target.

## Constraints

- Ask before driving the app while the human is at the machine.
- The dev database syncs to the human's Turso workspace. Nothing destructive happens during the
  walk.
