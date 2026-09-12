---
status: open
---

# refactor(design): the input group matches the owned input

## Outcome

A field drawn through `primitive/input-group` has the geometry of a field drawn through
`primitive/input`: the same height, the same pill, the same fill, no border and no shadow, the
same focus and error rings. The first screen this effort drew showed the two side by side and they
did not match; after this, nobody can tell which primitive drew which.

## Acceptance Criteria

Traces requirement 15 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 15, under the exception
the spec's *Constraints* records for the design package.

- [x] `input-group.svelte`'s root carries `h-8`, `rounded-2xl`, `border-transparent` and
      `bg-input/50`, and none of `h-9`, `rounded-md`, `border-input`, `shadow-xs`; its focus and
      error rings are the input's (`ring-3`, `ring-ring/30`, `ring-destructive/20`). *Verified:
      `grep -c "h-9\|rounded-md\|border-input\|shadow-xs" input-group.svelte` printed `1`, the
      comment naming what went; the class string reads `rounded-2xl border border-transparent
      bg-input/50 ... hover:bg-input/60`, `h-8 has-[>textarea]:h-auto`, `ring-3 ... ring-ring/30`
      and `ring-3 ... ring-destructive/20`.*
- [x] `input-group-input.svelte` fills the group's height, so the input inside a bordered `h-8`
      group does not overflow it. *Verified: its class string opens with `h-full`, which
      `tailwind-merge` lets win over the input's `h-8`; on screen the wall's password field is
      32px tall to the pixel beside the 32px unlock button (capture of 2026-09-12 22:39).*
- [ ] On screen, the wall's password field and the no-workspace name field read as the same
      control as the fields on the rest of the app; captured and judged by the human.
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass. *Verified on the stack's tip on 2026-09-12:
      `pnpm check` in `packages/design` printed `2807 FILES 0 ERRORS 0 WARNINGS` and in
      `apps/desktop` `9268 FILES 0 ERRORS 0 WARNINGS`, `npx prettier --check .` printed `All
      matched files use Prettier code style!`, `npx eslint .` exited 0, `npx turbo run test --force`
      printed `Tasks: 4 successful, 4 total` (design vitest 58 passed, node:test 101 pass; desktop
      node:test 899 pass, vitest 57 passed). The root `pnpm check` wrapper cannot start in this
      worktree (pnpm 12.4.1 task-state path over Windows' limit with long paths off), so its
      pieces were run one by one.*

## Relevant areas

`packages/design/src/lib/primitive/input-group/{input-group,input-group-input}.svelte`, and
`packages/design/src/lib/primitive/input/input.svelte` as the geometry to match.

## Constraints

- **The package changes here and only here.** No slot, no prop, no variant: the root's classes
  and the inner input's height. The spec's *Constraints* names this exception and its reason.
- **No changeset names `@rentable/design`** (`references/changesets`); the change a user sees is
  described against `@rentable/desktop`.

## Notes

Raised by the human on 2026-09-12 after the first capture of the wall on the effort's tip, when
the password field through `input-group` sat beside a pill button and an owned input and matched
neither. The two consumers already landed (tickets 01 and 04) inherit it without a change.
