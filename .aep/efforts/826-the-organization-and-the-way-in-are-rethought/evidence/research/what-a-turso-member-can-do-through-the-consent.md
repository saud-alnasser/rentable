---
use-when: "deciding what a Turso organization member who is not the owner may do through a consent-issued token, or what role a person needs before the desktop asks them to authorize"
---

# Question

When a Turso organization's member whose role is `admin`, `member` or `viewer` rather
than `owner` authorizes a desktop application through Turso's OAuth consent at
`https://app.turso.tech/oauth/mcp/authorize`, what authority does the resulting
group-scoped token carry over the organization's group, and what does each role let that
person do through the Platform API?

# Sources

All read 2026-09-13. Primary unless marked. The whole of `docs.turso.tech` was pulled as
Markdown, 278 pages, every URL in `llms.txt`, so that the absences below are absences of
the documentation and not of the search.

| Source | What it is |
| --- | --- |
| `https://docs.turso.tech/llms.txt` | the documentation index. Used to enumerate every page |
| `https://docs.turso.tech/api-reference/authentication` | the group-scoped token contract: scope vocabulary, presets, lifecycle, org token management |
| `https://docs.turso.tech/cli/auth/api-tokens/mint` | the same contract stated for the CLI, with the scope table repeated |
| `https://docs.turso.tech/integrations/mcp` | how Turso describes the consent screen and what it scopes |
| `https://docs.turso.tech/api-reference/openapi.json` | the Platform API specification. Downloaded, 115 KB, and searched directly |
| `https://docs.turso.tech/api-reference/organizations/members/{list,retrieve,add,update,remove}` | the four member routes and the `Member` schema |
| `https://docs.turso.tech/api-reference/organizations/invites/create-v2` | the invite route and its role enum |
| `https://docs.turso.tech/api-reference/tokens/{create,list-organization,revoke-organization}` | platform token minting, listing and revocation |
| `https://docs.turso.tech/api-reference/databases/{list,create-token,invalidate-tokens}` | database enumeration and SQL credential lifecycle |
| `https://docs.turso.tech/api-reference/groups/{list,retrieve,create-token,invalidate-tokens,transfer}` | group routes |
| `https://docs.turso.tech/sdk/authorization`, `.../authorization/tokens` | SQL-engine token scoping, CLI flags |
| `https://docs.turso.tech/cli/org/members/{list,add,rm,invite}`, `cli/org/create`, `cli/org/billing` | the CLI's own wording for member and billing operations |
| `https://raw.githubusercontent.com/tursodatabase/turso-mcp/main/README.md` and `claude-code/skills/turso/SKILL.md` | Turso's own MCP plugin repository, which enumerates the server's tool set |
| `https://turso.tech/blog/organization-api-platform-saga-part-3` | **secondary and dated.** Turso's own blog, 2024-03-01, the only prose that defines admin against member |
| `[[references/turso]]`, `[[efforts/819-an-organization-hosts-its-own-workspaces/evidence/research/what-turso-lets-a-desktop-client-do-alone]]`, `[[efforts/819-an-organization-hosts-its-own-workspaces/evidence/prototypes/one-real-consent]]` | this repository's own record, read first |

# Findings

## The role vocabulary and what each role is documented to do

**source, there are four roles and the enum is closed.** The `Member` schema in
`openapi.json` gives `role` as an enum of `owner`, `admin`, `member`, `viewer`, described
only as "The role assigned to the member." The routes that write a role, add member,
update member role, and create invite, accept a narrower enum of `admin`, `member`,
`viewer`, defaulting to `member`. `owner` is therefore readable but not assignable
through the API.

**source, five statements in the whole of the documentation say what a role permits.**
These are quoted in full because they are the entirety of it.

| Operation | What the source says | Where |
| --- | --- | --- |
| add a member | "You must be an `owner` or `admin` to add other members. **You can only add users to a team and not your personal account.**" | `api-reference/organizations/members/add` |
| invite a member | "You must be an `owner` or `admin` to invite other users. **You can only invite users to a team and not your personal account.**" | `api-reference/organizations/invites/create-v2` |
| change a member's role | "Only organization admins or owners can perform this action." The 403 example body is `updating member roles is only allowed for admin or owner` | `api-reference/organizations/members/update`, and the same text in `openapi.json` |
| mint a group-scoped platform token | "The caller must be an admin or owner of the organization." Repeated by the CLI page as "You must be an admin or owner of the organization to mint a group-scoped token." | `api-reference/tokens/create`, `cli/auth/api-tokens/mint` |
| transfer a group | "You can only transfer groups to organizations you own or are an admin." | `api-reference/groups/transfer` |

