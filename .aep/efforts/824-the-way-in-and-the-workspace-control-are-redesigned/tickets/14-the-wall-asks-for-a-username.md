---
status: resolved
blocked-by: [11]
---

# feat(layout): the wall asks for a username

## Outcome

The wall names the held organization and asks for a username and a password; a disconnect link
under it asks once and forgets the organization on this machine.

## Acceptance Criteria

Traces requirement 7, requirement 19, requirement 20, requirement 14 and requirement 15 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 7 and criterion 20 (the component half).

- [x] With one held organization, `startup-sign-in.svelte.test.ts` finds its name as text, inputs
      named `username` and `password` and nothing else that takes input, no `select` and no
      `[role=radio]`; submitting calls `onSignIn(username, password)`; the unlock carries a glyph
      and both fields a muted leading one. *Verified 2026-09-13 on the effort branch: `npx vitest run src/lib/layout/tests/startup-sign-in.svelte.test.ts` printed 11 passed, asserting inputs `username` and `password` only, no radio, no select, the name as a `P`, `onSignIn('olivia', ...)`, and the glyphs on unlock and both addons.*
- [x] `startup.signIn(username, password)` calls the port with both and runs the stages a sign-in
      runs; `startup.test.ts` holds it. *Verified: `node --import tsx --test src/lib/layout/tests/startup.test.ts` on the effort branch printed `pass 32, fail 0`, the sign-in case asserting the port was asked the pair and the stages ran.*
- [x] A disconnect control on the wall while signed out opens the confirm; confirming calls the
      disconnect port and the state returns to `noOrganization`. Asserted in the component test
      and in `startup.test.ts`. *Verified: the same two runs; the component's disconnect case opens `[data-slot=dialog-content]` and calls `onDisconnect` once on confirm; startup's disconnect case reaches `noOrganization` with the port called once, and a refused forget leaves `locked` with the sentence.*
- [x] The wall's title and description are unchanged in both locales; the username label and the
      disconnect sentences are written in both. *Verified: the child's `git diff` on both locale files is the three new keys and nothing else; its Arabic case renders the username label and the disconnect link from `ar`.*
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass. *Verified on the effort branch: `svelte-check` 9279 files 0 errors; the child's prettier, eslint, node:test (905) and vitest (89) runs are in its return.*

## Relevant areas

`apps/desktop/src/lib/layout/component/startup-sign-in.svelte` and its test, `layout/startup.ts`,
`layout/startup-ports.ts`, `sync/admission.ts`, the locales.

## Constraints

- **Read [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]], *The wall is a login page*.**
- **The wall's shape is the human's, settled 2026-08-20**: a title, a line, the way in. The
  username field sits above the password; the disconnect is a link at the foot beside the two
  that are there.
- **A changeset rides with the change.**

## Notes

Built 2026-09-13. What a later reader needs, each inside the plan's bounds:

- **The confirm is `organization/component/disconnect-dialog.svelte`**, for the organization
  page to mount when ticket 15 lands: props `open`, `onOpenChange`, `organizationName`,
  `onDisconnect(): Promise<void> | void`. It wraps the design package's `DeleteDialog`, which is
  the one destructive confirm the application uses, worded for this act: the organization is the
  record that leads, `layout.signIn.disconnect` is the title and the verb, and
  `layout.signIn.disconnectDescription` is the cost line. The handler is awaited before the
  dialog closes, and a throw is shown inside it. The wall's link is the wall's own, a third
  `variant="link"` button at the foot after open an invitation and set up an organization, and the
  page will offer its own control the same way. Because the dialog reads the string contract,
  the wall now renders under `DesignProvider` in its test (`wrapper`, with
  `design/tests/strings`); no fixture, since one provider is enough and the wall draws no tooltip.
- **`startup.disconnect()`** refuses while `isSigningIn`, calls the new `organization.disconnect`
  port (`startup-ports.ts` forwards to `tauri.organization.disconnect()`), re-reads the sync
  record since the forget emptied it, then runs `standingChanged()`, which reads the state,
  admits on it and raises the wall as `noOrganization` through `#raiseSignInWall` (which clears
  the cache). A port refusal is written to `snapshot.error` and the wall stays `locked` with the
  sentence in its callout, as a wrong password is; the dialog closes because the route's
  `onDisconnect` returns normally. The harness (`layout/tests/testing.ts`) gained the port, a
  `disconnected` count and a `disconnect` override for the refusal.
- **The wall's props are `organization: HeldOrganization | null`, `onSignIn(username,
  password)`, `onDisconnect`**; `organizations` and the select are gone, with `roleLabel` and
  the role on the line. The `roleOwner`, `roleAdministrator` and `roleMember` strings stay under
  `layout.signIn` because five other components read them. The organization line keeps its
  `organization` label and `data-sign-in-organization={id}`. The username field is
  `name="username"`, `autocomplete="username"`, with `UserIcon` (the invite form's and the
  rename dialog's glyph), and unlock needs a non-blank username and a password.
- **Strings**: `layout.signIn.username`, `layout.signIn.disconnect` ("disconnect this
  machine") and `layout.signIn.disconnectDescription`, in both locales, the Arabic written. The
  title and both descriptions are untouched. `common.actions.disconnect` already existed and is
  read by nothing; the wall's word is its own so the link, the title and the verb are one key.
- **`sync/admission.ts`'s `locked` comment** said the screen asks for a password; corrected to a
  username and a password in the same breath.
- **Not verified in the running application.** The gates ran in pieces, as the brief says the
  root wrapper cannot start in a worktree: `svelte-check` 0 errors, prettier and eslint clean,
  905 `node:test` and 89 Vitest tests passing. The Rust side is untouched.
