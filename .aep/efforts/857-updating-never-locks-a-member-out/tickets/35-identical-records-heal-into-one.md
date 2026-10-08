---
status: resolved
blocked-by: [33, 34, 38]
---

# feat(records): identical records made apart heal into one

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Duplicates never cost a record*).

## Outcome

After every pull on a machine that may write, records sharing one of the four values whose every person-entered field is equal heal into the earliest; the later is retired, never deleted, what pointed at it moves to the survivor, and a later change that still arrives for it reaches the survivor. Records that differ are left as they are. Nothing of this is shown to anyone.

## Acceptance Criteria

Traces requirement 14 and criterion 14.

- [x] A nullable `merged_into` column on `tenant`, `complex` and `contract` arrives as an addition (a workspace step declared so), and every read of those tables, through the routers and the reconcile, excludes a retired record; a test per table.
- [x] The healing pass keeps the earliest (`created_at`, then `id`), points contracts, units, payments and history that referred to the later at it, and sets `merged_into`; it is deterministic and idempotent: two machines healing the same pair at once, in either sync order, end with the same survivor and nothing lost; tests.
- [x] On later passes, a reference created to a retired record moves to its survivor, and a field changed on a retired record after its merge is carried to the survivor where the survivor has not changed since; tests.
- [x] Two records sharing a value but differing in any person-entered field are left untouched; a test per table.
- [x] The pass runs only where this build may write the workspace (not read-only, not held), writes nothing when there is nothing to heal, and never fails a sync: an error is logged and the pass retried on the next pull; tests.
- [x] A live test on throwaway databases: two replicas offline create the same tenant with a contract each; after both sync and heal, every replica shows one tenant with both contracts.

## Relevant areas

- apps/desktop/tauri/src/database/ or the workspace engine's post-pull hook, apps/desktop/src/lib/tenant/, complex/, contract/ queries
- apps/desktop/tauri/migrations/

## Constraints

- The pass changes nothing a person entered: it only moves references and retires an exact copy.
- Live tests touch only throwaway databases the test creates and deletes in the Turso group `rentable`; no existing database is read or written; the group is listed before and after.
- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.

## Notes

- **An older build shows both copies, and is left so.** A build before `0008` does not know
  `merged_into`, so it reads a retired copy as the record it was. Before any pass ran it showed
  both copies anyway, so the heal makes nothing worse there; an edit it makes to the copy is
  carried to the record that stayed.
- **No changeset.** A person never sees a copy, and ticket 33's entry already says every record
  saved apart is kept.
- **Children heal one to one** (the coordinator's ruling at review): a unit, a contract or a payment
  under a retired copy pairs with an identical one under the survivor and is retired into it, or
  moves when it has none, so units are not listed twice and a paid amount does not double. `0008`
  adds the two columns to `unit` and `payment` as well, which it could since it had not shipped.
- **What a person entered** leaves out what the application derives: a unit's status and a
  contract's paid and expected amounts. `merged_as` holds a copy's fields as they last matched, the
  baseline a later edit of the copy is carried against.
