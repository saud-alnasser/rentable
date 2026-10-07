---
status: resolved
blocked-by: [33]
---

# fix(organization): a step a reader does not need holds no reader

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Duplicates never cost a record*).

## Outcome

Found while building ticket 33: a member with a read-only grant cannot apply a step, so with `0007` pending every existing workspace refused them as `WorkspaceBehind` until a full-access member opened it. A step declares whether a reader needs it; one that only removes a rule (`0007`) does not, so a read-only member opens the workspace as it is and the next full-access member applies the step.

## Acceptance Criteria

Traces requirement 1, requirement 13, criterion 1 and criterion 13.

- [x] Each step declared after 857 says whether reading needs it; `0007` says no, and a step that adds a table or a column reads say yes; the declaration test pins both.
- [x] A member with a read-only grant opens a workspace whose only pending steps a reader does not need, sees every record, writes nothing to the workspace or the organization, and is never refused `WorkspaceBehind`; a test.
- [x] A workspace with a pending step a reader needs still refuses a read-only member as `WorkspaceBehind`, as 0.20 does; a test.

## Relevant areas

- apps/desktop/tauri/src/database/step.rs, organization/lease/mod.rs

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset only if a user can observe it; say so if none.
