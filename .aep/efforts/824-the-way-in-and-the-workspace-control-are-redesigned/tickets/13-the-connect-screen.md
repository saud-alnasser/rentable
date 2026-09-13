---
status: open
blocked-by: [10]
---

# feat(organization): the link screen connects

## Outcome

The join screen is the connect screen: paste a link, it is read, the organization is recorded on
this machine, and the wall stands. No password is asked for on it, and the restore and refused
steps are gone.

## Acceptance Criteria

Traces requirement 18 and requirement 1 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 18 (the component half) and criterion 1.

- [ ] `join-screen.svelte` has the steps `paste`, `inspecting`, `unreadable` and `unreachable`
      and no other; no input of type password renders on any of them; `grep -c "restore"
      join-screen.svelte` is zero. `paste` and `unreadable` carry the corner back to the wall;
      `inspecting` and `unreachable` to `paste`.
- [ ] On a readable link, `onConnect(link)` is called and the route runs the connect port then
      `startup.standingChanged()`, which raises the wall naming the organization. Asserted in the
      component test and in `startup.test.ts` (a held organization with no member raises the wall
      as `locked`).
- [ ] The strings for the removed steps are gone from both locales and the connect step's
      sentences are written in both.
- [ ] `pnpm check`, `pnpm lint` and `pnpm test` pass.

## Relevant areas

`apps/desktop/src/lib/organization/component/join-screen.svelte` and its test,
`routes/organization/join/+page.svelte`, `organization/join.ts`, `layout/startup.ts`,
`sync/admission.ts`, the locales.

## Constraints

- **Read [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]], *The connect screen*.**
- **A changeset rides with the change.**
