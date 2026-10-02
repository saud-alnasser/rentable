---
status: resolved
blocked-by: []
---

# feat(desktop): every dangerous act asks first

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's walk of 2026-10-02, verbatim: "make sure deangours actions have confirmation dialog even in domain records deletes have confirmation dialong and dangours actions". Every act in the application that deletes, ends, removes, signs out, disconnects, forgets or transfers something opens a confirmation (the design package's `confirm-dialog` or `delete-dialog`) naming what ends and whether anything brings it back, before anything is written: the domain records' deletes (tenant, complex, unit, contract, payment) from every route that offers them (the card menu, the context menu, the record page, the command menu, a selection's bulk delete), and every settings act of that kind (workspace delete, member remove, role delete, withdraw an offer, transfer ownership, the sign-outs including signing this machine out, disconnect, forget Turso account, delete organization, remove the organization stamp). A guard keeps it so: every act declared destructive (by its tone or kind in the act declarations) is found to confirm.

## Acceptance Criteria

Traces requirement 2 as revised 2026-10-02, and criterion 2.

- [x] A test enumerates every act the act declarations mark destructive, across every concept and the organization, and finds each one confirms before it runs; it fails if one is added without. *Verified: integrated, desktop `vitest run` printed 94 files, 820 passed, including `act/tests/dangerous-acts-ask.svelte.test.ts` (22 passed): every error-tone act in every `acts.ts` holds a declared confirmation and, run through its host, opens a dialog and writes nothing; it failed with withdraw reverted to run on the press; the act type refuses an error-tone act with no confirmation (svelte-check failed without one).*
- [x] Component tests: for each domain record delete, from the card menu and from a selection, cancelling the dialog deletes nothing and confirming deletes; signing this machine out now asks first. *Verified: the same run: `delete-hosts.svelte.test.ts` (11) and `selection-delete.svelte.test.ts` (5) find, for tenant, complex, unit, contract and payment, that cancelling deletes nothing and confirming deletes, from the card menu and from a selection; signing this machine out now asks first in settings and in the account menu.*
- [x] [[rules/interface]] says every dangerous act asks first, with no exception; `validate.mjs` passes. *Verified: read rules/interface *Delete and confirm*: every dangerous act asks first, with no exception; requirement 2 carries the dated revision; `validate.mjs` printed no failures; node 1484 and design 160 passed; check 0 errors.*

## Relevant areas

- `apps/desktop/src/lib/act/`, each concept's `acts.ts` and host, `apps/desktop/src/lib/organization/`, `packages/design/src/lib/block/{confirm-dialog,delete-dialog}.svelte`

## Constraints

- User-visible where something was unconfirmed: it carries its own changeset ([[references/changesets]]).
- Choose components by [[contexts/desktop/components]].
