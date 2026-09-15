---
status: resolved
blocked-by: ['17']
---

# fix(organization): the walk asks for the group only when turso needs it, and hands over at once

## Outcome

The name step carries no group field until Turso refuses every way the application has of
naming the group on its own: the first create is tried without a group, then with `default`,
then with the group uuid the consent token carries, and only where all three are refused
over the group does the name step show a group field with the refusal above it. Once the
first workspace is created the form gives way to the loading surface at once rather than
sitting there while the machine's standing is read. And a machine that already holds an
organization and a workspace is sent home by the walk rather than shown its steps again.

## Acceptance Criteria

Traces requirement 13 of [[efforts/826-the-organization-and-the-way-in-are-rethought/spec]] as
corrected on 2026-09-15 (second correction), criterion 13, and the human's first run of the
build.

- [x] `CreateOrganization.group` is `Option<&str>`; on an empty listing
      `setup::create_organization` tries `discovery::create_first_database` with the typed
      group where one was given, and otherwise with no group, then `default`, then
      `discovery::group_uuid_of(platform_token)` (the `group_uuid` claim of the token's JWT
      payload, base64url decoded, `None` where absent), moving to the next only on a refusal
      whose reason mentions the group, and returning any other refusal as it is; where all
      are refused, `Error::PreconditionFailed` whose message begins with the fixed phrase
      `the turso group's name is needed` and carries Turso's last reason. Asserted in
      `setup.rs` over a scripted server (the argument shapes of the three attempts, the
      stop on a non-group refusal, the final sentence) and in `discovery.rs` for
      `group_uuid_of` over a hand-built token. `create_first_database(token, endpoint, name,
      group: Option<&str>)` sends `group` only where given.
- [x] `organization_create`'s `group` is optional through `command.rs`, `host.ts`,
      `platform/tauri.ts` and `organization/router.ts` (`z.string().trim().min(1).optional()`);
      `router.test.ts` pins both shapes.
- [x] `SETUP_WALK`'s name step lists `name`, `username`, `password`; `setup.test.ts` holds
      `fieldsPresented` to `['name', 'username', 'password', 'workspace']` and its guard
      forbids the word `group` in every statement again; `setup-walk.svelte` draws the group
      field on the name step only when the route hands it `askGroup: true`, with the refusal
      sentence above it; `refusalAfterFailedCreate` (or a sibling in `organization/setup.ts`)
      recognises the fixed phrase and answers the name step with `askGroup`; the route keeps
      the person's other fields; `setup-walk.svelte.test.ts` asserts the field is absent by
      default, present with the sentence when asked, and sent with the create.
- [x] `startup.standingChanged()` sets `state: 'loading'` before it reads where the machine
      stands, so the surface drawn until then gives way at once; `createFirstWorkspace` in
      `routes/organization/new/+page.svelte` awaits the navigation to the way in before it
      calls `standingChanged`, and the walk's `isCreating` stays true from the create until
      the hand-over; `startup.test.ts` asserts `loading` is observed before `ready` on a
      `standingChanged` that admits.
- [x] The walk's resume effect sends a session that holds a workspace to the way in
      (`goto(THE_WAY_IN)`) rather than drawing a step; `useCreateWorkspace` invalidates the
      organization state so the walk's query does not keep saying no workspace; asserted in
      the walk's or the route's tests where one can drive it, otherwise in `setup.ts` as a
      pure decision (`stepFor(session)` answering `'workspace' | 'leave' | null`).
- [x] Every new string is written in both locales; `pnpm check`, `pnpm lint`, `pnpm test`,
      `cargo test -- --test-threads=1` and `cargo fmt --check` pass; a changeset
      (`@rentable/desktop`, patch) rides with the change.

## Relevant areas

`apps/desktop/tauri/src/sync/turso/discovery.rs`, `organization/{setup,command}.rs`;
`apps/desktop/src/lib/organization/{setup,router,query}.ts`,
`organization/component/setup-walk.svelte`, `routes/organization/new/+page.svelte`,
`layout/startup.ts`, `platform/{host,tauri}.ts`, `i18n/{en,ar}/index.ts`, and the tests beside
them.

## Constraints

- **Why**: ticket 17 made the group a required field; the human found that a first run into
  a group holding anything never needed it (the listing names the group) and does not want a
  field for the one case, and Turso's default group and the token's own claim cover most of
  that case without asking. The field is the last resort, shown when it is the only way.
- **The three attempts happen only on an empty listing**, which is the one first run of a
  fresh account; a listing that names the group takes the Platform API path as before, and a
  typed group that differs from it is still refused by both names (ticket 17).
- **[[rules/credentials]]**: decoding the token's payload happens in Rust and only the
  `group_uuid` claim is read; nothing of the token crosses.
- **The walk's tests drive the surface, not the route**: put the decisions in
  `organization/setup.ts` where a `node:test` can reach them.
- **In `pnpm dev` the Vite dependency optimizer reloads the page on a first run**; that is
  not this ticket's, but the walk leaving an admitted machine is what makes such a reload
  harmless.

## Notes

Built by an implementer and landed on 2026-09-15. Departures: criterion 3's guard forbids the
word `group` in every field the walk presents rather than in every statement, since
requirement 13 has the connect step say what the consent covers in the group chosen, so two
statements carry the word by design; the statements keep ticket 17's instruction guard, and
two named constants carry the reason; `standingChanged` restores the prior state where the
read of the standing throws, so a failed read is not stranded under a loading surface.

Raised, not taken: each attempt of the cascade opens its own MCP handshake; whether a refusal
is about the group is read off the substring `group` in Turso's free-text reason, the only
signal there is; Turso's last reason reaches the person through the shared toast and not
under the field; from a worktree of this path length the node gates need `ESBUILD_BINARY_PATH`
pointed at a short copy of `esbuild.exe`, a tooling fact of the worktree and not of the tree.
