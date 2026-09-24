---
status: open
blocked-by: [22]
---

# feat(organization): joining reaches the application in one loading pass

## Outcome

Joining is the link and its code, then the password, then the application, with exactly one
loading pass after the password. Every refusal says what to do next in one line.

## Acceptance Criteria

Traces requirement 19 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criterion 19.

- [x] After `join` succeeds, the connect screen hands straight to the loading surface, with no busy
      surface of its own in between. Component test. Verified: `routes/organization/join/tests/page.svelte.test.ts`: after the accept the next state is `loading`, only `loading -> ready` follows, and the address arrives before `ready`; the real fault was an unawaited `goto` racing the pass, fixed by `standingChanged({ arrive })` (node tests in `startup.test.ts`); desktop vitest 323 of 323 on the merged tree.
- [x] The seven refusal texts (lapsed, consumed, consumedElsewhere, revoked, replaced,
      anotherOrganization, unreachable) are one line each, and each names the next step. Verified: the seven refusals are rewritten in en and ar; a component test checks in both locales that each is at most 80 characters, the only callout, shown once, with the shell's words behind a closed disclosure, and in English that each names a next step; desktop node 1158 of 1158.
- [ ] Checked by the human with a real invitation link.
 Awaiting the human's check with a real invitation link.
## Relevant areas

- `apps/desktop/src/lib/organization/component/connect-screen.svelte`, `organization/connect.ts:232,267,320`,
  `routes/organization/join/+page.svelte`
