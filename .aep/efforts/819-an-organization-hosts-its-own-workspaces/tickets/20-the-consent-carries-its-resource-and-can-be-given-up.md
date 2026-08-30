---
status: resolved
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

- [x] **The authorization request and the token request both carry `resource`.** Without it the
      authorize endpoint answers *this authorization request is missing required OAuth parameters*
      and no consent screen is ever reached, which is measured in
      [[efforts/819-an-organization-hosts-its-own-workspaces/evidence/prototypes/one-real-consent]].
      The value is read from Turso's published protected-resource document rather than guessed, and
      a test pins the parameter and its value on both requests.
      *Verified: `TURSO_RESOURCE_INDICATOR` is `https://mcp.turso.ai/mcp`, with the
      protected-resource document quoted above it.
      `the_authorization_url_carries_the_resource_turso_publishes` pins it on the authorization URL and
      pins the constant by value, and `a_granted_consent_exchanges_the_code_and_asks_turso_nothing_else`
      pins it on the form the token endpoint receives and asserts it is the same value the authorization
      request carried. `the_provider_parameters_a_caller_gives_reach_the_grant` covers the neutral core's
      new hook.*
- [x] The requested scope set is unchanged and its test still passes. Requirement 4 keeps asking
      narrowly even though nine scopes come back, because what was intended belongs on the record.
      *Verified: the array is still `["read", "db:create", "db:mint-token"]`, and
      `the_consent_asks_for_creating_databases_and_minting_their_credentials` and
      `the_consent_asks_for_no_authority_to_destroy_anything` are untouched and pass.*
- [x] **A test asserts the application never treats the granted set as the requested set.** The
      token carries `db:delete` and `db:rotate-creds` whatever is asked for, and a reader of this
      module should not be able to come away believing otherwise.
      *Verified: `the_set_turso_grants_is_not_the_set_this_application_requests` writes the measured nine
      down and asserts the six that arrive unasked, `db:delete` and `db:rotate-creds` among them, and that
      neither was requested. `the_requested_scope_set_is_readable_nowhere_but_here` scans the crate source
      and asserts only this module names the constant. The constant lost its `pub(crate)`, so the compiler
      enforces that too, and the module documentation states the nine-scope grant where it used to say the
      answer was unknown.*
- [x] `organization_disconnect` exists as a Tauri command, removes the token from the OS keyring,
      and leaves nothing behind that a later run could mistake for a live grant. A test asserts the
      keyring entry is gone and that the next provisioning call reports there is no authority
      rather than failing at Turso.
      *Verified: the command is registered in `lib.rs` and defined in `sync/command.rs`.
      `a_disconnect_forgets_the_token_and_leaves_no_authority_to_find` grants, asserts the token is filed,
      disconnects, asserts the store is empty, and asserts the next read answers `Error::NotConfigured`
      naming no Turso authority without a request reaching the loopback server.
      `a_disconnect_leaves_no_consent_a_later_read_could_take_for_a_grant` and
      `disconnecting_what_was_never_connected_is_not_an_error` cover the rest.*
- [x] The disconnect surface names where Turso revokes the token, in both locales, because
      forgetting it locally does not revoke it and a screen that implies otherwise is worse than
      one that says nothing.
      *Verified as copy rather than as a rendered screen. `i18n/tests/organization.test.ts` passes three
      tests: both locales carry the action, the description and the confirmation; both put
      `app.turso.tech` inside the sentence saying the grant survives; and neither confirmation claims a
      revocation, checked against each language's own word. **No component renders it yet**, because
      ticket 09 owns every organization screen and ticket 03 landed its two commands unbound in the same
      way. Recorded for the reviewer rather than smuggled.*
- [x] `pnpm test:rust` passes with `--test-threads=1`, and `cargo clippy` is clean.
      *Verified on the integrated effort branch rather than only on the child's:
      `cargo test --manifest-path ./tauri/Cargo.toml -- --test-threads=1` gives
      `234 passed; 0 failed; 4 ignored`. `cargo clippy --all-targets` gives five warnings, in
      `settings.rs`, `sync/store.rs`, `database/version.rs` and `database/mod.rs`, all of them predating
      this diff and none in a file it touches. `pnpm check` is 0 errors and 0 warnings, and `pnpm lint`
      and `pnpm test` are green.*

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

**The organizations listing was removed here**, which no criterion names and this ticket's outcome
requires. The consent's redemption called `GET /v1/organizations` and treated the answer as part of
redeeming, and that endpoint answers 403 to a group-scoped token, so a consent carrying `resource`
would still have ended `failed`. The amended requirement 22 no longer needs the listing and the
amended plan's *Interfaces* no longer return it. Discovering what replaces it is ticket 21 and was
deliberately not started here.

**This repairs a defect ticket 03 landed with**, found by ticket 04 on 2026-08-30. It is a separate
ticket rather than an amendment because ticket 03 is already a commit on the effort branch.

The disconnect rides here rather than in a later interface ticket because requirement 5 gained it
for one reason: the token has no expiry, measured as `{"exp":-1}`. The code that holds the token
and the code that gives it up belong in one diff.
