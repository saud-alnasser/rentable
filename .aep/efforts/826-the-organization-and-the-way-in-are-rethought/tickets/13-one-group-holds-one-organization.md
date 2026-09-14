---
status: resolved
blocked-by: ['07']
---

# feat(organization): one Turso group holds one organization

## Outcome

A first run whose consent lands on a group that already holds a rentable organization database
is refused on the connect step with a sentence naming the database and saying a group holds
one organization; nothing is created, the consent is abandoned so another account or group can
be chosen, and the connect step's coverage statement says the rule in both locales.

## Acceptance Criteria

Traces requirement 21 of [[efforts/826-the-organization-and-the-way-in-are-rethought/spec]],
and its criterion 21.

- [x] `discovery::organization` reports, beside the slug, the names of the databases listed in
      the consented group (the shape is the ticket's; `OrganizationLookup::Found` carrying them
      is the obvious one), and the scripted-listing tests in `discovery.rs` assert the names
      and that databases of other groups are not among them.
- [x] `setup::create_organization` refuses, before any create, when a listed name is `org-`
      followed by anything, with `Error::PreconditionFailed` and the sentence "this group
      already holds the organization database `<name>`; a group holds one organization, so pick
      another group or another Turso account"; a listing with unrelated names proceeds. Asserted
      in `setup.rs` over the loopback listing, including that the `InMemoryPlatform` saw no
      create and that the consent's keyring entry is gone after the refusal.
- [x] The walk shows the sentence on the connect step and offers the consent again, the way a
      failed create is shown today; `setup.test.ts` drives the refusal and asserts the step and
      the sentence.
- [x] The connect step's coverage statement gains a fourth literal in both locales, written not
      copied: a group holds one organization, so a group already holding one is refused.
      `setup.test.ts`'s pinned literals and `i18n/tests/organization.test.ts` follow.
- [x] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass; a changeset rides with the
      change.

## Relevant areas

`apps/desktop/tauri/src/sync/turso/discovery.rs`, `organization/setup.rs`,
`sync/turso/consent.rs` (read; `forget` is called); `apps/desktop/src/lib/organization/setup.ts`,
`organization/component/setup-walk.svelte`, `i18n/{en,ar}/index.ts`, and the tests beside them.

## Constraints

- **Read [[efforts/826-the-organization-and-the-way-in-are-rethought/plan]], *One group holds
  one organization*.**
- **Only an `org-` name counts.** A Free or Developer account's one group holds whatever else
  the person has; that is not a refusal.
- **Nothing is created before the check**, so the refusal leaves the account as it was.
- **The one live test in `discovery.rs` stays ignored** and is not the evidence here.

## Notes

Built by an implementer and landed on 2026-09-14. Departures: the refusal also clears the
remembered `turso_organization`, since a kept slug would build the next consent's paths out of
the account this one was over; `discovery::organization` answers `Option<ConsentedGroup>` whose
`databases` is `None` when the store answered and nothing was asked, apart from a group holding
nothing, and `organization_reconnect_authority` is untouched so a second machine's reconnect
succeeds; the walk detects the refusal by refetching the organization state and finding the
authority gone rather than by the error's prose, so any create that fails with the authority
gone returns the walk to connect with the sentence; the fourth statement sits second, after
what the group covers; `refusalAfterFailedCreate` carries `string | null`.

Raised, not taken: the prefix matches `org-chart` as well as `org-<id>`, which errs toward
refusing; the refusal offers no deletion of the database it found; `setup.rs` is 1140 lines;
the discovery module's header still frames the group filter as the token's alone.
