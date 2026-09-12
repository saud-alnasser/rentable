---
status: open
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

- [ ] `organization/workspace-form.ts` exports the schema factory over `WORKSPACE_NAME_LIMIT` with
      the locale's messages, and `organization/component/workspace-fields.svelte` renders the one
      name field inside `input-group` with a muted leading glyph and `FieldError`, taking a
      `superform`.
- [ ] `layout/component/startup-no-workspace.svelte` renders the shared fields for the owner and
      a verb glyph on its create; the owner-only sentence for everybody else is unchanged. Its
      cases in `startup-sign-in.svelte.test.ts` assert the addon's `svg` and the button's `svg`.
- [ ] A test in `organization/tests/setup.test.ts` imports the factory and pins the over-limit
      message, so the two later consumers have one thing to equal.
- [ ] `pnpm check`, `pnpm lint` and `pnpm test` pass.

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
