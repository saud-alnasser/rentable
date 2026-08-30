---
status: open
---

# refactor(sync): the OAuth core stops being Google's

## Outcome

The provider-agnostic half of `sync/google/auth.rs` moves to `sync/oauth/` with no behaviour
change, so a second authorization server can be driven through it. Google sign-in still works
exactly as it does today and its tests still pass unchanged, because nothing about what the code
does is altered by this ticket.

## Acceptance Criteria

Traces requirement 3 of [[efforts/819-an-organization-hosts-its-own-workspaces/spec]]. It builds
none of requirement 3 itself; it is what ticket 03 needs in order to build it without writing a
second copy of a PKCE implementation.

- [ ] `sync/oauth/` holds the parts that name no provider: `random_url_safe_token`,
      `pkce_challenge`, `build_authorization_url`, `authorization_code_form`,
      `parse_token_response`, `parse_http_request_path`, `parse_query_map`, and the loopback
      listener `sync/session.rs::begin_google_sign_in` builds inline today.
- [ ] The loopback listener is a function that takes the callback path and returns the bound port
      and the parsed query, rather than a block inside a Google-named function. It is the piece
      ticket 03 cannot re-derive, and leaving it inline is what would force a second copy.
- [ ] What stays in `sync/google/` is what is Google's: the endpoint URLs, the client id and
      secret, the scope strings, and the shape of Google's own token response.
- [ ] **No behaviour changes and it is demonstrated rather than asserted.** Every existing test
      over `sync/google/auth.rs` passes with its assertions untouched, and where a test moves it
      moves without being rewritten. A test whose expectations had to change means this was not a
      refactor.
- [ ] `cargo test`, `cargo clippy` and the repository's gates pass.

## Relevant areas

`apps/desktop/tauri/src/sync/google/auth.rs` is 941 lines and already keeps the generic functions
separate from the Google-specific ones, which is why this is a move rather than an extraction.
`OAUTH_TOKEN_ENTROPY_BYTES` and the keyring service name `rentable.google-drive` are Google's and
stay.

`apps/desktop/tauri/src/sync/session.rs::begin_google_sign_in` is where the loopback server
actually is: `TcpListener::bind("127.0.0.1:0")` from `std::net`, an ephemeral port read back into
`redirect_uri = format!("http://127.0.0.1:{port}/callback")`, and a spawned thread running
`handle_google_sign_in_callback`. This ships today; it is not test scaffolding.

## Constraints

- **A refactor that changes behaviour is not this ticket.** If moving something requires changing
  what it does, leave it and say so in the ticket rather than doing both under one heading.
- **[[rules/credentials]], *Client boundary*, is unchanged by this.** Nothing moves closer to
  TypeScript. Everything here is and stays Rust.

## Notes

The plan records this as the discovery that mattered most: requirement 3 is a re-parameterisation
of code that ships and works, not new machinery. What is unknown about the consent is Turso's side
of it, and ticket 04 is where that is settled.

Nothing gates this ticket. It is one of three that can start immediately.
