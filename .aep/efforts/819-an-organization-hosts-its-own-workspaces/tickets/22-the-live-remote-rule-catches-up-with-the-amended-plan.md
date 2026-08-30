---
status: open
---

# docs(aep): the live remote rule catches up with the amended plan

## Outcome

`.aep/rules/testing.md`, under *Tests that reach a live remote*, admits the one live test the
re-planned approach added and corrects the one whose description the same evidence falsified. Every
live test this effort will write is named there before it exists, which is what that section asks
for.

## Acceptance Criteria

Traces requirement 3 of [[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its
criterion 3.

- [ ] **A seventh property is admitted, named to ticket 21**: whether Turso's MCP server yields the
      organization slug for the group a consent was granted over. It is a new property rather than
      an instance of an existing one, and the reason is stated: it is the only route to the slug
      that exists, since the token's `org_id` claim 404s in every Platform API path
      ([[efforts/819-an-organization-hosts-its-own-workspaces/evidence/prototypes/one-real-consent]]).
      A loopback server would answer whatever we scripted it to, which is the belief restated as a
      fixture, and the thing under test is precisely whether Turso's reply carries a hostname in the
      shape the parse depends on.
- [ ] **The fourth property's description is corrected.** It says ticket 05's live half creates a
      group and a database. No group is created: nothing available to the application can create
      one, and requirement 3 puts that step in the customer's hands. The corrected text says a
      database in a group the consent named, with delete protection asserted and lifted before the
      teardown.
- [ ] **The count in the heading sentence is corrected**, since that section says in as many words
      that the count is the thing which goes stale.
- [ ] Nothing else in the section moves. The three properties admitted before this effort are not
      touched, and no test is written by this ticket.
- [ ] `node .aep/scripts/validate.mjs` passes and the index is regenerated.

## Relevant areas

`.aep/rules/testing.md`, from *Tests that reach a live remote*. Ticket 01 of this effort is what
admitted the first four and is the shape to follow: a property, why nothing local holds it, and the
ticket that builds it.

## Constraints

- **This ticket writes no test and changes no code.** It is the decision the rule requires to exist
  before a test does, and a ticket that also wrote the test would be the thing that section forbids.
- **Do not renumber or reword the properties admitted before this effort.** Two of the three predate
  it and are somebody else's record.

## Notes

Raised during the re-plan on 2026-08-30. The run log for this effort already carried a related
observation: the plan's testing section said six live tests and named four. That count moves again
here, which is why the heading sentence is a criterion rather than an incidental edit.
