---
status: resolved
blocked-by: []
---

# feat(desktop): the account's machines are one card, and its acts sit quietly in the headers

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's walk of 2026-10-03, verbatim: "in the contract cards the progress circle bar the num text inside it needs to be a little bit smaller; the change password button maybe can be a simple icon on the top right of the card i'm not sure or better a text simple milimst on the right side of the card; the account sectio machiens and this machine merge them which is better and simpley an otpoin to login out of the mecahine; also the sinout of all feels od to be a complete section". (1) The contract card's paid-of-expected ring draws its figure a step smaller, still readable and centred. (2) The password card has no footer act: *change* is a quiet text button at the card header's trailing edge (the start edge mirrored in Arabic), opening the same password surface. (3) The account's machines card and this machine card become one machines card: this machine first, marked, with its own row menu holding *sign out of this machine* (confirmed, ticket 40); every other machine as today. (4) *Sign out all other machines* is no longer an end row or a section: it is a small red text button (*sign out others*) at the machines card header's trailing edge, confirmed, naming the machines it ends, refused where there are none. `settings-group` gains a header action slot if it lacks one.

## Acceptance Criteria

Traces requirement 1 as revised 2026-10-03, and requirements 2, 8 to 10 and 20.

- [x] The contract card test finds the ring's figure at the smaller size, in both locales. *Verified: integrated, desktop `vitest run` printed 95 files, 835 passed; the contract directory test finds `[data-ring-figure]` at the new `text-2xs` step (11px, added to the type scale and its table as rules/frontend asks) in en and ar, centred.*
- [x] The password card has no footer and no row button; its header carries a text *change* that opens the password surface. *Verified: the same run: the password card has no footer and no rows; its header's text *change*, named change password, opens the surface.*
- [x] The account tab has one machines card and no this-machine card; this machine's row menu signs it out after the confirmation; the header's red text *sign out others* confirms, naming the others, and is refused with its reason when there are none; there is no end row. *Verified: the same run: one machines card and no this-machine card or end row; this machine's row menu signs it out after the confirmation; the header's red *sign out others* confirms naming the others and is refused with its tooltip reason when there are none; the dangerous-acts guard passes.*
- [x] [[rules/interface]] and [[contexts/desktop/components]] describe the header action; `validate.mjs` passes. *Verified: read rules/interface and the components context (the header action); `validate.mjs` printed 586 artifacts checked, no failures; design 162 and 165 passed; check 0 errors.*

## Relevant areas

- `apps/desktop/src/lib/contract/component/record.svelte`, `apps/desktop/src/lib/organization/component/settings-account.svelte`, `apps/desktop/src/lib/organization/session/component/`, `packages/design/src/lib/block/settings-group.svelte`

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Choose components by [[contexts/desktop/components]].
