---
status: open
---

# feat(organization): a link carries one sealed payload

## Outcome

No link but the organization's own carries a legible credential. An invitation or reset link
carries the issuer's own organization credential and the generated vault password sealed
under the link's secret and a six-character code together, the code lives as long as the
link, reading a link is a decode, and the act that takes the code unseals, reaches, connects
and judges. The organization's own link is unchanged and connects with no code. What a link
is worth is written once in the credentials rule and the organization context, and 826's
spec is corrected where this supersedes it.

## Acceptance Criteria

Traces requirements 1, 2, 4, 5 and 11 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 1,
2, 4, 5, 11 and 12.

- [ ] `link.rs`: `JoinLink` carries `credential: Credential::Clear(String) |
      Credential::Sealed(String)` serialised externally tagged, and `half: Option<Half { kind:
      HalfKind::Invitation | HalfKind::Machine, id, secret, expires_at }>`; `decode` refuses a
      text carrying `readOnlyCredential`, or a sealed credential with no half, or a half with a
      blank field, with the sentence a non-link gets; the fields test asserts the organization
      link's text names `credential.clear` and an invitation link's names `credential.sealed`
      and no `readOnlyCredential`, and a hand-written previous-shape link is refused as
      `InvalidInput`.
- [ ] `invite::issue` seals `{ credential, vaultPassword }` as JSON with
      `seal_under_member_key(derive_member_key(code, code_salt(secret), kdf), context(kind, id,
      expires_at), payload)`, `credential` being the session's `organization_credential`, and
      builds the link with the sealed field and an invitation half whose `expires_at` is the
      earlier of seven days from `now` and `setup::credential_expiry` of that credential;
      `invitation.code_seal` and `invitation.code_expires_at` are removed from the schema,
      `InvitationRecord` and `write_invitation`, `sealed_secret` holds password, secret and
      code under `ISSUER_COPY_SEPARATOR`, and `invitation_link` answers `InvitationLink {
      join_link, code }` rebuilt identically for the issuer and refused for anybody else;
      `invitation_code` and `write_invitation_code` are removed. A test asserts the payload's
      credential is the session's and its expiry within four weeks of `now`, on an invitation
      and on a reset.
- [ ] `join::inspect`, `LinkFacts`, `LinkStanding` and `InvitedFacts` are removed;
      `link::read(link) -> LinkShape { organization_id, organization_name, kind, expires_at }`
      answers from the text alone. `join::accept(store_for, machine, link, code, password,
      kdf, now)` unseals the payload first, refusing an empty code with `CODE_MISSING`, a link
      past its `expires_at` as a lapsed link before any key is derived, and a wrong code with
      `CODE_REFUSED`; then reaches with the unsealed credential, records the organization
      through `connect::connect` where the machine holds none and refuses another
      organization's link where it holds one, judges the row (lapsed, consumed, revoked, by
      name), opens the vault with the payload's password and runs the rest of today's accept.
      `CODE_LAPSED` is removed. Tests in `join.rs` cover the right code, a wrong, a lapsed-link
      and a missing code, a consumed row landing the machine connected, and the secrecy sweep
      adding the credential to what it sweeps a link's text and every row for.
- [ ] `connect::connect` and `organization_connect` accept the clear-credential link with no
      code and refuse a sealed link with a sentence saying it needs a code; a test in
      `connect.rs` connects with the organization's own link and no code.
- [ ] `command.rs` and `lib.rs`: `organization_link_read(link) -> LinkShape` replaces
      `organization_link_inspect`; `command::reached` takes the credential; `invitation_link`
      answers the code; `invitation_code` is removed; `Invited` loses `code_expires_at` and
      `expires_at` is the link's. `platform/host.ts`, `platform/tauri.ts`,
      `organization/router.ts` (`invitation.code` removed, `invitation.link` widened) and
      `organization/query.ts` (`useInvitationCode` removed) follow, and `router.test.ts`
      pins the procedures. `organization/dialogs.svelte.ts`'s `InvitedLink` carries `code:
      string` and `expiresAt`; `routes/settings/+page.svelte`, `settings/component/area.svelte`
      and `organization/component/members.svelte` lose `codeFor`, `freshCode` and
      `onFreshCode`, and the pending row's copy link opens the panel with the link and the
      code; `invite-form.svelte` shows the code with no countdown and no fresh-code control
      and the date the link lapses; `invite-form.svelte.test.ts` and
      `members.svelte.test.ts` follow. The connect screen compiles against the new host and
      is otherwise ticket 05's.
- [ ] [[rules/credentials]] and [[contexts/desktop/organization]] each carry one dated
      paragraph saying what each kind of link carries, what stands between a found link and
      the directory, and that the organization's own link is the one credential that never
      lapses; 826's requirements 10 and 23 and the context's *Link* entry carry a dated
      correction pointing at this effort; the index is regenerated.
- [ ] Every new or changed string is written in both locales; `pnpm check`, `pnpm lint`,
      `pnpm test` and `cargo test` pass; a changeset for `@rentable/desktop` rides with the
      change.

## Relevant areas

`apps/desktop/tauri/src/organization/{link,invite,join,connect,store,command,setup,vault}.rs`,
`apps/desktop/tauri/src/lib.rs`; `apps/desktop/src/lib/platform/{host,tauri}.ts`,
`apps/desktop/src/lib/organization/{router,query,dialogs.svelte,connect}.ts`,
`apps/desktop/src/lib/organization/component/{invite-form,members}.svelte`,
`apps/desktop/src/lib/settings/component/area.svelte`, `apps/desktop/src/routes/settings/+page.svelte`,
`apps/desktop/src/lib/i18n/{en,ar}/index.ts`, `.aep/rules/credentials.md`,
`.aep/contexts/desktop/organization.md`, `.aep/efforts/826-.../spec.md`, and the tests beside
each.

## Constraints

- **Read [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/plan]], *The link
  carries one sealed payload* and *Interfaces*, and the research file it cites.**
- **The code is checked by being used, never compared** (826, requirement 23): no stored
  verifier, no boolean. A wrong code fails the AEAD tag.
- **[[rules/credentials]]**: the unsealed credential lives in the `CredentialSlot` for the one
  pull and is held nowhere on disk; the code crosses typed, as today.
- **Nothing under a signature changes.** `invitation.v2`'s preimage is untouched.
- **The old-shape refusal is the migration** (plan, *Migration*): `forget::old_shape` gains
  no variant, and the seven-tables pin stays seven until ticket 04.
- The connect screen's flow is ticket 05's; this ticket keeps it compiling and its existing
  tests passing where they still describe the flow, marking the rest for 05 rather than
  deleting them.

## Notes
