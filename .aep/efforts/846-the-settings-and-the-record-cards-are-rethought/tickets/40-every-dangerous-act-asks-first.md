---
status: open
blocked-by: []
---

# feat(desktop): every dangerous act asks first

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's walk of 2026-10-02, verbatim: "make sure deangours actions have confirmation dialog even in domain records deletes have confirmation dialong and dangours actions". Every act in the application that deletes, ends, removes, signs out, disconnects, forgets or transfers something opens a confirmation (the design package's `confirm-dialog` or `delete-dialog`) naming what ends and whether anything brings it back, before anything is written: the domain records' deletes (tenant, complex, unit, contract, payment) from every route that offers them (the card menu, the context menu, the record page, the command menu, a selection's bulk delete), and every settings act of that kind (workspace delete, member remove, role delete, withdraw an offer, transfer ownership, the sign-outs including signing this machine out, disconnect, forget Turso account, delete organization, remove the organization stamp). A guard keeps it so: every act declared destructive (by its tone or kind in the act declarations) is found to confirm.

## Acceptance Criteria

Traces requirement 2 as revised 2026-10-02, and criterion 2.

- [ ] A test enumerates every act the act declarations mark destructive, across every concept and the organization, and finds each one confirms before it runs; it fails if one is added without.
- [ ] Component tests: for each domain record delete, from the card menu and from a selection, cancelling the dialog deletes nothing and confirming deletes; signing this machine out now asks first.
- [ ] [[rules/interface]] says every dangerous act asks first, with no exception; `validate.mjs` passes.

## Relevant areas

- `apps/desktop/src/lib/act/`, each concept's `acts.ts` and host, `apps/desktop/src/lib/organization/`, `packages/design/src/lib/block/{confirm-dialog,delete-dialog}.svelte`

## Constraints

- User-visible where something was unconfirmed: it carries its own changeset ([[references/changesets]]).
- Choose components by [[contexts/desktop/components]].
