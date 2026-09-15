---
status: open
---

# feat(organization): every connected machine is registered

## Outcome

The organization database records each machine that holds it, the member signed in on it where
there is one, and when it was last seen. A machine registers when it connects, names its member
at sign-in, drops the member at sign-out, refreshes itself on every launch and leaves the
registry on disconnect. A machine counts as connected while it was seen within the last seven
days. The rows are unsigned and one reader answers the one question they exist for.

## Acceptance Criteria

Traces requirement 15 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 15
and 12.

- [ ] `store.rs`: `machine (id TEXT PRIMARY KEY NOT NULL, member_id TEXT, seen_at INTEGER NOT
      NULL, created_at INTEGER NOT NULL)` is the ninth entry of `TABLES` and `SCHEMA`, with a
      docstring saying it is unsigned and why; `register_machine(id, member_id, now)` (insert or
      replace), `machine_seen(id, member_id, now)`, `unregister_machine(id)` and
      `connected_machines(now) -> Vec<(MachineRecord, Option<MemberRecord>)>`, the last answering
      rows with `seen_at` inside `MACHINE_PRESENCE_WINDOW` (seven days) joined to the member row
      where `member_id` names one; none takes a signer; the eight-tables test becomes nine.
- [ ] `HeldOrganization` gains `machine_id: String`; `connect::connect` draws it and registers
      the machine with no member; the sign-in names the member and the sign-out clears it; the
      launch read (`organization_state_get`) refreshes `seen_at`, and a record with no
      `machine_id` (written before this) is given one and registered there; `disconnect` deletes
      the row before it forgets locally; every one of these pushes. Tests in `connect.rs` or
      `session.rs` read the registry after connect, sign-in, sign-out and disconnect and find a
      row with no member, the member, no member, no row; and `connected_machines` counts a row
      seen six days ago and not one seen eight days ago.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass; the changeset of ticket 03
      is extended with one line saying that the organization knows which machines hold it.

## Relevant areas

`apps/desktop/tauri/src/organization/{store,connect,session,command,mod}.rs`, the local
organization record and its migration on launch, `apps/desktop/src/lib/platform/host.ts` where
the record's shape is mirrored, and the tests beside each.

## Constraints

- **Read [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/plan]], *Every
  connected machine is registered*.**
- **Unsigned on purpose** (spec, *Risks*): no certificate is read or written.
- **One reader.** `connected_machines` is called by nothing in this ticket; ticket 10 is its
  caller. Nothing in the settings area lists machines (spec, *Out of Scope*).
- **A record written before this field** is migrated on launch and never refused.

## Notes
