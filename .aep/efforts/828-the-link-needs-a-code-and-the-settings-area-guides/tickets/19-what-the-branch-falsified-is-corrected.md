---
status: open
---

# docs(organization): what the branch falsified is corrected

## Outcome

Every sentence the effort made false in the organization context, the credentials rule, the
Turso reference and effort 826's spec carries a dated correction pointing here, and the
changeset describes what the branch does and nothing it undid.

## Acceptance Criteria

Traces requirements 5 and 12 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 5
and 12. Cut by converge round one
([[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/evidence/research/converge-round-one]],
sections C and E1).

- [ ] Each sentence section C1 to C4 of the converge file lists as false carries a dated
      correction (2026-09-16) in place, in the artifact's own voice, naming this effort: the
      context's "a member makes for their own next machine"; the credentials rule's "a reset"
      as a third kind of link; the Turso reference's "all this API did for it was create it
      once"; 826's requirements 5, 8, 9, 12, 14, 15, 17, 18 and 20, criteria 8, 15, 17 and 23,
      and its two risks. No sentence is rewritten as if it had always been true.
- [ ] `.changeset/a-link-needs-its-code.md`: the paragraph on the member's own second-machine
      act is removed; the you section's paragraph no longer says another machine sits under its
      own heading; the first paragraph names no reset link; every remaining paragraph is read
      against the tree and any other false clause is cut. The file reads top to bottom as one
      account of what the person meets.
- [ ] `node .aep/scripts/index.mjs` and `node .aep/scripts/validate.mjs` are clean.

## Relevant areas

`.aep/contexts/desktop/organization.md`, `.aep/rules/credentials.md`, `.aep/references/turso.md`,
`.aep/efforts/826-the-organization-and-the-way-in-are-rethought/spec.md`,
`.changeset/a-link-needs-its-code.md`.

## Constraints

- **Corrections are dated and additive** ([[policies/authority]]): the old sentence stays
  visible where the artifact's own convention keeps it, and the correction says what is true
  now and since when.
- **828's own spec is not this ticket's**; its contradictions were corrected by the
  orchestrator at converge.
- `.aep/` prose is exempt from the em-dash prohibition; the changeset is not.

## Notes
