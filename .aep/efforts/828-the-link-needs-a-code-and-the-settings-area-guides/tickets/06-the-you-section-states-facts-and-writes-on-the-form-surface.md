---
status: open
blocked-by: ['03', '04']
---

# feat(settings): the you section states facts and writes on the form surface

## Outcome

The you section draws the identity block, a password row whose change control opens the
change-password form on the shared form surface, the other-machines block, and an
another-machine block that makes a link and a code and shows them the way an invitation's
are shown. The sync section names the organization's own link as the owner's recovery copy
and points a member to their you section. One handover block draws a link and its code for
the invite result and the another-machine result alike.

## Acceptance Criteria

Traces requirements 3, 4 and 8 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 3,
4, 8 and 12.

- [ ] `organization/component/link-handover.svelte` is extracted from `invite-form.svelte`'s
      result panel: the organization name, the cannot-send callout, the link with one copy
      control, the code large with no copy control and the sentence that it is read out and
      never sent, the date the pair lapses, and the unreachable list where there is one; it
      takes `copied` and `onCopy` from its host. `invite-form.svelte` draws it, and
      `invite-form.svelte.test.ts` still passes.
- [ ] `organization/component/change-password-dialog.svelte` is a `FormSurface` of weight
      `light` whose body is the three fields and the floor sentence
      `change-password-form.svelte` draws today; `settings/component/area.svelte` draws under
      the password legend one row, the description and an outline `change password` button
      opening it; a change that went through closes and empties it, a refusal keeps it open
      with the handler's sentence. `change-password.svelte.test.ts` follows the form into the
      dialog.
- [ ] `organization/component/another-machine.svelte`, under a legend of its own after the
      other-machines block: a description and an outline button; pressing runs
      `useMakeMachineLink` and shows the pair in a `FormSurface` of weight `light` through the
      handover block with a `done` control; `area.svelte.test.ts` finds the control and, with
      the mutation faked, a link with one copy control and a code with none.
- [ ] `area.svelte.test.ts` finds no `input[type=password]` in the you section until the
      change control is pressed, then the form surface with three and the floor sentence.
- [ ] The sync section's link block carries a description naming the link as the copy that
      recovers the organization when every machine is gone and pointing a member to the you
      section, and the block is drawn for the owner alone as today; `area.svelte.test.ts`
      with an owner finds the sentence and with an administrator finds no link block.
- [ ] Every new or changed string is written in both locales; `pnpm check`, `pnpm lint` and
      `pnpm test` pass; the changeset of ticket 03 is extended.

## Relevant areas

`apps/desktop/src/lib/organization/component/{link-handover,change-password-dialog,change-password-form,another-machine,invite-form,organization-link}.svelte`,
`apps/desktop/src/lib/settings/component/area.svelte`, `apps/desktop/src/routes/settings/+page.svelte`,
`apps/desktop/src/lib/organization/query.ts`, the tests under `organization/tests` and
`settings/tests`, `apps/desktop/src/lib/i18n/{en,ar}/index.ts`.

## Constraints

- **Read [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/plan]], *The you
  section states facts and writes on the form surface*.**
- **[[rules/interface]], *Form surface* and *Validation errors***: the dialog is one
  component of declared weight, and a refusal marks its field.
- **The clipboard stays the host's**: the handover block reads none, which is what keeps the
  invite form's test renderable without one.
- **[[rules/frontend]]**: the route owns the mutation and hands the area a callback, as every
  other act in the area is handed.

## Notes
