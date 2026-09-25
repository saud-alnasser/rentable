---
status: open
---

# feat(organization): an organization carries a format, and one from another version is refused by name

## Outcome

A `format` table holds the organization format version, 2. An organization with no format row, or a
newer one, is read no further and written to not at all, at connect, sign-in and launch, and the
refusal tells the person what to do: an older organization is exported workspace by workspace,
deleted, and made again; a newer one needs the application updated.

## Acceptance Criteria

Traces requirement 11 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], and criterion 11.

- [ ] `store::TABLES` and `SCHEMA` carry `format (id, version)`; organization creation writes
      version 2.
- [ ] A Rust test opens an organization database in today's schema (no `format`), and one with
      version 3, through connect and through a held replica at launch: each is refused with its own
      `RefusalReason` and sentence, and a table listing before and after shows nothing written.
- [ ] A local replica in today's shape is forgotten on launch by the `forget::forget_old_shape`
      pattern, so it never meets the new reader.
- [ ] Both refusals have `i18n/en` and `i18n/ar` text and reach the wall or the connect step.
- [ ] A TS test imports an export fixture written by today's build (`workspace.get`'s shape) whole
      through `importWhole` into an empty workspace (criterion 11).

## Relevant areas

- `apps/desktop/tauri/src/organization/store.rs` (`TABLES`, `SCHEMA`, `complete_schema`)
- `organization/forget.rs`, `connect.rs`, `session.rs` (sign-in), `command.rs` (`organization_state_get`)
- `apps/desktop/src/lib/workspace/router.ts` (`get`, `importWhole`)

## Constraints

- `complete_schema` must not create the `format` table in an old organization, because its absence
  is how an old organization is told apart; the check runs before `complete_schema` does.
- The version is unsigned, per [[efforts/838-permissions-are-a-role-and-an-override/plan]], *Data Model*.