**source, two more statements split `member` and `viewer` from `admin` and `owner`, and
they are about tokens rather than about databases.** On both
`GET /v1/organizations/{organizationSlug}/api-tokens` and
`DELETE /v1/organizations/{organizationSlug}/api-tokens/{tokenId}`: "**Admins and owners**
see every token scoped to the organization, with the minting user attached in the `owner`
field." and "**Members and viewers** see only tokens they minted themselves." The same
pages say admins and owners "can revoke any token scoped to the organization
(org-scoped or group-scoped, regardless of who minted it)" while "**Members and viewers**
can revoke only tokens they minted themselves." Turso's own gloss: "This mirrors the
personal-access-token model used in GitHub organization settings."

**observation, and this is the largest finding of the investigation. Nothing else exists.**
`viewer` appears on exactly six pages of the 278, and all six are the member and invite
routes, where it appears only inside an enum. No page states who may create a database,
delete a database, create or delete a group, mint a database auth token, rotate
credentials, remove a member, change the plan, enable overages, or open the billing
portal. There is no role matrix, no permissions page, and no `403` documented on any
database or group route. `api-reference/response-codes` defines `403` generically as
"`Forbidden` , You do not have permission to access this resource" and names no role.

**source, secondary and dated, the one prose definition Turso has published.** From
`turso.tech/blog/organization-api-platform-saga-part-3`, dated 2024-03-01: "The role of
the member you're adding can be admin or member. An admin can manage the organization and
its members, while a member can only access the organization's resources." The post
predates `viewer` entirely, so it defines two of the four roles and is 18 months old.
Treat it as weak.

**conclusion, sub-fact 1 is answered only for member administration and token
administration, and is unanswerable from documentation for everything else.** Adding a
member, inviting a member, changing a role, minting a group-scoped token and transferring
a group are documented as owner or admin. Seeing and revoking other people's platform
tokens is documented as owner or admin. Creating and deleting databases and groups,
minting database tokens, rotating credentials, removing a member and changing billing are
**not documented against any role at all**.

## Whether a non-owner can complete the consent, and whether the grant depends on role

**source, the consent screen is organization-first and does not mention ownership.** From
`integrations/mcp`: the person lands "on a consent screen where you choose **what the agent
can access**", listing "the **organization**", "optionally a single **group** to limit the
token to", and "for a group, the **permissions** (read-only, full-access, or a custom
set)." It adds "To re-scope or switch organizations, disconnect and authenticate again."

**source, the organization list an account can reach is not restricted to the ones it
owns.** `GET /v1/organizations` is described as "Returns a list of organizations the
authenticated user owns or is a member of", and `turso org list` as "To list organizations
of which you are the owner or a member". The `Organization` schema carries
`type: personal | team`.

**interpretation, the picker very probably offers organizations a person does not own.**
The listing the screen would be built from includes them, and the page never qualifies the
choice by role. This is inference from an adjacent route, not a statement about the screen.

**source, and it cuts the other way, minting a group-scoped token is documented as an
owner or admin operation.** Both `api-reference/tokens/create` and `cli/auth/api-tokens/mint`
say so in the same words. The consent screen mints exactly this kind of credential:
`integrations/mcp` says consent "mints the scoped token the agent then uses", and Turso's
plugin repository says "Consent (org / group / scopes) happens on the Turso dashboard,
which mints a scoped token".

**interpretation, a `member` or a `viewer` may therefore be refused a group-scoped consent,
or may be offered only the whole-organization option, or may be refused nothing at all
because the consent path does not run the REST route's precondition.** Three outcomes are
consistent with the documentation and it distinguishes none of them.

**observation, no page anywhere says what scopes a given role is granted.** The nine-scope
grant this repository recorded on 2026-08-30 against an owner
(`[[efforts/819-an-organization-hosts-its-own-workspaces/evidence/prototypes/one-real-consent]]`)
has no documented counterpart for any other role. The scope table on
`api-reference/authentication` describes the scopes as a property of the token type and
never as a function of who minted it.

