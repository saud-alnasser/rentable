---
status: open
blocked-by: [09]
---

# feat(desktop): the interface offers only the record acts a member may perform

## Outcome

Record acts, creates, bulk actions, imports and undo check the member's flags; an act the member
lacks is shown refused with a reason on a card or a page and is not offered in the palette; a kind
the member cannot view is absent from navigation, search, cross-kind panes, the dashboard and print.

## Acceptance Criteria

Traces requirement 10 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], and criterion 10.

- [ ] Each concept's `acts.ts` sets `unavailable` with a reason naming the missing flag; component
      tests per concept show the reason, and show the palette not offering the act.
- [ ] `layout/create.ts`, the directories' bulk actions, the import dialogs and `design/inverse.ts`
      check the same flags, each with a test.
- [ ] Without a kind's view flag, `layout/navigation.ts` omits it, `layout/record-search.ts` does not
      search it, the tenant's and the unit's contracts panes and the contract's payment ledger are
      absent, and the receipt and the schedule are not offered; each with a test.
- [ ] On a read-only grant every create, edit and delete control reads as refused with the read-only
      reason.

## Relevant areas

- `src/lib/{complex,complex/unit,tenant,contract,payment}/acts.ts`, `design/acts.ts`
- `layout/create.ts`, `layout/navigation.ts`, `layout/record-search.ts`, `design/inverse.ts`
- the directory, ledger and pane components under each concept's `component/`

## Constraints

- [[rules/interface]], *Record card actions*, governs the `unavailable` pattern; every reason is in
  `i18n/en` and `i18n/ar`.
