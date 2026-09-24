---
status: open
blocked-by: [03]
---

# refactor(contract): a contract's acts are declared once, and one host runs them

## Outcome

The record-act shape exists, and contract is its first concept. The contract's acts are one
ordered list in `contract/acts.ts`. One contract host, mounted in the frame, owns the contract form
and every contract dialog. The card's menu, its context menu, the record page's cluster and the
command menu are projections of that list: same labels, icons, order, tones and shortcuts, with copy
details and duplicate on the card too. There is one `ContractForm` in the tree.

## Acceptance Criteria

Traces requirements 6, 7 and 8 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criteria 7(b) and 8.

- [ ] `apps/desktop/src/lib/design/acts.ts` holds `RecordAct<T>` as the plan's *Interfaces* states,
      and `toCardActions`, `toPageActions` and `toPaletteVerbs`.
- [ ] `packages/design/src/lib/block/record-card.svelte`'s `RecordCardAction` gains `shortcut?` (a
      `Kbd` in both menus) and `group?` (a separator), and `variant` becomes
      `tone: 'neutral' | 'error'`. Its component test covers the separator and the shortcut hint.
- [ ] `contract/acts.ts` declares copy details, duplicate, renew, edit, terminate, restore, delete,
      with `appliesTo` and `unavailable` from the contract's own rules.
- [ ] `contract/component/host.svelte` mounts the form (keyed as today) and the dialogs once, in
      `layout/component/frame.svelte`, and exposes `run(actId, contract)` and `create(prefill?)`
      through a module store. `contract/component/actions.svelte` and
      `layout/component/record-verbs.svelte` are deleted, and `contract/component/details.svelte`
      mounts no form or dialog.
- [ ] A node test asserts that for a contract in each status, the card, page and palette
      projections yield the same ids, labels, icons and order.
- [ ] The command menu lists every contract act that applies, with its shortcut where it has one.
- [ ] `[[rules/interface]]` *Record card actions* is revised: one declaration per concept, three
      surfaces plus the command menu, groups and shortcuts.

## Relevant areas

- `packages/design/src/lib/block/record-card.svelte:45` (the action type), `record-action-control.svelte`
- `apps/desktop/src/lib/contract/component/actions.svelte:10,138`, `details.svelte:156-334`,
  `directory.svelte:156`, `record.svelte`, `tenant/component/contracts.svelte:77`,
  `complex/component/unit-contracts.svelte:74`
- `apps/desktop/src/lib/layout/component/palette.svelte`, `record-verbs.svelte`, `layout/palette.ts`,
  `design/shortcut-registry.ts` (the `RecordVerb` type)
- `apps/desktop/src/lib/organization/dialogs.svelte.ts` (the module-store shape to follow)

## Constraints

- The plan's *Architecture 1*. The per-surface wiring and the runtime registry were rejected.
- The mutations and their inverses are unchanged. This ticket moves who opens what, not what is
  written.
- The terminate and restore dialogs stay the delete dialog until ticket 13 replaces them.
