---
use-when: "deciding whether a desktop client can obtain Turso authority by browser consent"
---

# Hypothesis

Turso's authorization server honours a loopback redirect from a native public client, so
requirement 3's browser consent is buildable and nothing has to be pasted. Two facts ride on it:
that the consent grants the scope set the caller asks for rather than always presenting the full
picker, and that `GET /v1/organizations` distinguishes a personal account from an organization by
a `type` field.

# Falsifier

Written before the run, and any one of these abandons the hypothesis:

- **The authorize endpoint refuses the loopback redirect**, by any means: an error page, a
  redirect back with `error=invalid_request` or `error=invalid_redirect_uri`, or a registration
  that will not accept an `http://127.0.0.1:<port>/...` redirect URI in the first place.
- **The callback never arrives** at the bound loopback port after a granted consent, which is the
  same refusal wearing a network failure's clothes.
- **The token exchange is refused for a public client**, which would mean a desktop application
  cannot complete the flow without a secret it has nowhere to keep.

Two further things are measured rather than falsified, because the effort survives either answer:

- What the consent screen actually showed, and whether the scopes on the issued token are the
  three that were asked for.
- Whether the account reaches an organization or only a personal account, and on what tier.


# Sources

Everything below was produced on 2026-08-30 by one run of a throwaway binary,
`apps/desktop/tauri/src/bin/consent_probe.rs`, built in the `_prototype-consent` worktree
against the shipping `sync/turso/consent.rs`. The human completed the consent at a browser
signed into their own Turso account, described by them as **free tier**. Two discovery
documents were read with unauthenticated GETs. Nothing was created, minted or deleted.

# Findings

**source, the authorization server's own metadata, read without an account.** Both
well-known documents answer on `api.turso.tech`. The same paths on `app.turso.tech` answer
307 to the login page, which is what made the earlier probing look impossible.

```
GET https://api.turso.tech/.well-known/oauth-authorization-server   200
{"authorization_endpoint":"https://app.turso.tech/oauth/mcp/authorize",
 "client_id_metadata_document_supported":true,
 "code_challenge_methods_supported":["S256"],
 "grant_types_supported":["authorization_code"],
 "issuer":"https://api.turso.tech",
 "registration_endpoint":"https://api.turso.tech/v1/oauth/register",
 "response_types_supported":["code"],
 "token_endpoint":"https://api.turso.tech/v1/oauth/token",
 "token_endpoint_auth_methods_supported":["none"]}

GET https://api.turso.tech/.well-known/oauth-protected-resource     200
{"authorization_servers":["https://api.turso.tech"],
 "bearer_methods_supported":["header"],
 "resource":"https://mcp.turso.ai/mcp"}
```

All three endpoint constants in `consent.rs` match what is advertised. The second document
is the one that mattered and nobody had read it: **this authorization server issues for one
resource, and that resource is the MCP server.**

**observation, registration accepted the loopback redirect.** `POST /v1/oauth/register`
answered 201 with the request echoed:

```json
{"client_id":"turso-mcp","grant_types":["authorization_code"],
 "redirect_uris":["http://127.0.0.1:57133/turso/callback"],
 "response_types":["code"],"token_endpoint_auth_method":"none"}
```

**observation, the first authorize attempt was refused, and not over the redirect.** The
browser rendered a page reading, verbatim: *Invalid request. This authorization request is
missing required OAuth parameters.* The request carried `client_id`, `redirect_uri`,
`response_type`, `scope`, `state`, `code_challenge` and `code_challenge_method`, which is a
complete PKCE authorization request under RFC 6749 and RFC 7636.

**interpretation, the missing parameter was RFC 8707's `resource`.** The MCP authorization
profile makes the resource indicator mandatory on the authorization and token requests, and
the protected-resource document above names its value. The prototype was given
`resource=https://mcp.turso.ai/mcp` on both requests and the refusal stopped.

**observation, the loopback redirect is honoured.** With the indicator present the consent
screen rendered, the human granted, and the callback arrived at
`http://127.0.0.1:57133/turso/callback`. `POST /v1/oauth/token` answered 200:

```json
{"access_token": "<redacted, 470 chars>", "token_type": "Bearer"}
```

**conclusion, the hypothesis survives its falsifier and the effort's load-bearing assumption
is now a fact.** The authorize endpoint does not refuse a loopback redirect from a client
that is not an MCP agent, the callback arrives, and the token exchange is not refused for a
public client with no secret. The spec's first risk, *the consent flow is refused at the
authorize step*, is struck. It is struck on one account and one run.

**observation, the consent screen asked the human to pick a group and offered no way to make
one.** In the human's words: they cannot create a group, only select. The three scopes the
request asked for, `read`, `db:create` and `db:mint-token`, are not what the screen was
organised around, and **the token response carries no `scope` field at all**, so there is no
issued scope set to read back and compare with what was asked.

