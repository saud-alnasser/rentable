---
status: resolved
---

# refactor(organization): the workspace form is one definition

## Outcome

Naming a workspace is one schema and one fields component, and the three places that draw it
(the no-workspace surface today, the walk's third step and the dialog later) read the same limit
and refuse with the same message. The no-workspace surface is the first consumer and takes the
field glyph and the verb glyph with it.

## Acceptance Criteria

Traces requirement 8, requirement 13 and requirement 15 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 8, criterion 13
and criterion 15.

- [x] `organization/workspace-form.ts` exports the schema factory over `WORKSPACE_NAME_LIMIT` with
      the locale's messages, and `organization/component/workspace-fields.svelte` renders the one
      name field inside `input-group` with a muted leading glyph and `FieldError`, taking a
      `superform`. *Verified: `workspaceFormSchema(translations)` in `workspace-form.ts` imports
      `WORKSPACE_NAME_LIMIT` from `$lib/workspace/workspace` (where the limit lives; the ticket
      placed it in the organization module) and builds `{ name }` with `workspace.nameRequired`
      and `workspace.nameTooLong`; `workspace-fields.svelte` takes `superform: SuperForm<WorkspaceForm>`
      and renders `InputGroup.Root > Addon(svg) + Input` then `FieldError`; `pnpm check` in
      `apps/desktop` printed `0 ERRORS`.*
- [x] `layout/component/startup-no-workspace.svelte` renders the shared fields for the owner and
      a verb glyph on its create; the owner-only sentence for everybody else is unchanged. Its
      cases in `startup-sign-in.svelte.test.ts` assert the addon's `svg` and the button's `svg`.
      *Verified: `npx vitest run src/lib/layout/tests/startup-sign-in.svelte.test.ts` printed
      `Tests 10 passed (10)` on the stack's tip; the owner case asserts
      `[data-slot=input-group-addon] svg`, the addon's `text-muted-foreground`, the group holding
      `input[name=name]` and the create button's `svg`; the Arabic non-owner case asserts no input
      and the `ownerOnly` sentence.*
- [x] A test in `organization/tests/setup.test.ts` imports the factory and pins the over-limit
      message, so the two later consumers have one thing to equal. *Verified: `node --import tsx
      --test --experimental-test-module-mocks src/lib/organization/tests/setup.test.ts` printed
      `tests 7, pass 7, fail 0`; the new case builds the schema with `i18nObject('en')` and `ar`
      and asserts the over-limit and required messages and the trimmed bound.*
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass. *Verified on the stack's tip on 2026-09-12:
      `pnpm check` in `apps/desktop` printed `9268 FILES 0 ERRORS 0 WARNINGS` and in
      `packages/design` `2807 FILES 0 ERRORS 0 WARNINGS`, `npx prettier --check .` printed `All
      matched files use Prettier code style!`, `npx eslint .` exited 0, `npx turbo run test --force`
      printed `Tasks: 4 successful, 4 total` (desktop node:test 899 pass, vitest 57 passed). The
      root `pnpm check` wrapper cannot start in this worktree (pnpm 12.4.1 task-state path over
      Windows' limit with long paths off), so its pieces were run one by one.*

## Relevant areas

`apps/desktop/src/lib/workspace/component/rename-form.svelte` is the model for a superforms
schema built at component time with the locale's messages, and for `insetControl` on a field.
`apps/desktop/src/lib/layout/component/startup-no-workspace.svelte` is the first consumer.
`packages/design/src/lib/primitive/input-group/` is read, not changed.

## Constraints

- **Read [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]], *The workspace form is one definition*.** One Svelte component is not the shape;
  the schema and the fields are.
- **The no-workspace surface stays dumb**: props and callbacks, rendered in its test with no
  provider, as `startup-sign-in.svelte.test.ts` renders it today. The mutation stays in the
  layout, which hands it the query client (#823).
- **[[rules/interface]], *Validation errors*: the field glyph is not the error glyph.**
- **A changeset rides with the change**, against `@rentable/desktop`.

## Notes

Lands first because tickets 02 and 06 both build on it, and a form either of them wrote first
would be replaced by the other.

Landed 2026-09-12. Two things the build found, neither taken here: a superforms SPA submit cannot
be fired under the desktop's vitest runner (`use:enhance` reaches SvelteKit's `applyAction`, which
needs a kit client root the runner never mounts), so tickets 02 and 06 pin the schema rather than a
rendered submit; and `organization/router.ts` bounds `workspace.create` with
`ORGANIZATION_NAME_LIMIT` rather than `WORKSPACE_NAME_LIMIT` (both 120 today).
