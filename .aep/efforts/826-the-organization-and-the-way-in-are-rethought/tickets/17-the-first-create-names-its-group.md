---
status: resolved
blocked-by: ['07', '13']
---

# feat(organization): the first create names its group

## Outcome

The walk's name step asks for the Turso group the person picked on the consent screen, beside
the organization's name, the owner's username and the password; the first run's create names
that group, so a first run into an empty group succeeds again now that Turso refuses a create
that names none; a group that does not match the one the listing shows is refused by name; and
the vocabulary guard keeps forbidding a slug, a token, a URL and a group *instruction* while
admitting the field.

## Acceptance Criteria

Traces requirement 13 of [[efforts/826-the-organization-and-the-way-in-are-rethought/spec]] as
corrected on 2026-09-15, and its criterion 13.

- [x] `CreateOrganization` carries `group: &str` and `setup::create_organization` refuses an
      empty one as `InvalidInput` naming the field; `discovery::create_first_database` takes
      the group and passes it as the tool's `group` argument, asserted in `discovery.rs` over
      the scripted server (the argument is `{ name, group }` and nothing else); where the
      listing already names the consented group, a typed group that differs is refused as
      `PreconditionFailed` with "the group this consent is over is called `<listed>`, not
      `<typed>`", and one that matches proceeds through the Platform API path as today,
      asserted in `setup.rs`.
- [x] `organization_create(name, username, password, group)` in `command.rs`, mirrored in
      `host.ts`, `platform/tauri.ts`, `platform/tests/testing.ts` and `organization/router.ts`
      (the input schema requiring a non-empty trimmed `group`); `router.test.ts` pins it.
- [x] `organization/setup.ts`'s name step lists `group` among its fields, and
      `setup-walk.svelte` draws it after the password with a label and a description saying it
      is the group picked on Turso's consent screen, in both locales, written not copied;
      `setup.test.ts` holds `fieldsPresented` to `['name', 'username', 'password', 'group',
      'workspace']`, and its vocabulary guard keeps forbidding `slug`, `token`, `url`, `host`
      and `secret` in every statement and forbids a group *instruction* (create, empty, pick)
      while admitting the field's label and description; `setup-walk.svelte.test.ts` drives
      the field and asserts the create receives it and that an empty one is refused on the
      step.
- [x] The refusal a mismatched group earns reaches the walk the way a failed create does today
      and names both groups; asserted in `setup-walk.svelte.test.ts`.
- [x] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test -- --test-threads=1` and
      `cargo fmt --check` pass; a changeset (`@rentable/desktop`, patch) rides with the change.

## Relevant areas

`apps/desktop/tauri/src/sync/turso/discovery.rs`, `organization/{setup,command}.rs`;
`apps/desktop/src/lib/organization/{setup,router}.ts`, `organization/component/setup-walk.svelte`,
`routes/organization/new/+page.svelte`, `platform/{host,tauri}.ts`, `platform/tests/testing.ts`,
`i18n/{en,ar}/index.ts`, and the tests beside them.

## Constraints

- **Why**: on 2026-09-15 a real first run into an empty group answered `HTTP 403:
  group-scoped tokens must specify a group in the request` from Turso's MCP `create_database`
  tool, which until then defaulted to the token's group. On an empty group nothing in the
  application can learn the group's name: the listing is empty, the token's claims carry
  `group_uuid` and not a name, and the MCP tool set has no group tool. The person knows it,
  because they picked it on Turso's own screen a moment earlier.
- **Read `discovery::create_first_database` as it stands** (commit `c6887d28`): it already reads
  a tool refusal, a record in the reply, and retries the listing. Add the argument; do not
  redo the rest.
- **[[rules/credentials]]**: the group's name is a fact, not a credential; it crosses as the
  organization's name does.
- **The connect step's statements do not change.** Requirement 13's four literals stay; the
  field lives on the name step.
- **No new act, no schema change.**

## Notes

Built by an implementer and landed on 2026-09-15, the human waiting to retry the first run.
Departures: the instruction guard (create, empty, pick) is applied to the field's label and
description, not to the connect statements, which keep the narrower make-a-group guard since
the pinned literal "on a paid account, pick an empty group" is one of them; the mismatched
group's sentence is pinned in `setup.test.ts` against `setup.rs` rather than in the component
test, since the refusal keeps the consent and goes to the shared toast, and the component test
asserts that the step stays filled in so the group is correctable; `setup-walk.svelte.test.ts`
mocks `$app/forms`' `applyAction` so a real submit runs; `nameDescription` was corrected in
both locales to the four fields.

Raised, not taken: `join.rs`'s live test now fails at the create rather than later where
`TURSO_GROUP` is merely plausible; an invalid superforms SPA submit sets no `$errors` under
vitest, so the empty-group refusal is asserted on blur; `refusalAfterFailedCreate` carries two
consent-keeping refusals with no way to put the cursor back in the field at fault.

Superseded on the field the same day by ticket 18: the group is asked for only where Turso refuses every way of naming it; the rest of this ticket stands.
