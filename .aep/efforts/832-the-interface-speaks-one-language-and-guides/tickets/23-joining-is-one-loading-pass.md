---
status: open
blocked-by: [22]
---

# feat(organization): joining reaches the application in one loading pass

## Outcome

Joining is the link and its code, then the password, then the application, with exactly one
loading pass after the password. Every refusal says what to do next in one line.

## Acceptance Criteria

Traces requirement 19 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criterion 19.

- [ ] After `join` succeeds, the connect screen hands straight to the loading surface, with no busy
      surface of its own in between. Component test.
- [ ] The seven refusal texts (lapsed, consumed, consumedElsewhere, revoked, replaced,
      anotherOrganization, unreachable) are one line each, and each names the next step.
- [ ] Checked by the human with a real invitation link.

## Relevant areas

- `apps/desktop/src/lib/organization/component/connect-screen.svelte`, `organization/connect.ts:232,267,320`,
  `routes/organization/join/+page.svelte`
