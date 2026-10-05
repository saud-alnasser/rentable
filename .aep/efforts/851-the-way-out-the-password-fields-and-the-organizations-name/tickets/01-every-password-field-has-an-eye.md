---
status: resolved
---

# feat(desktop): every password field shows its contents while an eye is held

Authoritative: [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]], and [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/plan]] for the approach (*The password fields: one block in the design package*).

## Outcome

The design package holds `block/password-input.svelte`, the hold-to-reveal input the plan describes, and all eleven password fields in the spec's scope table draw it. At rest each shows dots and a closed eye at its trailing end; while the eye is pressed and held, or Space is held on it, the field shows its characters and the eye is open; release, a cancelled press, or the window losing focus hides them again.

## Acceptance Criteria

Traces requirements 19, 20 and 21, and criteria 19, 20 and 21.

- [x] `packages/design/src/lib/block/password-input.svelte` exists as the plan describes: bindable `value` and `ref`, `disabled`, `lead` (leading `KeyRound`), `label` (the eye's accessible name), `class` to the Root, the rest to the input; the eye is an `InputGroup.Button` with `type="button"` in an `inline-end` addon.
- [x] Package tests in `packages/design/src/lib/block/tests/`: `type="password"` at rest; `type="text"` between `pointerdown` and `pointerup`; `password` again after `pointerup` on `window`, after `pointercancel`, and after the window's `blur`; `eye-closed` at rest and `eye` while held; Space `keydown` shows and `keyup` hides, a repeated keydown changes nothing; Enter in the field submits its form; the value and the caret position are unchanged by a hold, and focus is in the field after a pointer hold; disabled field means disabled eye. In `dir="rtl"` the eye's addon is the last child, so it sits at the left end.
- [x] The eleven fields in the spec's scope table draw the block (the dialog fields with `lead`), with their ids, names, `autocomplete`, `aria-invalid`, `bind:ref` and focus behaviour unchanged; the eye's `label` is a new `$LL` string, "show password" in English and its Arabic counterpart, in lower case per the i18n rule.
- [x] Each surface's existing test still passes, and each gains one assertion that its password field has the eye (sign-in, connect-screen, walk, existing-step, change-password, delete-organization, offer- and accept-ownership).
- [x] [[contexts/desktop/components]] names the block in its Blocks table, so `components-context.test.ts` passes.
- [x] A changeset for the desktop package describes the eye in a user's words.

## Relevant areas

- `packages/design/src/lib/primitive/input-group/`, `packages/design/src/lib/block/`
- the eleven files in the spec's scope table
- `apps/desktop/src/lib/startup/tests/sign-in.svelte.test.ts` for the provider setup

## Constraints

- A block, not a primitive ([[rules/frontend]], *Components*); no tooltip on the eye (plan).
- The words come in through `label` from the app; the `DesignStrings` contract does not grow.
- Icons from `@lucide/svelte/icons/eye` and `@lucide/svelte/icons/eye-closed`; the swap follows the motion row of [[contexts/desktop/components]] with `motion-reduce:`.
- Tests use `fireEvent`; the repository has no user-event.

## Notes

The walk's confirmation field (ticket 02) is drawn with this block too, so 02 is built on this one.
