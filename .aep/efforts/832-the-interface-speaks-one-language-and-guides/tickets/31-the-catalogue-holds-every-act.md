---
status: resolved
blocked-by: [28, 29, 30, 32]
---

# docs(desktop): the catalogue holds every act, and every difference is resolved or excepted

## Outcome

`[[rules/interface]]` holds a section for each act requirement 6 names, and the evidence
inventory's [DIFF] list is copied into the pull request with every line ticked or pointing at a
stated exception in the rule.

## Acceptance Criteria

Traces requirement 6 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criterion 6.

- [x] `[[rules/interface]]` gains sections for the acts it lacks: filter, sort, edit, undo, bulk
      selection, export and import, error and not found, and notifying (or points each at the
      section that already covers it). Verified: `rules/interface.md` gains a catalogue table mapping each act of requirement 6 to its section, and new sections Filter, Sort, Undo, Edit, Bulk selection, Export and import, and Error; not found points at Empty, notifying at Feedback.
- [x] The stated exceptions are written where they apply: the dashboard's period picker is a text
      control because the chosen period is what its figures mean; deleting the organization is a
      heavy form with a password because it cannot be undone. Verified: both stated exceptions are written: the period picker under *Filter*, deleting the organization under *Delete and confirm* (grep finds both).
- [x] The [DIFF] list is copied into pull request 833, each line ticked with the ticket that
      resolved it or pointing at its exception.
 Verified: the [DIFF] list from `evidence/research/diff-resolution.md` is copied into pull request 833 as a collapsed block: 21 lines, 19 ticked with their ticket, 2 pointing at their exception, none open.
## Relevant areas

- `.aep/rules/interface.md`,
  [[efforts/832-the-interface-speaks-one-language-and-guides/evidence/research/how-the-app-does-each-act-today]]
