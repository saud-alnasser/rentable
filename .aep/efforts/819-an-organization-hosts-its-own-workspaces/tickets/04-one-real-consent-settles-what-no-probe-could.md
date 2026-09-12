---
status: resolved
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

- [x] **The authorize endpoint is driven with a loopback redirect and the result is recorded**,
      whichever way it goes. If it is honoured, the assumption becomes a fact and the first risk in
      the spec is struck. If it is refused, the refusal is recorded verbatim with its status and
      body, and the spec's requirement 3 is rewritten to the pasted-token fallback in the same
      change.
      *Verified: it is honoured. Three consents completed, the callback arrived on the loopback,
      and the token exchange answered 200 for a public client with no secret. The spec's first
      risk now reads `~~The consent flow is refused at the authorize step~~ **Struck 2026-08-30.**`
      and its Assumptions section records both assumptions as settled, with what settled them. The
      refusal that preceded the fix is recorded verbatim in the evidence file, which is where the
      missing `resource` parameter was found.*
- [x] Open question one is answered: whether the consent screen grants the scope set the caller
      requests, or presents the human the full picker. What the screen actually showed is
      described, and the scopes on the issued token are read back and compared with what was asked.
      *Verified: the screen is described in the evidence file as a group picker with no create
      option. Three scopes were asked for and the token's `scopes` claim carries nine, the three
      plus `db:configure`, `db:delete`, `db:rotate-creds`, `group:configure`, `group:mint-token`
      and `group:rotate-creds`. It is the full picker.*
- [x] Open question two is recorded as **moot rather than answered**, with why. `GET /v1/organizations`
      answers 403 to a group-scoped token, so it cannot be read back, and requirement 22 no longer
      has two branches to make reachable: the organization is whichever holds the group the human
      picked. The account's tier is still described, because the run happened on one.
      *Verified: the spec's second open question reads `**Moot rather than answered.**` and gives
      the reason. The tier is described in two places, the spec's Assumptions note and the
      evidence file's Findings, both as free tier.*
- [x] The spec's *Open questions* section is edited to reflect what closed, in the same change, and
      **`flag: discussion` is left on the issue for the human to remove**. That label is theirs by
      [[skills/specify]] and this ticket does not take it off.
      *Verified: the section is rewritten, both questions are struck through with what closed them,
      and a third is opened that the prototype raised and could not close. `gh issue view 819`
      still lists `flag: discussion` among the labels.*
- [x] The evidence file names what was **not** checked, in the shape the research file already
      uses. A prototype that reports only what it found reads as more complete than it is.
      *Verified: `evidence/prototypes/one-real-consent.md` carries a `Not checked` section of seven
      items, including the one that matters most, that the token's own claims were never decoded.*

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

## Parked, 2026-08-30

**Two consents were completed and the ticket is not finished.** What they found is in
`evidence/prototypes/one-real-consent.md`. The run stopped at the return-to-plan trip-wire, because
the two criteria still open ask for edits to `spec.md` and the evidence changes what those edits
should say.

- **The loopback redirect is honoured and the effort's load-bearing assumption is a fact.** The
  consent screen rendered, the callback arrived, and the token exchange answered 200. The spec's
  first risk is struck in substance and **not yet struck in the file**, which is why criterion 1
  is not ticked.
- **The authorize endpoint requires RFC 8707's `resource`**, value `https://mcp.turso.ai/mcp` from
  `https://api.turso.tech/.well-known/oauth-protected-resource`. The shipping code does not send
  it, so `sync/turso/consent.rs` cannot currently complete a consent, and the comment beside its
  empty provider parameter list is wrong. A defect ticket 03 landed with, left unfixed because the
  plan round decides what the code should send.
- **Requirement 4 is defeated by the grant.** Three scopes asked for, nine granted, including
  `db:delete` and `db:rotate-creds`. The application would hold a credential that can delete a
  customer's databases whatever it asked for, and nothing at the authorization server enforces the
  restraint requirement 4 describes.
- **The token has no `exp`, no `aud` and no `iss`.** Four claims: `group_uuid`, `jti`, `org_id`,
  `scopes`. A bearer credential that does not age changes what requirement 5's *re-obtainable by
  repeating the consent* is worth as a mitigation.
- **The authority is one group of one organization.** `GET /v1/organizations` answers 403
  `group-scoped token cannot access org-level resources`, so open question two is still unreached.
  But `org_id` is in the claims, so requirement 22 has a route that does not need the listing, and
  it is a different route from the one the plan assumed.
- **Requirement 3 itself survives, amended.** Nothing is typed and nothing is pasted; the human
  selects a group on Turso's own screen. Criterion 3 is the one in trouble, because the screen
  cannot create a group and this token cannot create an organization.

## The plan round ran, 2026-08-30

`/plan` took the evidence and the human decided the product questions it raised. `spec.md` and
`plan.md` now carry the outcome, so **the spec edits this ticket's criteria 1 and 4 ask for are
done**; `/implement` verifies and ticks them rather than this note doing it.

- **Criterion 1's spec edit is in.** The first risk is struck and both assumptions are recorded
  as settled, with what settled them.
- **Criterion 4's spec edit is in.** *Open questions* is rewritten. `flag: discussion` was not
  touched and remains the human's to remove.
- **Criterion 3 could not be met as written and was superseded rather than failed.** It asked
  for `GET /v1/organizations` to be read back so requirement 22's two branches were each known
  reachable. Requirement 22 no longer has two branches: the organization is whichever holds the
  selected group, the listing answers 403 to this credential, and the paid-plan question is
  recorded as moot. That contradiction went to [[skills/tasks]] rather than being ticked around,
  **and the criterion above is what came back** — it now asks for the question to be recorded moot,
  which is what the spec says.

**The remaining work is not this ticket's.** Three consents answered what a prototype could
answer. What follows is a re-derivation of the tickets against the amended spec, because the
approach changed under several of them.
