---
status: open
---

# feat(organization): a choice of four or fewer takes a segmented control

## Outcome

No form uses a select for a choice of four or fewer options. A member's role, a workspace's access
and the language take the toggle group the field-kind map gives such a choice, the way Apple's
guidelines use a segmented control for a few mutually exclusive options. Where an option needs a
description line, it moves under the control, for the option chosen.

## Acceptance Criteria

Traces requirement 15 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criterion 15. Left open by ticket 18.

- [ ] The role select and the access selects in `account-form`, `member-sheet` and `access-dialog`,
      and the settings locale select, are toggle groups. Their tests drive the new control and keep
      today's gates.
- [ ] A lint or component test fails on a `Select` whose options number four or fewer.
- [ ] `[[rules/interface]]` *Field kinds* states the rule with the Apple guideline it follows.

## Relevant areas

- `apps/desktop/src/lib/organization/component/account-form.svelte`, `member-sheet.svelte`,
  `access-dialog.svelte`, `settings/component/locale.svelte`, `primitive/toggle-group/*`

## Constraints

- Owner-only and permission-gated choices keep exactly today's gates.
