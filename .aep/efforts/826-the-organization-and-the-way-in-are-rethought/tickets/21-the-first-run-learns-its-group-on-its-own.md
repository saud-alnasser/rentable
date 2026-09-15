---
status: resolved
blocked-by: ['18']
---

# fix(organization): the first run learns its group's name on its own

## Outcome

A first run into an empty group learns the group's name without asking: from the MCP server
where it now offers a tool that lists groups, and otherwise from the Platform API through the
one slug-free endpoint that names the user, whose username is a personal account's
organization slug, and the groups listing under it; the group is picked by the `group_uuid`
claim the consent token carries, or is the only one. The create then names it. The field
ticket 18 left as the last resort stays the last resort, reached only where both ways answered
nothing.

## Acceptance Criteria

Traces requirement 13 of [[efforts/826-the-organization-and-the-way-in-are-rethought/spec]] as
corrected on 2026-09-15 (third correction) and criterion 13, and the human's third run of the
build, where Turso refused the no-group create (`403 group-scoped tokens must specify a group
in the request`), `default` (`404 group default not found`) and the uuid (`404 group <uuid> not
found`) in turn.

- [x] `discovery::group_from_mcp(token, endpoint, group_uuid) -> Result<Option<String>, Error>`
      asks `tools/list`, and where a tool named `list_groups` (or the one tool whose name
      carries `group` and lists) exists calls it and reads records carrying a name and a
      uuid (both `structuredContent` and text content, the shapes `databases_from` reads),
      answering the name whose uuid matches, else the only name, else `None`; a server
      without such a tool answers `None` without error. Asserted in `discovery.rs` over the
      scripted server, both ways.
- [x] `TursoPlatform::group_named(&self, platform_token, group_uuid) -> Result<Option<String>, Error>`:
      the real client calls `GET /v1/user` and, with `user.username` as the organization
      slug, `GET /v1/organizations/{username}/groups`, answering the group whose `uuid`
      matches, else the only one, else `None`; a 403 or 404 on either call is `None` and not
      an error (a team organization's slug is not the username); `InMemoryPlatform` answers a
      configured name. Asserted in `platform.rs` over the scripted server, with the 403 case.
- [x] `setup::create_organization`, on an empty listing and with no typed group, learns the
      name through `group_from_mcp` then `group_named` and creates with it first; the cascade
      ticket 18 built (no group, `default`, the uuid) runs only where both answered nothing;
      the field is reached only after that. Asserted in `setup.rs`: a scripted MCP that lists
      the group creates with its name and makes no other create attempt; one that lists none
      falls to the platform's answer; both answering nothing runs the cascade as before.
- [x] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test -- --test-threads=1` and
      `cargo fmt --check` pass; a changeset (`@rentable/desktop`, patch) rides with the change.

## Relevant areas

`apps/desktop/tauri/src/sync/turso/{discovery,platform}.rs`, `organization/setup.rs`, and
their tests; `.aep/references/turso.md` if it lists what the platform port calls.

## Constraints

- **Why**: the human wants the first run seamless; the consent screen already had them pick
  the group, so the application should know it. The name is not in the token (only
  `group_uuid`), not in an empty listing, and not in the MCP tool set as read on 2026-09-11;
  the two probes here are the two places it can be, and both are reads.
- **[[rules/credentials]]**: the token stays in Rust; nothing new crosses.
- **[[references/turso]], *Never run***: nothing here creates, deletes or mints beyond the
  one create the first run already makes; the two probes are `GET`s and `tools/list`.
- **No live test**; the scripted servers are the evidence, and the human's next run is the
  proof.

## Notes

Built by an implementer and landed on 2026-09-15. Departures: `group_named` answers
`PlatformError`, the trait's own vocabulary, converted by `?` in `setup.rs`; a probe that errors
is treated as one that answered nothing, logged at warn, so a new read cannot fail a run that
ticket 18's path would have finished; one `organization.setup.groupNamed` diagnostic records
which way named the group (`mcp`, `platform`, `cascade`, `typed`) and never the name.

Raised, not taken: the empty-group first run opens three MCP conversations where one session
would do; `ScriptedServer`'s `platform_answering` deadlocks silently when called twice in a
test; a group record without a `uuid` is dropped and falls through to the cascade.
