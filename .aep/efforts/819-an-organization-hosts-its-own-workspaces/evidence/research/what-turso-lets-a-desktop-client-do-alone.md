---

---

# Question

Can a desktop application obtain and use a customer's own Turso authority, with no
server of ours and no token pasted by the customer, and what does Turso enforce once it
has it?

# Sources

Read 2026-08-30. All primary unless marked.

| Source | What it is |
| --- | --- |
| `https://docs.turso.tech/llms.txt` | the documentation index. Read whole, to find surfaces nothing here knew about |
| `https://docs.turso.tech/api-reference/openapi.json` | the Platform API specification. Downloaded and read directly, not through a rendered page |
| `https://mcp.turso.ai/.well-known/oauth-protected-resource` | live metadata, RFC 9728 |
| `https://mcp.turso.ai/.well-known/oauth-authorization-server` | live metadata, RFC 8414 |
| `https://api.turso.tech/v1/oauth/register` | live. One registration request was sent |
| `https://docs.turso.tech/integrations/mcp` | how Turso describes that OAuth surface |
| `https://docs.turso.tech/sdk/authorization/jwks` | external auth providers |
| `https://docs.turso.tech/sdk/authorization/fine-grained-permissions` | per-table permissions |
| `https://docs.turso.tech/sdk/authorization/tokens` | platform and database tokens |
| `https://docs.turso.tech/sync/usage` | the sync client's three inputs |
| `https://turso.tech/pricing`, `https://clerk.com/pricing` | secondary, for the free tiers only |

# Findings

**source — Turso runs an OAuth 2.1 authorization server, and it advertises dynamic client
registration.** The authorization server metadata, live on 2026-08-30:

```json
{
  "issuer": "https://api.turso.tech",
  "authorization_endpoint": "https://app.turso.tech/oauth/mcp/authorize",
  "token_endpoint": "https://api.turso.tech/v1/oauth/token",
  "registration_endpoint": "https://api.turso.tech/v1/oauth/register",
  "grant_types_supported": ["authorization_code"],
  "response_types_supported": ["code"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"],
  "client_id_metadata_document_supported": true
}
```

`token_endpoint_auth_methods_supported: ["none"]` with `S256` is a public client with PKCE,
which is the shape RFC 8252 prescribes for a native application.

**observation — the registration endpoint accepted a loopback redirect URI.** One
`POST /v1/oauth/register` was sent, carrying
`redirect_uris: ["http://127.0.0.1:8976/callback"]`, `token_endpoint_auth_method: "none"`.
It answered 200 with the request echoed and `client_id: "turso-mcp"`. So registration is
open and returns a fixed client identifier rather than minting a per-client one. **Nothing
was created on the human's Turso account**: this endpoint registers an OAuth client, not a
database, and no consent was completed.

**interpretation — that is a strong signal and not a proof.** Many authorization servers
validate `redirect_uri` at the authorize step against a set the registration did not
actually record. Registration accepting the value does not establish that
`app.turso.tech/oauth/mcp/authorize` will redirect to it.

**source — the consent screen scopes the token, and Turso says the scoping is enforced
server-side.** From the MCP page: the human chooses the organization, optionally one group,
and for a group the permissions; "every tool call is checked for org-binding, role, and
scope, and recorded in your audit log", and "unscoped tokens are rejected".

**source — a group-scoped platform token carries a named scope set.** From `openapi.json`,
the request body of `POST /v1/auth/api-tokens`:

```
read   db:create   db:delete   db:configure   db:mint-token   db:rotate-creds
       group:configure   group:mint-token   group:rotate-creds
       read-only   full-access
```

The specification's own note: "`db:mint-token` lets the token issue new SQL credentials;
`db:rotate-creds` invalidates every existing SQL token for the database — they are
deliberately separate because rotation is destructive."

**conclusion — least privilege is expressible.** Authority to create databases and mint
credentials for them can be requested without authority to delete or to rotate.

**source — the endpoint that mints a database credential offers two levels and no more.**
`POST /v1/organizations/{org}/databases/{db}/auth/tokens`, query parameters `expiration`
and `authorization`, where `authorization` is an enum of exactly `full-access` and
`read-only`. Its request body carries only `permissions.read_attach`.