**source, role is nevertheless a second gate at call time.** `integrations/mcp`: "Either way
the token is enforced at Turso's API: every tool call is checked for org-binding, role, and
scope, and recorded in your audit log." The plugin repository repeats it: "every tool
forwards it to the real Turso API, which enforces org-binding, role, scope, and audit. The
MCP layer holds no privilege."

**conclusion, sub-fact 2 is unanswerable from documentation.** Whether a non-owner can pick
an organization they only belong to is not stated; whether the grant narrows with the role
is not stated; and the one directly relevant sentence, that minting a group-scoped token
requires admin or owner, points at the consent being refused for `member` and `viewer`
without ever saying so. What **is** documented is that role is checked on every call
independently of the scopes on the token, so a scope list read off a token is not a
statement of what its holder can do.

## What a group-scoped token can read, and how it enumerates its group's databases

**source, `read` covers exactly this.** From the scope table on `api-reference/authentication`
and repeated verbatim on `cli/auth/api-tokens/mint`: "`read` , All GET-style routes:
list/retrieve databases and groups, configuration, usage, instances, locations."

**source, the documented route takes a filter.** `GET /v1/organizations/{organizationSlug}/databases`
accepts a query parameter `group`, described as "Filter databases by group name." The path
parameter is defined as `organizationSlug`, "The slug of the organization or user account."
`GET /v1/organizations/{organizationSlug}/groups` and
`GET /v1/organizations/{organizationSlug}/groups/{groupName}` take the same slug parameter
and no other.

**interpretation, this repository's 404 was the parameter, not the credential.**
`[[efforts/819-an-organization-hosts-its-own-workspaces/evidence/prototypes/one-real-consent]]`
sent the numeric `org_id` claim, `26543`, in the slug position and got
`organization 26543 not found` from all three of `/databases`, `/groups` and the
organization itself, while `/v1/auth/validate` answered 200. The specification defines the
parameter as a slug and offers no numeric form, which is consistent with that reading and
does not prove it.

**conclusion, sub-fact 3 is answered.** The documented way for a group-scoped token to
enumerate its group's databases is
`GET /v1/organizations/{slug}/databases?group={group}` under the `read` scope, and
`GET /v1/organizations/{slug}/groups/{group}` is likewise inside `read`. Both need the
slug, which the token's own claims do not carry. Nothing in the documentation offers a
group-scoped route that omits the organization from the path, so the MCP `list_databases`
detour this repository built remains the only documented way to **learn** the slug.

**source, what a group-scoped token can never do, whatever its scopes.** "Group create,
group delete, group transfer, and AWS migration are never reachable from a group-scoped
token at any scope." (`cli/auth/api-tokens/mint`; the API page adds that those operations
"are gated to organization-level credentials".)

**source, the token dies with the group.** "Group-scoped tokens are pinned by the group's
UUID, not its name." "Deleting a group cascades a revoke to every token scoped to it."
"Transferring a group to a different organization cascades a revoke to every token scoped
to it."

## Whether a token holder can remove or change another member

**source, no scope reaches a member.** The group-scoped scope vocabulary is closed at nine
values, `read`, `db:create`, `db:delete`, `db:configure`, `db:mint-token`,
`db:rotate-creds`, `group:configure`, `group:mint-token`, `group:rotate-creds`, plus the
presets `read-only`, which "expands to `read`", and `full-access`, "Every individual scope
listed above". Not one of the nine mentions members, and `read` is defined as covering
"list/retrieve databases and groups, configuration, usage, instances, locations", which
does not include the member routes.

**source, member management is an organization-scoped operation.** `cli/auth/api-tokens/mint`,
on org-scoped tokens: "An org-scoped token can only manage resources (groups, databases,
members) within that organization." Members are named there and nowhere in the group-scoped
section.

**source, the MCP tool set has no member tool.** Turso's own plugin skill,
`tursodatabase/turso-mcp` at `claude-code/skills/turso/SKILL.md`, enumerates twelve
tools: `list_databases`, `get_database`, `set_database_config`, `create_database`,
`create_branch`, `list_branches`, `delete_database`, `database_analytics`,
`read_database`, `write_database`, `delete_from_database`, `evolve_schema`. There is no
member tool, no group tool and no token tool. `integrations/mcp` describes the same set as
databases, SQL and insight.