**observation, the token cannot see the account it was granted on.**

```
GET https://api.turso.tech/v1/organizations   403
{"error":"group-scoped token cannot access org-level resources"}
```

**observation, the token's own claims, from a second consent on the same account.** The probe
was changed to split the JWT and print its header and claim keys, showing values only for the
keys this question turns on and reducing every other value to a character count. The signature
was not touched and the token was never printed.

```
header  alg = "EdDSA"
header  typ = "JWT"
claims  group_uuid = <elided, 38 chars>
claims  jti        = <elided, 24 chars>
claims  org_id     = 26543
claims  scopes     = {"scopes":["db:configure","db:create","db:delete","db:mint-token",
                                "db:rotate-creds","group:configure","group:mint-token",
                                "group:rotate-creds","read"]}
```

**Four claims, and the list is exhaustive.** `aud`, `iss`, `exp`, `iat` and `nbf` were all in the
set the probe would have shown by value, and none of them is present. The token carries no
audience, no issuer and **no expiry**.

**conclusion, open question one is answered, and the full picker is what happens.** The consent
does not grant the scope set the caller requests. Three scopes were asked for, `read`,
`db:create` and `db:mint-token`. **Nine were granted**, the three asked for plus `db:configure`,
`db:delete`, `db:rotate-creds`, `group:configure`, `group:mint-token` and `group:rotate-creds`.
The spec's assumption that the consent screen lets the caller request a scope set is falsified,
and requirement 4 is a request this server does not honour as a constraint.

**conclusion, and this one is a security finding rather than a planning one.** The token the
application would hold **can delete a database and rotate a group's credentials**, and asking for
narrower authority does not prevent it. Requirement 4's *never deleting a database, unless the
human is deleting a workspace in the interface at that moment* is now a promise the application
keeps by its own restraint, with nothing at the authorization server enforcing it. Criterion 4 is
still checkable, because it pins the set **requested**, but it no longer says anything about what
is held. [[references/turso]] records a script clearing thirty databases out of a group on
2026-08-20 while holding a token like this one, which is what that risk looks like when it lands.

**conclusion, the token also has no expiry and no audience.** Four claims, none of them `exp`.
A bearer credential that does not age, carrying nine scopes, living on a customer's machine, is a
different object from the one requirement 5 was written against, and re-obtainable by repeating
the consent is a weaker mitigation for it than it sounds.

**conclusion, open question two is not answered, and the listing is not the only route to it.**
Whether a Turso organization requires a paid plan needed `GET /v1/organizations`, and this token
is refused there. But **the token carries `org_id` itself**, so the application can know which
organization it is acting in without the listing. What the claim does not carry is whether that
organization is a personal one or a team one, and a free-tier account having an `org_id` at all
says a personal account is an organization by this identifier's reckoning. Requirement 22's two
branches are still both unverified, and the mechanism it would use has changed.

**conclusion, requirement 3 survives in an amended form, and requirement 4 does not.** An
earlier draft of this file concluded that requirement 3 could not be satisfied at all. The claims
correct that. Requirement 3 asks that the owner types nothing, that no Platform API token is
pasted and that no organization slug or group name is typed: **all three hold**, because the
human picks a group from a list on Turso's own screen rather than typing one into ours, and the
token then carries the `group_uuid` and the `org_id` so nothing has to be asked for afterwards.
With `db:create` and `db:mint-token` in the grant, provisioning a database per workspace inside
that group is reachable, which is most of what the effort needs.

What does not survive is the shape of the authority. It is **one group of one organization**,
not the account, so an application that expects to create groups or to choose between
organizations cannot. And requirement 4 is defeated outright by the nine-scope grant above.

Two things still stand against criterion 3, *a first run creates an organization without the
human typing a token, a slug, a group name, or a URL*. The screen offers no way to create a
group, so a Turso account with none has nothing to select. And creating an **organization** is
not something this token can do at all.

**the alternative reading is ruled out.** RFC 8707's resource indicator narrows a token's
audience, so the 403 might have been our own doing rather than the consent screen's. The claims
settle it: **there is no `aud` claim at all**, and there is a `group_uuid`. The resource indicator
is required to get past the authorize step and it restricts nothing that we can see. The
narrowing is the group picker's, and it would be there whatever we sent.

**observation, which route the token can actually reach.** A third consent drove four reads and
an MCP handshake. Nothing was created.

