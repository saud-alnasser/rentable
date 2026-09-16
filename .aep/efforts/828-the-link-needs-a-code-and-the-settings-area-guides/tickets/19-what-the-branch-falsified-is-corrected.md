---
status: resolved
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

- [x] Each sentence section C1 to C4 of the converge file lists as false carries a dated
      correction (2026-09-16) in place, in the artifact's own voice, naming this effort: the
      context's "a member makes for their own next machine"; the credentials rule's "a reset"
      as a third kind of link; the Turso reference's "all this API did for it was create it
      once"; 826's requirements 5, 8, 9, 12, 14, 15, 17, 18 and 20, criteria 8, 15, 17 and 23,
      and its two risks. No sentence is rewritten as if it had always been true.
      *Verified 2026-09-16 on the effort branch at the cherry-pick: 826's spec carries
      seventeen lines dated 2026-09-16 (requirements 5, 8, 9, 12, 14, 15, 17, 18, 20, criteria
      8, 15, 17, 23, the two risks, and the two from ticket 12); the context's *Organization*
      entry and its boundary sentence on the owner's password, the credentials rule's three
      kinds, and the Turso reference's "create it once" each carry an italic correction naming
      effort 828 and the requirement, the old sentence left where it stood.*
- [x] `.changeset/a-link-needs-its-code.md`: the paragraph on the member's own second-machine
      act is removed; the you section's paragraph no longer says another machine sits under its
      own heading; the first paragraph names no reset link; every remaining paragraph is read
      against the tree and any other false clause is cut. The file reads top to bottom as one
      account of what the person meets.
      *Verified: `.changeset/a-link-needs-its-code.md` is ten paragraphs, the member's own
      second-machine paragraph gone, the you paragraph's heading clause cut, no reset link in
      the first paragraph, and four more false clauses cut on reading the tree (a card opens
      the account's edit; the owner's own card carries the transfer; a member makes no link;
      the walk asks the group; an unset account is offered a link regardless).*
- [x] `node .aep/scripts/index.mjs` and `node .aep/scripts/validate.mjs` are clean.
      *Verified in the run's worktree: `index.mjs` wrote the index unchanged; `validate.mjs`:
      `269 artifacts checked, no failures`; `pnpm lint` exit 0.*

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

- *2026-09-16, at integration.* One correction beyond the enumerated list, the context's
  boundary sentence "only their password re-derives the organization key", true of the founder
  alone since requirement 22; accepted. Three stale sentences in source were noticed and handed
  to ticket 18: the connect screen's and the members section's docstrings, and the
  `disconnectDescription` string that still names the organization's link.
