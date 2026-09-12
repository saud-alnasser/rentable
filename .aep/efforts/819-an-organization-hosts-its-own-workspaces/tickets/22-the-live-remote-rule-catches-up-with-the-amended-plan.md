---
status: resolved
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

- [x] **A seventh property is admitted, named to ticket 21**: whether Turso's MCP server yields the
      organization slug for the group a consent was granted over. It is a new property rather than
      an instance of an existing one, and the reason is stated: it is the only route to the slug
      that exists, since the token's `org_id` claim 404s in every Platform API path
      ([[efforts/819-an-organization-hosts-its-own-workspaces/evidence/prototypes/one-real-consent]]).
      A loopback server would answer whatever we scripted it to, which is the belief restated as a
      fixture, and the thing under test is precisely whether Turso's reply carries a hostname in the
      shape the parse depends on.
      *Verified: the seventh property is at `.aep/rules/testing.md:340`, named to ticket 21 and to
      its criterion 3. It states it is the only route to the slug, gives the 404 and the 403 as the
      reason, cites the evidence file, and rules out a loopback server, an in-memory fake and a
      `file:` database each with why. It argues separately that it is not an instance of the fourth
      property, the subject being a different server speaking a different protocol.*
- [x] **The fourth property's description is corrected.** It says ticket 05's live half creates a
      group and a database. No group is created: nothing available to the application can create
      one, and requirement 3 puts that step in the customer's hands. The corrected text says a
      database in a group the consent named, with delete protection asserted and lifted before the
      teardown.
      *Verified: `grep -n "creates a group and a database" .aep/rules/testing.md` returns nothing.
      The property now reads `creates a database in a group the consent named, mints a credential
      against that database, asserts delete protection is on, and deletes the database it just made
      once that protection has been lifted`, followed by **No group is created.** and why, citing
      the evidence file.*
- [x] **The count in the heading sentence is corrected**, since that section says in as many words
      that the count is the thing which goes stale.
      *Verified: it reads `Eight sets are admitted, in seven properties` at line 250, from `Seven
      sets are admitted, in six properties`. Two further counts about this effort's own admissions
      moved with it, four Rust tests to five in the opt-in flag paragraph and in the third binding
      bullet, because a fifth Rust live test makes both false as they stood.*
- [x] Nothing else in the section moves. The three properties admitted before this effort are not
      touched, and no test is written by this ticket.
      *Verified: the diff is one file and removes eight lines, all of them the heading sentence, the
      fourth property's opening, and the two counts named above. Nothing from the first three
      properties appears in it, and no file outside `.aep/rules/testing.md` was changed.*
- [x] `node .aep/scripts/validate.mjs` passes and the index is regenerated.
      *Verified: `193 artifacts checked, no failures`. No frontmatter moved in the rule, so the
      regenerated index is unchanged.*

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
