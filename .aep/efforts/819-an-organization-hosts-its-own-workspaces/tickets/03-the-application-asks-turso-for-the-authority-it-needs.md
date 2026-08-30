---
status: open
blocked-by: ['02']
---

# feat(sync): the application asks Turso for the authority it needs

## Outcome

`sync/turso/consent.rs` drives Turso's authorization code flow through the core ticket 02
extracted: registers the client, builds the authorization URL with a PKCE challenge and a loopback
redirect, exchanges the code, and puts the resulting Platform API token in the OS keyring. The
scope set it asks for is pinned by a test. Nothing yet drives a real consent; that is ticket 04.

## Acceptance Criteria

Traces requirement 4 and requirement 5 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 4 and
criterion 5.

- [ ] The requested scope set is a constant with a test over it, and the test asserts the set by
      value rather than asserting it is non-empty. Database deletion is absent from it. **The test
      is what makes criterion 4 checkable at all**, because the consent screen itself is the
      human's and cannot be asserted from here.
- [ ] The token exchange and the authorization URL are exercised against a loopback HTTP server,
      as [[rules/credentials]] endorses under *Transport testing*. The serialisation and the status
      handling are the subject, and a live server tests them worse.
- [ ] The Platform API token reaches the OS keyring under one new service, `rentable.turso-platform`,
      beside the two that exist. A test asserts it is written nowhere else: not a file, not a
      column, not an environment variable, not a log line.
- [ ] `organization_consent_begin` and `organization_consent_result` exist as Tauri commands with
      the shapes [[efforts/819-an-organization-hosts-its-own-workspaces/plan]] gives under
      *Interfaces*. `organization_consent_result` returns the organizations the token can reach and
      whether each is personal, which is what requirement 22 needs, and it returns **no token**.
- [ ] A failed or abandoned consent leaves nothing in the keyring and says which of the two it was.
      A user who closes the browser tab is the common case, not the exceptional one.
- [ ] `cargo test`, `cargo clippy` and the repository's gates pass.

## Relevant areas

`apps/desktop/tauri/src/sync/oauth/` is what ticket 02 leaves behind and is what this builds on.

`.aep/references/turso.md` and
`evidence/research/what-turso-lets-a-desktop-client-do-alone.md` in this effort carry what is
known about the surface: the authorization server metadata at
`api.turso.tech/.well-known/oauth-authorization-server`, dynamic client registration returning the
fixed `client_id` `turso-mcp`, PKCE S256, a public client with
`token_endpoint_auth_methods_supported: ["none"]`, and the group-scoped token vocabulary the scope
set is drawn from.

The organizations listing is `GET /v1/organizations`, and a personal account is distinguished from
an organization by the fields recorded in the evidence.

## Constraints

- **[[references/turso]], *Never run*, holds throughout.** This ticket mints nothing against the
  human's account, creates nothing, and rotates nothing. Its live half is ticket 04's and is asked
  for there.
- **[[rules/credentials]], *Client boundary*.** The token never crosses to TypeScript. The web
  layer learns that a consent succeeded and which organizations it reaches, and nothing else.
- **The scope set is a request, not a guarantee.** Whether the consent screen honours it is an open
  question in the spec that only ticket 04 answers. Write the request; do not write code that
  assumes the answer.

## Notes

If ticket 04 finds the authorize endpoint refuses a loopback redirect, requirement 3 falls back to
a pasted token and **this ticket's work survives**: the Platform API token still lands in the same
keyring service, and everything downstream is unchanged. That is why the fallback costs the effort
onboarding quality rather than architecture.