```
GET /v1/organizations/26543            404  {"error":"organization 26543 not found"}
GET /v1/organizations/26543/databases  404  {"error":"organization 26543 not found"}
GET /v1/organizations/26543/groups     404  {"error":"organization 26543 not found"}
GET /v1/auth/validate                  200  {"exp":-1}

POST https://mcp.turso.ai/mcp  initialize  200  turso-cloud-mcp v0.1.0, protocol 2025-06-18
POST https://mcp.turso.ai/mcp  tools/list  200
POST https://mcp.turso.ai/mcp  tools/call list_databases  200
```

**conclusion, the `org_id` claim is not the slug and nothing maps one to the other.** Every
Platform API path in `apps/control-plane/src/workspace/turso.ts` is
`/v1/organizations/{slug}/...` and the claim is a number. Three paths answered *organization
26543 not found*, which is the server saying the parameter is a name it does not recognise rather
than refusing the credential.

**conclusion, the token is nonetheless accepted by the Platform API.** `/v1/auth/validate`
answered 200. The credential works against `api.turso.tech`; the only thing between it and
`turso.ts`'s five paths is the slug.

**conclusion, and it corrects an earlier line in this file, the token has no expiry.** The JWT
carries no `exp` claim, and `/v1/auth/validate` answers `{"exp":-1}`, which is the sentinel for
no expiry rather than a missing field. A bearer credential with nine scopes, no audience and no
lifetime.

**observation, `list_databases` returns the whole record and the slug is in it.** Each entry
carries `Name`, `hostname`, `group`, `group_id`, `organization_id`, `delete_protection`, `engine`
and the regions. Two things follow. `organization_id` is a **UUID and is not the `org_id` in the
token's claims**, which is a number, so the token names its organization one way and the listing
another. And the hostname is `<database name>-<organization slug>.<region>.turso.io`, the shape
[[references/turso]] already records, so **the slug is recoverable by removing the `Name` the
same record carries**. No parsing ambiguity, because the name is given rather than guessed.

**conclusion, the MCP server exposes no way to mint a database token.** Turso's own plugin
repository documents the tool set: `list_databases`, `get_database`, `set_database_config`,
`create_database`, `create_branch`, `list_branches`, `delete_database`, `database_analytics`, and
four SQL tools. Minting a per-database credential, which requirement 9's grants are made of, is
`POST /v1/organizations/{slug}/databases/{name}/auth/tokens` and exists only on the REST API. So
MCP cannot carry this effort on its own, and neither can REST without MCP telling it the slug.

**conclusion, the application cannot create a group.** Group create, group delete and group
transfer are documented as deliberately out of reach for a group-scoped token, and the MCP tool
set has no group tool at all. The group is whichever the human selected during consent, and it
must already exist. **Group transfer is one of the two succession mechanisms requirement 22
rests on**, and it is therefore something the customer performs in Turso's dashboard rather than
something the application can offer.

**conclusion, and it is the sharpest security consequence so far, the token reaches databases the
application did not create.** The group used in this run already held unrelated databases,
`control-plane` among them, which [[references/turso]] names under *Never run* as one that must
never be deleted. The consented token carries `db:delete` and `db:configure` over every database
in the group it is pinned to. Bounding that blast radius means the application's databases living
in a group of their own, and the application cannot make one.

# Not checked

- **What the four claims mean beyond their names.** `group_uuid` and `jti` were elided to a
  length by the probe rather than shown, deliberately, and `org_id` is a number with nothing
  read back against it. Whether organization 26543 is a personal one or a team one is exactly
  open question two and is not answered by having its identifier.
- **Whether `{"exp":-1}` means what it reads as.** It is taken here as no expiry. Turso does not
  document the sentinel, and the alternative, that a lifetime exists and is not reported, is only
  distinguishable by keeping a token and using it much later.
- **Whether the Platform API accepts the `organization_id` UUID in the slug position.** Only the
  numeric `org_id` was tried, and it 404s. The UUID from the listing was never sent, because by
  the time it was known the slug itself was too.
- **Whether any request to this authorize endpoint can omit `resource`.** It refuses without
  one, so there is no observation of what an unrestricted token would look like.
- **Whether a different `resource` value reaches the Platform API.** The protected-resource
  document advertises exactly one, and guessing costs a human consent per guess.
- **Whether the group-scoped token can create a database inside its group.** `db:create` was
  asked for and never exercised. [[references/turso]] forbids a live create against the
  human's account without being asked, and ticket 05 is where that would be asked.
- **Whether a paid account behaves differently at any point above**, including whether its
  consent screen offers organizations rather than groups.
- **Token renewal.** No `refresh_token` and no `expires_in` came back, and
  `grant_types_supported` lists only `authorization_code`. What the token's lifetime is was
  not established.
- **The dashboard route.** Whether a Platform API token created by hand in Turso's dashboard
  is the only way a desktop client reaches org-level authority was not tested here. It is
  what the fallback assumes and it is untested in this repository against a customer account.
