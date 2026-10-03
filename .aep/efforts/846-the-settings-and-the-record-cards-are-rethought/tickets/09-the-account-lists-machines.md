---
status: resolved
blocked-by: [03, 08]
---

# feat(desktop): the account section lists your machines

Blocked by: 03, 08

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The machines group replaces *sign out of other machines*: a row per machine with its name or the fallback, last seen and added, this machine first and marked; *sign out* on every other row, refused with its reason where the machine has not run this version; *sign out all other machines* as the group's end row. Both confirm, naming the machines, and keep today's offline sentence.

## Acceptance Criteria

Traces requirements 9, 10 and 11, and criteria 9, 10 and 11 at the router and interface.

- [x] `organization.session.machines` and `organization.session.endMachine({ machineId })` exist as `procedure.member`; `organization/tests/router.test.ts` maps them to their commands and gates. *Verified: `node --test organization/tests/router.test.ts .../sessions.test.ts` printed pass 34, fail 0; the router test maps `session.machines` and `session.endMachine` to their commands and to `Gate::Own`, read as member.*
- [x] `useFetchMachines` and `useEndMachine` announce sent and pending as `useEndOtherSessions` does, in both locales. *Verified: the same run: `sessions.test.ts` covers `useEndMachine` announcing sent and pending in en and ar beside `useEndOtherSessions`.*
- [x] A component test finds this machine first and marked, a nameless machine as *a machine added {date}*, sign out on other rows only, a machine that has not run this version refused with *sign out all other machines* offered, and the confirmation naming the machine or machines. *Verified: `vitest run organization/session/tests/machines.svelte.test.ts app/tests/settings-area.svelte.test.ts` printed 44 passed: this machine first and marked, the nameless fallback, sign out on other rows only, a not-updated machine refused (`MachineNotUpdated`, en and ar) with sign out all other machines offered, and both confirmations naming their machines.*
- [x] `end-other-sessions.svelte` is deleted. *Verified: `ls organization/session/component | grep -c end-other` printed 0.*
- [x] [[rules/api-layer]]'s procedure counts include the two procedures. *Verified: read rules/api-layer: 115 procedures, 14 member, both new procedures counted.*

## Relevant areas

- `apps/desktop/src/lib/organization/{host.ts,tauri.ts}`, `apps/desktop/src/lib/organization/session/{router.ts,query.ts,component/}`
- `apps/desktop/src/lib/organization/component/settings-account.svelte`

## Constraints

- This is a user-visible change: it carries its own changeset ([[references/changesets]]).
- The two-machine check by hand is ticket 20's.