**source, the member routes themselves.** `DELETE /v1/organizations/{organizationSlug}/members/{username}`
exists, is described as "Remove a user from the organization by username", and documents
exactly two responses, 200 and 404, whose example body is `user [username] is not a member
of org [organizationSlug]`. **It states no role requirement, and `openapi.json` carries none
either.** `PATCH .../members/{username}` does state one, and it is "Only organization
admins or owners can perform this action", with a documented 403.

**conclusion, sub-fact 4 is answered for the token and open for the role.** A group-scoped
token cannot reach any member route: no scope covers it, the MCP surface has no tool for
it, and Turso places member management under organization-scoped credentials. Changing a
member's role needs admin or owner. **What role removing a member needs is not documented**,
which is a gap in the source rather than a finding that any role may do it.

## Whether a database auth token can be attributed or revoked per member

**source, the mint takes no identity.** `POST /v1/organizations/{organizationSlug}/databases/{databaseName}/auth/tokens`
takes two query parameters, `expiration`, default `never`, and `authorization`,
`full-access` or `read-only`, default `full-access`, and an optional body whose only
property is `permissions.read_attach.databases`. It returns `{"jwt": "..."}`. There is no
name, no subject, no owner and no identifier in the request or the response.

**source, revocation is stated as impossible per token.** `api-reference/groups/create-token`:
"Tokens cannot be retrieved once created, and cannot be revoked individually." The database
route offers no revocation of its own; the only instrument is
`POST .../databases/{databaseName}/auth/rotate`, "Invalidates all authorization tokens for
the specified database", carrying the warning "A short downtime is required to complete the
changes."

**source, the CLI says the blast radius is the group, not the database.** `cli/db/tokens/invalidate`:
"All tokens in the group that provided database belongs will also be invalidated. This
means that all existing tokens will no longer be valid and will need to be regenerated."
`sdk/authorization/tokens` says the same about the group form: "Invalidate all tokens for a
group (and all its databases)".

**source, the two scopes are deliberately separate.** "`db:mint-token` and
`db:rotate-creds` are deliberately separate scopes. Minting a new SQL credential is
additive; rotating invalidates every credential currently in use, which can take down
running applications."

**conclusion, sub-fact 5 is answered and nothing finer has appeared.** A database auth
token carries no attribution and cannot be revoked individually. Rotation remains the only
revocation, it is total for the database, and the CLI documents it as total for the group
the database sits in. This repository's measurement of 2026-09-12 in `[[references/turso]]`
stands.

## Three things that changed in the source since the 819 evidence was written

**source, per-token attribution and revocation now exist for platform tokens, which is the
kind a consent mints.** `GET /v1/organizations/{organizationSlug}/api-tokens` "Returns the
API tokens scoped to this organization (both organization-scoped and group-scoped)", each
row carrying `name`, `id`, `organization`, `group`, `scopes`, `created_at` and an `owner`
object of `username` and `email`, "The user who minted the token. Returned to admins and
owners so they can see who provisioned each token."
`DELETE /v1/organizations/{organizationSlug}/api-tokens/{tokenId}` revokes one by id, and
takes an id rather than a name "because token names are not unique across users in an
organization". Neither endpoint appears in the 819 evidence.

*interpretation, not source: a consent-issued token is group-scoped, and this endpoint is
documented as returning group-scoped tokens, so an owner or admin would see and be able to
revoke each member's consent individually. The documentation never says a consent-minted
token appears in this listing, and nothing here was run. Untested.*

**source, unrestricted tokens are deprecated.** "**Unrestricted (cross-org) tokens are
deprecated and will be removed in a future release.** Always pass `organization` for new
tokens and rotate existing unrestricted tokens to scoped tokens." This bears on the
`TURSO_API_TOKEN` and `TURSO_CONSENT_TOKEN` environment values `[[references/turso]]`
names for live tests.

**observation, one path correction to the 819 record.** That evidence cites the scope
vocabulary as the body of `POST /v1/auth/api-tokens`. The route is
`POST /v1/auth/api-tokens/{tokenName}`, the name being a required path parameter. The scope
list itself is unchanged, all nine plus the two presets.

