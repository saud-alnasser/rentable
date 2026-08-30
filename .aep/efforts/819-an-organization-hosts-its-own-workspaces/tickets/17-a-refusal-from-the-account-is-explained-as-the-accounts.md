---
status: open
blocked-by: ['14']
---

# feat(organization): a refusal from the account is explained as the account's

## Outcome

When Turso refuses for quota or for billing, the member is told the organization's Turso account
needs attention rather than being shown a synchronisation error. Every read and every write keeps
being served from the local replica while it stands, because offline-first does not depend on the
account being in good standing. Account detail reaches the owner and nobody else.

## Acceptance Criteria

Traces requirement 21 and requirement 25 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 21 and
criterion 25.

- [ ] A quota or billing refusal produces a message naming the account rather than the sync, and it
      is driven by the distinguishable error ticket 05 makes at the response rather than by
      pattern-matching a string three layers up.
- [ ] **Reads and writes continue against the local replica while the refusal stands**, and a test
      drives exactly that: refuse at the remote, then read and write locally and succeed.
- [ ] A member who is not the owner sees no account detail. They are told the organization's
      account needs attention and who to tell, and nothing about quotas, plans, or usage.
- [ ] The owner sees enough to act: which limit, and where on Turso to go. This is the one place
      the application talks about a Turso account to a person, and it should not require them to
      already know what a group is.
- [ ] The message is distinguishable from an ordinary offline state. A person whose network is down
      and a person whose account is over quota need different things, and telling them the same
      thing is the failure this requirement exists to prevent.
- [ ] Both locales, both directions.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.

## Relevant areas

`apps/desktop/tauri/src/sync/turso/platform.rs` from ticket 05 is where the refusal is
distinguished from a network failure.

`apps/desktop/src/lib/sync/` holds what the application already says about synchronisation state,
and `admission.ts`, rewritten in ticket 10, is where the vocabulary for "why can I not sync" now
lives. This adds a reason to it rather than a parallel channel.

`[[contexts/desktop/remote-sync]]` describes the existing sync surface and what it already tells a
person.

## Constraints

- **Requirement 18 does not bend for this.** The local replica serves everything regardless. An
  implementation that blocks writes while the account is refused has inverted the requirement.
- **Account detail is the owner's.** Requirement 25 says so, and a staff member seeing a customer's
  billing state is a leak even though it is their own employer's.
- **We do not fix the account.** There is no billing surface, no upgrade button, and no link that
  spends money. The customer's account is the customer's.

## Notes

The spec's last risk sits behind this requirement and has no technical answer: every customer now
operates a Turso account, and every failure it can have arrives as a failure of this application
from where they are sitting. This ticket is the surface. The support burden is not something a
ticket closes.

Independent of tickets 15 and 16 and can be built alongside either.
