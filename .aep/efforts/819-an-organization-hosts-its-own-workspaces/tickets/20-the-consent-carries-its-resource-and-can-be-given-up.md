---
status: open
---

# fix(sync): the consent carries its resource and can be given up

## Outcome

`sync/turso/consent.rs` completes a real Turso consent, which it cannot do today, and the owner
can hand the resulting authority back. The authorization and token requests carry RFC 8707's
resource indicator, and a disconnect forgets the token locally and tells the owner where Turso
revokes it.

## Acceptance Criteria

Traces requirement 3 and requirement 5 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 4 and criterion 5.

- [ ] **The authorization request and the token request both carry `resource`.** Without it the
      authorize endpoint answers *this authorization request is missing required OAuth parameters*
      and no consent screen is ever reached, which is measured in
      [[efforts/819-an-organization-hosts-its-own-workspaces/evidence/prototypes/one-real-consent]].
      The value is read from Turso's published protected-resource document rather than guessed, and
      a test pins the parameter and its value on both requests.
- [ ] The requested scope set is unchanged and its test still passes. Requirement 4 keeps asking
      narrowly even though nine scopes come back, because what was intended belongs on the record.
- [ ] **A test asserts the application never treats the granted set as the requested set.** The
      token carries `db:delete` and `db:rotate-creds` whatever is asked for, and a reader of this
      module should not be able to come away believing otherwise.
- [ ] `organization_disconnect` exists as a Tauri command, removes the token from the OS keyring,
      and leaves nothing behind that a later run could mistake for a live grant. A test asserts the
      keyring entry is gone and that the next provisioning call reports there is no authority
      rather than failing at Turso.
- [ ] The disconnect surface names where Turso revokes the token, in both locales, because
      forgetting it locally does not revoke it and a screen that implies otherwise is worse than
      one that says nothing.
- [ ] `pnpm test:rust` passes with `--test-threads=1`, and `cargo clippy` is clean.

## Relevant areas

`apps/desktop/tauri/src/sync/turso/consent.rs` is the module, landed by ticket 03. Its comment
beside the empty provider parameter list says none is the whole of what Turso asks for on top of
the two RFCs. That is wrong and this ticket is where it stops being wrong.

`apps/desktop/tauri/src/sync/oauth/authorization.rs` already threads a provider parameter list
through `build_authorization_url`, so the authorization half needs no new machinery.
`sync/oauth/token.rs::authorization_code_form` is the token half and has no such hook yet.

## Constraints

- **No live consent is required to build this.** The transport tests drive a scripted loopback
  server at the paths Turso publishes, which is what [[rules/credentials]] endorses under
  *Transport testing*, and it is how ticket 03 tested the same module.
- **[[references/turso]], *Never run*.** Nothing here creates, mints or deletes.
- The disconnect does not call Turso. There is no revocation endpoint in the authorization server
  metadata, so the honest surface is local forgetting plus a pointer.

## Notes

**This repairs a defect ticket 03 landed with**, found by ticket 04 on 2026-08-30. It is a separate
ticket rather than an amendment because ticket 03 is already a commit on the effort branch.

The disconnect rides here rather than in a later interface ticket because requirement 5 gained it
for one reason: the token has no expiry, measured as `{"exp":-1}`. The code that holds the token
and the code that gives it up belong in one diff.