**observation, the CLI's fine-grained flag is documented inconsistently.**
`sdk/authorization` and `sdk/authorization/tokens` both document `-p`, `--permissions`
for `turso db tokens create` with examples such as `-p all:data_read`, while the command's
own page, `cli/db/tokens/create`, lists only `--expiration` and `--read-only`. The 819
conclusion that the REST mint offers nothing finer than whole-database is unaffected; which
of the two CLI pages is current is not established here.

# Conclusion

**What the consent-issued token carries is documented; what the person's role adds or
subtracts is not.**

A group-scoped token is pinned to one group by its UUID, carries some subset of nine named
scopes, and under `full-access` can create, delete, configure and mint tokens for every
database in that group and rotate the group's signing key. It cannot create, delete or
transfer a group at any scope, and it cannot reach a single member route: no scope names
members, Turso places member management under organization-scoped credentials, and the MCP
tool set has no member tool. Enumerating the group's databases is
`GET /v1/organizations/{slug}/databases?group={group}` under `read`, which needs the
organization slug that the token's claims do not carry.

**On roles, the documentation answers only member administration and token
administration.** Owner or admin is required to add a member, invite a member, change a
member's role, transfer a group, and mint a group-scoped token. Admins and owners see and
revoke every platform token in the organization; members and viewers see and revoke only
their own. Everything else that was asked, who may create or delete a database or group,
who may mint a database token, who may rotate credentials, who may remove a member, and who
may change billing, **is documented against no role anywhere in the 278 pages of
docs.turso.tech or in openapi.json.** `viewer` is never defined at all.

**The sharpest single sentence for this effort is that minting a group-scoped token
requires admin or owner**, because the consent screen mints exactly that. Read literally it
says a `member` or a `viewer` cannot obtain the credential the desktop asks for. Read
narrowly it is a precondition on one REST route and one CLI command that the dashboard's
consent path may or may not share. The documentation does not distinguish the two readings,
and one consent completed by a non-owner on a team organization would.

**Role is enforced separately from scope on every call.** Turso states that each request is
checked for org-binding, role and scope. So the nine scopes this repository read off an
owner's token are an upper bound set by the token, not a description of what a different
role's holder could do with an identically scoped one.

# Not checked

- **No request was sent to Turso.** Everything above is documentation. Nothing was minted,
  created, deleted or consented to, and no account was touched.
- **Whether the consent screen offers an organization the person does not own**, and what
  it offers a `member` or a `viewer` who picks one. This is the question the effort turns
  on and it needs a team organization with a second Turso user in it, plus that person at a
  browser. It cannot be inferred and it cannot be probed unauthenticated.
- **Whether a consent-minted token appears in `GET /v1/organizations/{slug}/api-tokens`**,
  and therefore whether an owner can revoke one member's consent without rotating anything.
  Documented as covering group-scoped tokens; never documented as covering consent-minted
  ones.
- **Whether `DELETE .../members/{username}` refuses a `member` or a `viewer`.** No role is
  documented on the route and no 403 is listed. Only a live call settles it.
- **What a `viewer` can do.** The word is defined nowhere. Whether it can read databases,
  whether it can mint a database auth token, and whether it appears on the consent screen
  at all are three separate unknowns.
- **Whether creating a team organization requires a paid plan.** `cli/org/create` says "You
  will be asked to add a payment method and subscribe to the Scaler plan to successfully
  create a new organization", which is the CLI's flow rather than a statement of the rule,
  and `turso.tech/pricing` was not re-read. The 819 open question is narrowed, not closed.
- **The dashboard's own role interface.** Turso's dashboard is behind a login and was not
  opened. If a role matrix exists anywhere it is likelier to be there than in the docs.
- **Turso's audit log contents.** `integrations/mcp` says every tool call is "recorded in
  your audit log" and an audit log route exists at
  `GET /v1/organizations/{slug}/audit-logs`, but what it records about a consent, and
  whether it names the consenting member, was not read.
- **The `turso` CLI's source.** The role checks are server side and the CLI is a wrapper,
  so its source was judged unlikely to carry them and was not read. If a role matrix is
  recoverable from open source anywhere, that is where to look next.
