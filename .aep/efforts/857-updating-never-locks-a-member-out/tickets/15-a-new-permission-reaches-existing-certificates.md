---
status: open
blocked-by: [06]
---

# feat(organization): a new permission reaches existing certificates

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Migration, the new permission*).

## Outcome

At the owner's first sign-in on a build whose owner role knows more flags than the owner's root certificate carries, the owner's machine re-issues the root with the full owner mask and retires the old one, adds `upgradeData` once to the stored manager role, and re-issues every live certificate whose standing now reaches further than its ceiling; every row and certificate still verifies, and the next new flag takes the same path.

## Acceptance Criteria

Traces requirement 3 and criterion 3.

- [ ] An organization seeded with a root whose ceiling lacks bit 18 is, after the owner's sign-in on this build, held under one live root whose ceiling is `OWNER_ROLE.mask`; the old root is revoked, and every row and certificate in the organization verifies (the handover's every-row test, applied here).
- [ ] The stored manager role gains bit 18 as a signed write and keeps any other edit; a test covers an edited and an unedited manager role, and a manager role the owner later edited to drop bit 18 does not regain it at the next sign-in.
- [ ] Each live manager's certificate, and any custom role holder's whose role carries bit 18, is re-issued with a ceiling holding it; a manager can then grant `upgradeData` by override and the owner can sign a custom role carrying it.
- [ ] A second sign-in writes nothing; a member's or manager's sign-in writes nothing of this; a store holding the pre-857 code path (the rows as a pre-857 build reads them) still verifies every row.
- [ ] Until the owner has signed in, a manager asking to upgrade is refused with the reason that the owner has not opened this version yet (the reason exists for ticket 07 to use).

## Relevant areas

- apps/desktop/tauri/src/organization/authority/ (certificate, chain), organization/role/certificate.rs (`reissue_within`)
- apps/desktop/tauri/src/organization/ownership/mod.rs (the handover's re-signing, the pattern)
- apps/desktop/tauri/src/organization/session/signin.rs, remember.rs (`owner_row_repaired`)

## Constraints

- Data at rest in every organization: the human chose this path on 2026-10-07; follow the plan's Migration and stop if it cannot be met.
- Only the owner's machine writes; nothing happens on a member's.
- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]).
- A live check on a throwaway organization in the Turso group `rentable` is listed for the close as a human check.
