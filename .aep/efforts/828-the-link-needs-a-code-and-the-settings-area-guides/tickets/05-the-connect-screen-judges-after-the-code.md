---
status: open
blocked-by: ['04']
---

# feat(organization): the connect screen judges after the code

## Outcome

The connect screen reads a link without reaching anything, and what follows is the link's
kind: the organization's own link connects and leaves for the wall; an invitation link asks
for the code and the password and the accept judges; a second-machine link asks for the code
alone and the connect judges. A lapsed, consumed, revoked or foreign link is refused by name
after the code, on the step the screen already draws for refusals.

## Acceptance Criteria

Traces requirements 1 and 3 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 1,
3 and 12.

- [ ] `organization/connect.ts`: `JoinStep` gains `reading` in place of `inspecting`, keeps
      `paste`, `unreadable`, `unreachable`, `refused` and `password`, and gains `code` for a
      machine link; `linkKind` reads `LinkShape.kind`; `afterRead(link, shape)` answers the
      wall for an organization link, the `password` step for an invitation and the `code` step
      for a machine link, each with the organization's name from the shape; `joinFailed` maps
      the Rust codes of the accept and the machine connect onto `refused` (lapsed, consumed,
      revoked, another organization), `wrong` and `missing` code refusals onto the step's
      `codeRefusal`, and the network onto `unreachable`; `inspectionFailed` narrows to the
      decode. `organization/tests/connect.test.ts` drives every step with all three kinds.
- [ ] `routes/organization/join/+page.svelte` calls `linkRead`, then `connect` for an
      organization link, `invitation.accept(link, code, password)` for an invitation, and
      `machine.connect(link, code)` for a machine link, and leaves for the way in on success
      through `startup.standingChanged()` as today.
- [ ] `organization/component/connect-screen.svelte` draws the `code` step as the code field
      and an accept, the `password` step as the code field over the two password fields as
      today with no username line, and the refusals by name; `CODE_LAPSED`'s sentence and
      `codeLapsed` string go, and the lapsed-link sentence is the refused step's;
      `connect-screen.svelte.test.ts` finds the code field on an invitation and a machine
      link, none on an organization link, and every refusal.
- [ ] Every new or changed string is written in both locales; `pnpm check`, `pnpm lint` and
      `pnpm test` pass.

## Relevant areas

`apps/desktop/src/lib/organization/{connect.ts,component/connect-screen.svelte}`,
`apps/desktop/src/routes/organization/join/+page.svelte`,
`apps/desktop/src/lib/organization/tests/{connect,connect-screen.svelte}.test.ts`,
`apps/desktop/src/lib/i18n/{en,ar}/index.ts`.

## Constraints

- **Read [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/plan]], *The
  connect screen judges after the code*.**
- **The screen holds the link's text and the code, never a credential** ([[rules/credentials]],
  *Client boundary*).
- **A machine already holding the organization** meets an invitation link at the wall's
  disclosure as today (826, requirement 11): the accept passes through the connect where the
  organization is the held one.

## Notes
