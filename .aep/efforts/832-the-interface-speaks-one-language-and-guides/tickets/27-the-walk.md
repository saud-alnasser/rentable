---
status: resolved
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

- [x] Screenshots of every route (dashboard, the three directories, each record page with its
      sections, settings' four sections, the wall, the walk and the join) in four combinations are
      attached to pull request 833. Verified: the walk was driven through WebView2's debugging port with no pointer or keyboard input: 20 routes (dashboard, three directories, a no-match search, each record page and the contract's three sections, a payment, settings' four sections, not-found, an unknown route, and the two organization routes) in en and ar, light and dark, 80 screenshots, with the reader's settings restored after. GitHub's CLI cannot attach images, so they are published as one private page, https://claude.ai/artifact/2Gg8BXvnf7oqAgNzdCCtfX, linked from pull request 833. The organization walk and join redirect for a signed-in reader; they are the human's checks on 22 and 23.
- [x] The [DIFF] list in
      [[efforts/832-the-interface-speaks-one-language-and-guides/evidence/research/how-the-app-does-each-act-today]]
      is copied into the pull request, and every line is ticked or points at its exception in the
      rule. Verified: the [DIFF] list is copied into pull request 833 by ticket 31, 19 ticked with their ticket and 2 pointing at their exception.
- [x] `[[rules/interface]]` holds a section per act named in requirement 6. Verified: `rules/interface.md` holds the catalogue table and a section per act of requirement 6 (ticket 31).
- [x] Findings become fixes on this ticket or new tickets. None is left in prose.
 Verified: the first walk's 15 findings became tickets 28, 29, 30 and 32 (one withdrawn by its reviewer), and the second walk's with ticket 31's became ticket 33; none is left in prose.
## Relevant areas

- the whole application. Launch with `pnpm prototype <route>` from `apps/desktop` in the run's
  worktree, with `CARGO_TARGET_DIR` on the main checkout's target.

## Constraints

- Ask before driving the app while the human is at the machine.
- The dev database syncs to the human's Turso workspace. Nothing destructive happens during the
  walk.
