---
status: open
blocked-by: ['01', '03']
---

# spike(sync): one real consent settles what no probe could

## Outcome

A human completes one Turso consent against a real account through ticket 03's flow, and the
effort's load-bearing assumption is answered rather than assumed. What the run observes is written
to `evidence/prototypes/` with the same source, observation, interpretation, conclusion separation
the research file uses, and both remaining open questions in the spec close or are recorded as
still open with what was learned.

## Acceptance Criteria

Traces requirement 3, requirement 4 and requirement 22 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 3. It is the only
ticket that can settle the spec's first assumption, which is why it is placed before everything it
does not gate.

- [ ] **The authorize endpoint is driven with a loopback redirect and the result is recorded**,
      whichever way it goes. If it is honoured, the assumption becomes a fact and the first risk in
      the spec is struck. If it is refused, the refusal is recorded verbatim with its status and
      body, and the spec's requirement 3 is rewritten to the pasted-token fallback in the same
      change.
- [ ] Open question one is answered: whether the consent screen grants the scope set the caller
      requests, or presents the human the full picker. What the screen actually showed is
      described, and the scopes on the issued token are read back and compared with what was asked.
- [ ] Open question two is answered: whether a Turso organization requires a paid plan. The account
      used is described by tier, and `GET /v1/organizations` is read back so requirement 22's two
      branches are both known to be reachable or one is known not to be.
- [ ] The spec's *Open questions* section is edited to reflect what closed, in the same change, and
      **`flag: discussion` is left on the issue for the human to remove**. That label is theirs by
      [[skills/specify]] and this ticket does not take it off.
- [ ] The evidence file names what was **not** checked, in the shape the research file already
      uses. A prototype that reports only what it found reads as more complete than it is.

## Relevant areas

`evidence/research/what-turso-lets-a-desktop-client-do-alone.md` in this effort is the file this
one continues, and it records why no probe from outside can settle this: five requests to
`app.turso.tech/oauth/mcp/authorize` differing only in `redirect_uri`, from a loopback to a hostile
HTTPS origin to a custom scheme, all answered identically with a 307 to the login page. So did one
carrying a client id that does not exist, and so did one with no query string at all. The endpoint
authenticates before it validates.

`.aep/references/turso.md` records the account this repository already touches. The token in
`apps/desktop/.env` is the human's and is not the one to use here without being told to.

## Constraints

- **This ticket cannot be run by an agent alone and must not be attempted as though it can.** It
  needs a human at a browser, signed into a real Turso account, choosing to grant. Ask, and wait.
- **[[references/turso]], *Never run*, is absolute here.** No database is created, deleted, or
  minted against as part of this. The consent is the whole of what is exercised, and the token it
  yields is not spent until ticket 05, which asks separately.
- **A token obtained here is the human's.** It is not printed, not committed, not pasted into an
  artifact, and not carried into a later session. The evidence records the token's **scopes**, not
  the token.

## Notes

Placed first among the things that can fail, which is the ordering
[[efforts/819-an-organization-hosts-its-own-workspaces/plan]] gives under *Technical approach*.
Tickets 06 and 07 are deliberately independent of it, so the cryptographic work proceeds while this
is open rather than waiting on a browser.

The fallback is not a catastrophe and the plan says so: requirement 3 falls back to a pasted token,
onboarding gets worse, and steps 2 onwards are unchanged.