**source — per-table permissions exist, and not there.** `all:data_read`,
`comments:data_add,data_update`, over seven actions (`data_read`, `data_add`,
`data_update`, `data_delete`, `schema_add`, `schema_update`, `schema_delete`). The
documentation says they work with "CLI-generated tokens" and "JWKS-issued tokens", and the
REST mint above is neither.

**conclusion — a member's credential is whole-database.** A `full-access` member can reach
every table of their workspace outside the application. This is what decision 05 of
[[efforts/a-workspace-follows-its-user/spec]] already accepted, so it is a limit carried
forward rather than a new one. *This supersedes [[references/turso]]'s decision 01 note,
which reads "the fine-grained flags the CLI documents are not on this endpoint" — still
true of the endpoint, but it was recorded as though the flags did not exist for any caller,
and they do.*

**source — revocation is per database and total.**
`POST /v1/organizations/{org}/databases/{db}/auth/rotate` "invalidates all authorization
tokens for the specified database", with "a short downtime". *This corrects
[[references/turso]]'s Failure handling section, which says revocation "is bulk-only and
rotates every token in the group". It is per database.*

**source — external identity providers are supported, and limited to two.** A JWKS endpoint
registered on a Turso organization lets that issuer's JWTs authorize a database directly,
carrying fine-grained permissions in the claims. The page states: "During the Turso Beta, we
only support Clerk & Auth0 as OIDC providers."

**observation — JWKS is not in the Platform API.** `openapi.json` was searched for `jwks`
and returned nothing. `turso org jwks save <name> <url>` and the dashboard are the only
documented ways to register one.

**conclusion — the JWKS route is real, capable, and closed to this effort.** It would put
enforced per-table roles within reach and remove the credential distribution problem
entirely. It requires registering an application with Clerk or Auth0, which the effort's
constraints forbid. Recorded because it is the obvious answer, it is a good one, and
somebody will propose it again.

**source — there is no third-party OAuth for the Platform API in the ordinary sense.** The
authentication page documents the CLI and the dashboard as the ways an API token is
created, and names no OAuth application registration. The flow found above is documented as
an MCP integration.

**source — the sync client takes three inputs.** A local path, a `turso://` remote URL, and
an auth token. Bootstrapping from the remote happens on first connect unless
`bootstrapIfEmpty` is false. This matches what `apps/desktop/tauri/src/sync/` already does
against `turso` 0.8.0-pre.7.

**source — the free tiers, for the cost question only.** Turso: 5 GB, 100 databases, 500
million row reads per month. Clerk, read only to price the route being declined: 50,000
users, 100 organizations, 20 members per organization, custom JWT templates, all on the
free plan.

# Conclusion

**A desktop application can very probably obtain a customer's scoped Turso authority
through a browser consent with nothing pasted, and once it has it, Turso enforces the scope
server-side.** The authorization server is public, advertises dynamic registration, and
speaks the PKCE flow a native application uses. What it grants can be narrowed to creating
databases and minting their credentials.

What it cannot do: mint a credential narrower than whole-database read-only, revoke one
member without revoking all, or accept an identity provider other than Clerk or Auth0.

The one thing standing between "very probably" and "yes" is whether the authorize endpoint
honours a loopback redirect for a client that is not an MCP agent.

# Not checked

- **The authorize step itself.** Completing it needs the human at a browser and consents
  against their real account. Not done, and it is the first thing a prototype should do.
- **Whether the consent screen accepts a requested scope set** or always presents the full
  picker to the human. The metadata advertises no `scopes_supported`.
- **Whether the token the consent mints can be refreshed.** `grant_types_supported` lists
  `authorization_code` and not `refresh_token`, which suggests re-consent is the only
  renewal, but no token was obtained to inspect.
- **What `client_id_metadata_document_supported` requires**, and whether it is a better
  identification route than the fixed `turso-mcp` identifier that registration returns.
- **Whether the CLI's per-table permissions ride an undocumented field on the REST mint.**
  Answering it means capturing what `turso db tokens create -p` actually sends. Worth
  doing: if they do, requirement 11 becomes enforceable per table.
- **The `turso` crate's behaviour when a sync token expires mid-session.** Nothing was read
  about it and nothing was run.
- **Turso's terms of service**, on whether an application driving this OAuth surface on a
  customer's behalf is permitted. Not a technical question and not looked at.
