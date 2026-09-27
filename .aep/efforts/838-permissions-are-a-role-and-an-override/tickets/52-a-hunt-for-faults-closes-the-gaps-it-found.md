---
status: resolved
blocked-by: [51]
---

# fix(desktop): a hunt for faults closes the gaps it found

## Outcome

After the close, the human asked for faults to be looked for and fixed. Four readers went over the
branch (the updates and migrations, the roles and permissions in Rust, the permission surfaces,
and the record routers), and what they found and the orchestrator confirmed in the code is closed
here. The owner's lock could be lifted by a manager, directly or by withdrawing and granting again;
the organization's own directory grant could be withdrawn as though it were a workspace; a grant
could reach a removed member; an account refused for a workspace was left half made, holding its
username; an account could be made with an override by somebody without the flag to override
members. A retried upgrade made a protected copy on the owner's account each time; a failure after
a workspace's migration committed kept its lease for half an hour; a failed release hid the
refusal it followed. The selection plans asked `create*` where they preview deletes; a complex
entered with units made units without `createUnit`; undoing a contract's deletion logged a
creation, which the restore's editor could not append; records read before a narrowing stayed
drawn; a member card left open over a refusal compared the next save with the row as it was; a
refused role pick left the list marking it; and the owner without the Turso authority could not
lock again a grant they had just unlocked.

## Acceptance Criteria

Traces requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], with
requirements 6, 7, 8 and 13.

- [x] A manager holding `grantWorkspace` is refused both lifting a read-only grant and withdrawing
      it, the owner withdraws it, and the directory grant is refused as no workspace; a test.
- [x] An account refused for a workspace writes nothing and its username stays free; a test.
- [x] An override on a new account asks `overrideMember`, in Rust and on the form; a test.
- [x] The account's copy is made once per database and change; a test.
- [x] The lease is released after a failed record, and a failed release is logged rather than
      answered.
- [x] `planMany` takes the kind's `view*`, and `complex.create` with units asks `createUnit`;
      tests.
- [x] A heartbeat that moves the permissions or a grant's level reads every record again; a test.
- [x] Only the owner switches out a locked row, and the owner without the authority may lock again
      what was locked; tests.
- [x] `pnpm check`, `pnpm test`, `pnpm lint` and `cargo test` pass.
