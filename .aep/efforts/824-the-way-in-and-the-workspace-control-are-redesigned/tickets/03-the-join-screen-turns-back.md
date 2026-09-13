---
status: resolved
---

# feat(organization): the join screen turns back

## Outcome

Every step of the join screen can be left by a control in the card's corner: the paste and
unreadable steps return to the wall, every later step returns to paste. The "paste another link"
links are gone, and the screen's buttons and fields carry the vocabulary.

## Acceptance Criteria

Traces requirement 1, requirement 14 and requirement 15 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 1.

- [x] On `paste`, `unreadable`, `inspecting`, `password`, `restore` and `refused`, exactly one
      `getByRole('button', { name: back })` renders in the corner and its click calls `onBack`;
      `onPasteAnother` no longer exists and `grep` finds no "paste another" in the component.
      *Verified: `npx vitest run src/lib/organization/tests/join-screen.svelte.test.ts` printed
      `Tests 12 passed (12)`; the per-step case walks all seven kinds (`unreachable` too, which
      also carried the link), asserts one `getAllByRole('button', { name: back })` outside
      `[data-join-step]`, the arrow's `rtl:rotate-180`, and `onBack` called once; `grep -i -c "paste
      another" join-screen.svelte` printed `0`; `grep -rn "pasteAnother\|onPasteAnother"
      apps/desktop/src` printed nothing.*
- [x] The route's `onBack` goes to `THE_WAY_IN` from `paste` and `unreadable`, and to `paste`
      from every other step, keeping what `onPasteAnother` did there. *Verified by reading
      `routes/organization/join/+page.svelte`: `onBack` is `goto(THE_WAY_IN)` on `paste` and
      `unreadable`, else `refusal = null; step = paste`, the two lines `onPasteAnother` ran; routes
      are not rendered under vitest here.*
- [x] The unlock and restore buttons carry their verb glyph; the link, email and password fields
      carry muted leading glyphs through `input-group`. *Verified: the same run's glyph cases
      assert `svg` inside the unlock (`LockOpenIcon`) and restore (`RotateCcwIcon`) buttons, and
      for the link, email and both password inputs that `previousElementSibling` is
      `[data-slot=input-group-addon]`, holds an `svg`, and carries `text-muted-foreground`.*
- [x] `join.pasteAnother` is removed and `join.back` added in both locales. *Verified: `grep -n
      "back: '"` printed `en/index.ts:792 back: 'back'` and `ar/index.ts:767 back: 'رجوع'`;
      `pasteAnother` is absent from both locales and from `i18n-types.ts`, regenerated with
      `pnpm i18n --no-watch`.*
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass. *Verified on the stack's tip on 2026-09-12:
      `pnpm check` in `apps/desktop` printed `9268 FILES 0 ERRORS 0 WARNINGS` and in
      `packages/design` `2807 FILES 0 ERRORS 0 WARNINGS`, `npx prettier --check .` printed `All
      matched files use Prettier code style!`, `npx eslint .` exited 0, `npx turbo run test --force`
      printed `Tasks: 4 successful, 4 total` (desktop node:test 899 pass, vitest 57 passed). The
      root `pnpm check` wrapper cannot start in this worktree (pnpm 12.4.1 task-state path over
      Windows' limit with long paths off), so its pieces were run one by one.*

## Relevant areas

`apps/desktop/src/lib/organization/component/join-screen.svelte`, `routes/organization/join/`,
`organization/tests/join-screen.svelte.test.ts`, `organization/join.ts` for the step kinds.

## Constraints

- **Read [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]], *Back is SurfaceAction in the corner slot*.**
- **Nothing about what the link does changes**: inspecting, joining and restoring keep their
  calls; only where the screen can go and what its controls carry.
- **A changeset rides with the change.**

## Notes

Landed 2026-09-12. `unreachable` is a step kind neither the spec's requirement 1 nor this ticket
names, and it carried the same link; it takes the corner back to `paste` under "every step that
has somewhere to go". The old password and restore links were disabled while busy and the corner
back is not, since a disabled way past is a trap; a back mid-derivation lands on `paste`, and a
join that then completes still navigates to `THE_WAY_IN`. The generator also refreshed six
`@param` types and one quoted key in `i18n-types.ts` that the committed file had drifted from;
the run is idempotent. `back-glyph.svelte` (the arrow with `rtl:rotate-180`, since `SurfaceAction`
sets its icon's class itself) and `tests/providers.svelte` are seams ticket 02 shares.

**Review, 2026-09-13.** The correctness review found that an inspection in flight outran a back:
`inspect()` wrote its answer over whatever step was current, so a person who pressed back to the
field while the organization was being opened over the network was moved forward again when the
answer landed. The route now writes the answer only over the wait it was asked for, `inspecting`
on that link. Fixed here. The second round added the
case of the same link pasted again while its first inspection is out: only the latest inspection
begun writes its answer.
