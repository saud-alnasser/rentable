---
status: resolved
blocked-by: [10, 11]
---

# docs(organization): the context describes the new chain, and the changeset says it breaks

## Outcome

`contexts/desktop/organization` is rewritten for delegated certificates, signed revocations, roles,
overrides and the format version, with the corrections that describe the old chain retired rather
than stacked; `rules/credentials` says what the session carries now; a changeset marks the release as
breaking and says how an organization made by an earlier version crosses over.

## Acceptance Criteria

Traces requirements 9 and 11 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], and criterion 11.

- [x] The *Chain*, *Authority* and *Boundaries* entries describe this effort's chain and cite the
      spec and the plan; no sentence describes `revoked_at` as a revocation, an administrator, or
      the seven acts as the whole vocabulary.
- [x] The *Client boundary* sentence in `rules/credentials` names what `OrganizationSession` carries.
- [x] A minor changeset says the organization format changed, that an older one is refused, and the
      export, delete, create and import steps.
- [x] `node .aep/scripts/index.mjs` and `validate.mjs` pass.

## Relevant areas

- `.aep/contexts/desktop/organization.md`, `.aep/rules/credentials.md`, `.changeset/`

## Constraints

- [[references/changesets]] has the form; the changeset rides in this ticket's commit.
