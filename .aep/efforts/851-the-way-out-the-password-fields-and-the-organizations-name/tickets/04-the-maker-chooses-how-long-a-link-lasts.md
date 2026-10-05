---
status: open
blocked-by: [03]
---

# feat(organization): the maker of a link chooses how long it lasts

Authoritative: [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]], and [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/plan]] (*Links are spent before anything is recorded, and lapse when their maker says*).

## Outcome

Making a link asks how long it and its code last, from one hour to one week in the plan's steps, three days unless changed. The shell refuses anything else. An owner's machine seals a database credential minted to die at the link's lapse; a manager's seals the manager's grant. The handover prints when the pair lapses with date and time.

## Acceptance Criteria

Traces requirement 11 and criterion 11.

- [ ] `make_link` and its command and router take `lifetimeHours`; Rust refuses any value outside {1..23, 24, 48, 72, 96, 120, 144, 168} with a new `RefusalReason::LinkLifetime`; the router's zod schema says the same; `INVITATION_LIFETIME_MS` retires and `link_expiry` is `min(now + lifetime, credential expiry)`.
- [ ] Where `owner_platform` answers for the maker's organization, `make_link` mints a token for the organization database with `expiration` equal to the lifetime and seals it in place of the maker's grant; otherwise it seals the maker's grant. The Turso duration for hours is checked against [[references/turso]] and written in minutes where `h` is not accepted; the reference records what was confirmed.
- [ ] Rust tests: links made with 1 hour, 72 hours and 168 hours carry exactly that expiry, or the credential's death where sooner; 0, 25, 169 and 200 hours are refused; a link opened past its expiry is refused as lapsed; on an owner's machine (in-memory platform) the sealed credential's own `exp` equals the link's expiry, on a manager's it is the manager's grant.
- [ ] The link act offers the lifetime as a choice (`primitive/select`, per [[contexts/desktop/components]], *choose a value*) listing 1 to 23 hours, 1 to 6 days and 1 week in that order, starting at 3 days, in English and Arabic with the reader's digits; the handover (`link-handover.svelte`) prints the lapse with date and time in the reader's locale. Component tests cover both.
- [ ] Offline, an owner's link is refused with the network sentence the link act already uses, never sealed with the grant instead.
- [ ] A changeset.

## Relevant areas

- `apps/desktop/tauri/src/organization/invitation/{mod.rs,command.rs}`, `organization/act.rs` (`owner_platform`), `tauri/src/turso/platform/`
- `apps/desktop/src/lib/organization/member/{router.ts,component/link-handover.svelte,component/made-link.svelte,component/host.svelte}`

## Constraints

- Minting goes through the Platform API only from the owner's machine; never rotate anything ([[references/turso]]).
- Until ticket 06 makes the consent per organization, `owner_platform` is today's single one; 06 re-keys it without changing this ticket's behaviour.
