---
use-when: "deciding who pays for a Turso organization, or assuming a free-plan customer can put other people in one"
---

# Question

Can a person on Turso's free plan create a team organization and add other Turso
users to it at no charge, and if not, what does an organization with members cost
and which plan does each side, the organization's owner and each member, need?

# Sources

All read 2026-09-13. Primary unless marked.

| Source | What it is |
| --- | --- |
| `https://turso.tech/pricing` | the pricing page. Read as rendered text and as its own `schema.org` `AggregateOffer` markup, which encodes the feature matrix as `Yes`/`No` per plan |
| `https://docs.turso.tech/api-reference/openapi.json` | the Platform API specification. Downloaded and read directly, 115 KB, `openapi 3.0.1`, `info.version 0.1.0` |
| `https://docs.turso.tech/llms.txt` | the documentation index. Read whole, to enumerate every organization, member, invite, plan and billing page |
| `https://docs.turso.tech/cli/org/create.md` | `turso org create` |
| `https://docs.turso.tech/cli/org/members/{invite,add,list,rm}.md` | the member commands |
| `https://docs.turso.tech/cli/org/{list,switch,billing,destroy}.md` | the rest of `turso org` |
| `https://docs.turso.tech/cli/plan/{show,select,upgrade}.md` | the plan commands |
| `https://docs.turso.tech/cli/group/create.md` | `turso group create`, which carries the group-count plan limit |
| `https://docs.turso.tech/api-reference/organizations/members/add.md` | rendered page, which carries notes the raw spec does not |
| `https://docs.turso.tech/api-reference/organizations/invites/{create-v2,delete-v2,list-v2}.md` | same |
| `https://docs.turso.tech/api-reference/introduction.md` | the Platform API overview and its named use cases |
| `https://docs.turso.tech/help/usage-and-billing.md` | usage and billing. `https://docs.turso.tech/billing-details` serves the same page |
| `https://turso.tech/terms-of-use` | Terms of Use. The page itself says "Last updated March 2024" |
| `https://turso.tech/blog/organization-api-platform-saga-part-3` | **secondary**, dated 2024-03-01 |
| `https://turso.tech/blog/unlimited-databases-are-here` | **secondary**, dated 2025-06-17, read only to date the current price points |

# Findings

## Personal versus team

**source, Turso calls them `personal` and `team`, and every user has one of the
first.** `Organization` in `openapi.json`: `type` is "The type of account this
organization is. Will always be `personal` or `team`", enum exactly
`["personal", "team"]`. `name` is "The organization name. Every user has a
`personal` organization for their own account", and `slug` "will be your username
for `personal` accounts".

**source, creating a team organization is gated on a paid plan, and the CLI page
names which one.** `turso org create <name>`, verbatim: "You will be asked to add
a payment method and subscribe to the Scaler plan to successfully create a new
organization."

**observation, the Platform API cannot create an organization at all.** Every path
in `openapi.json` was enumerated. There are thirty-one organization paths and none
of them is a `POST /v1/organizations`. The API can list, retrieve and update an
organization. Creation is the CLI or the dashboard only.

**conclusion, sub-fact 1.** A free-plan user cannot create a team organization.
The documented route asks for a card and a Scaler subscription, and there is no
API route at all.

## What the plans say about teams

**source, the pricing page marks Teams as a per-plan feature, and it is off below
Scaler.** From the page's own structured data, read 2026-09-13:

| Plan | Monthly price | Teams |
| --- | --- | --- |
| Free | $0 | No |
| Developer | $5.99 | No |
| Scaler | $29 | Yes |
| Pro | $499 | Yes |
| Enterprise | custom | Yes |

The rendered page defaults to the yearly toggle and shows the same plans at $4.99,
$24.92 and $416.58 per month, labelled "Save $1/month", "Save $4.08/month" and
"Save $82.42/month". So Scaler is $29 a month billed monthly, or $24.92 a month
billed yearly. The secondary blog post of 2025-06-17 already carried $4.99, $24.92
and $416.58, so these price points are at least fifteen months old.

**source, the docs agree, twice, in the places a caller would hit the wall.**
`POST /v2/organizations/{org}/invites` and its delete page both carry, verbatim:
"Invites are limited to scaler plan and above." Add Member and Create Invite both
carry: "You must be an `owner` or `admin` to add other members. **You can only add
users to a team and not your personal account.**"

**observation, no primary source charges per seat, and I looked in the three
places one would be.** The pricing page has no seat, per-user or per-member line.
Searching its rendered text and its raw HTML for "seat", "per user" and "per
member" returns nothing but the marketing phrase "one per user, agent, or tenant"
in the site's own organization markup. `PlanQuotas` in `openapi.json` has exactly
seven fields, `rowsRead`, `rowsWritten`, `databases`, `locations`, `storage`,
`groups`, `bytesSynced`, and **no member or seat quota**. The usage and billing
page meters only rows read, rows written and total storage.

**conclusion, sub-fact 2.** Members are not charged per seat on any documented
plan, and the free plan does not permit members in an organization because it does
not permit a team organization at all. The cost of an organization with members is
the organization's own Scaler subscription, $29 a month, or $24.92 a month billed
yearly, and adding the second, tenth or hundredth member adds nothing to that
figure as far as any primary source says. **No member limit is documented
anywhere**, which is an absence rather than a statement that the limit is
unbounded.

**observation, the group limit moves with the same line.** `turso group create`:
"Creating more than one group is limited to Scaler, Pro and Enterprise plans." So
Free and Developer are one group each. This matters because the consent token
recorded in
[[efforts/819-an-organization-hosts-its-own-workspaces/evidence/prototypes/one-real-consent]]
is pinned to one group the human selects and cannot create, so on a free or
Developer account the only group there is to select is the one already holding
everything else.

**observation, nothing documents a per-plan location count.** `PlanQuotas` has a
`locations` field with example `3`, so the platform models the limit, but no docs
page and no pricing row states a value for any plan. Recorded as not found.

## Who the invitee has to be

**source, add and invite are two different endpoints with two different
preconditions.**

`POST /v1/organizations/{org}/members`, described as "Add an existing Turso user
to an organization", body `username` ("The username of an existing Turso user")
and `role` defaulting to `member`. It answers `404` with
`"could not find user [username]"` and `409` with
`"user [username] is already a member of organization [organizationSlug]"`. The
CLI mirror is `turso org members add <username> [--admin]`.

`POST /v2/organizations/{org}/invites`, verbatim: "Invite a user to an
organization. If the user isn't already registered with Turso, they will receive a
signup link. If an existing pending invite exists for the same email, it will be
replaced." Body is exactly one of `email` or `username`, plus `role`. The rendered
page adds: "When inviting by username, the invite is sent to that user's
registered email." The CLI mirror is `turso org members invite <email> [--admin]`,
documented as "To invite someone who isn't already a Turso user".

**observation, the invite endpoint is `/v2/`, not `/v1/`.** The brief guessed
`POST /v1/organizations/{org}/invites`. The spec carries `/v2/` only, with
`operationId`s `inviteOrganizationMemberV2`, `listOrganizationInvitesV2` and
`deleteOrganizationInviteByEmailV2`. No `/v1/` invite path exists in the version of
the spec read on 2026-09-13.

**source, roles are three on write and four on read.** `role` on add, invite and
`PATCH /v1/organizations/{org}/members/{username}` is `admin | member | viewer`,
default `member`. The `Member` schema returned by reads has a fourth value,
`owner`. So ownership is not assignable through this API.

**observation, the invitee accepts somewhere the API does not expose.**
`GET /v1/user` returns a user object carrying `username`, `name`, `email`,
`avatarUrl`, `plan` ("The user's current plan", example `scaler`), `mfa`, and
`has_pending_invites`, described as "Whether the user has pending organization
invites waiting to be accepted or declined". **The spec contains no accept or
decline endpoint**, and `llms.txt` has no page containing "accept". The invitee's
half of the flow is a link in an email and a screen in the dashboard, and neither
is documented.

**conclusion, sub-fact 3.** The person being added does not have to hold a Turso
account, provided the invite path is used rather than the add path. Turso sends the
email itself, a signup link to a stranger and an invite to their registered address
if they are already a user. What the invitee does next is undocumented beyond the
fact that they accept or decline it, and the invite path is Scaler and above.

**unsourced, and it is the part of the brief I could not answer.** No primary
source states what plan a *member* must be on. The evidence points one way without
saying it: a plan is a property of an organization (`Organization.plan_id`,
`GET /v1/organizations/{org}/subscription`, `GET /v1/organizations/{org}/plans`)
and separately a property of a user (`user.plan` on `GET /v1/user`), and every
documented gate ("limited to scaler plan and above", "only add users to a team") is
phrased against the organization, never against the joiner. **I found nothing that
says a member needs any plan of their own, and nothing that says they do not.**
Reported as an open question rather than rounded up.

## What the free plan is, as of the read date

**source, the free plan on 2026-09-13.** 100 databases, 5 GB storage, 500 million
monthly rows read, 10 million monthly rows written, 3 GB monthly syncs, 1 day
point-in-time restore, Community support. `No` on every one of Audit Logs, DPA, IP
Allow Lists, AWS VPC Allow Lists, Teams, SSO, BYOK Encryption, HIPAA, SOC2 and BYOC
Deployment. The plan names are Free, Developer, Scaler, Pro, Enterprise.

**conclusion, sub-fact 4, nothing moved.** The repository recorded 5 GB, 100
databases and 500 million row reads on 2026-08-30 and all three are unchanged two
weeks later, as is the plan name list. What the earlier record did not carry, and
now does: 10 million rows written, 3 GB syncs, 1 day restore, and the Teams column.
Free is the only plan still capped on database count. Every paid plan reads
"Unlimited".

## Bring your own account

**observation, I looked for it and it is not there.** Turso's documented patterns
all put the account on the developer's side. `api-reference/introduction.md` names
two by heading, "Database per user / per agent (multi-tenant)" and "Platform /
reseller", and both are written around `TURSO_ORG` and `TURSO_PLATFORM_TOKEN` held
by the application operator, provisioning databases *for* end users who never see
Turso. Searching the docs index and the web restricted to `turso.tech` and
`docs.turso.tech` surfaced the per-user-database and BYOC material and nothing
about an application whose users each hold their own Turso account.

**source, the Terms of Use carry one clause that touches it, and it cuts the wrong
way.** Quoted verbatim from `https://turso.tech/terms-of-use`, page dated "Last
updated March 2024": "You will only use the Services for your own internal
business, personal, non-commercial use, and not on behalf of or for the benefit of
any third party, and only in a manner that complies with all laws that apply to
you." The same page also carries "You will not share your Turso User ID, account or
password with anyone".

**interpretation, the clause and the product documentation do not agree.** Read
literally, "not on behalf of or for the benefit of any third party" would forbid
the reseller pattern Turso's own API introduction documents by name. That is a
boilerplate consumer clause sitting next to a platform product, not a considered
position on this question, and I am recording the tension rather than resolving it.
What it does say, for the pattern in question, is that each customer holding and
operating their *own* account is the shape the terms are written for, and the
sharing prohibition is an argument against the alternative, one account whose
credential is handed around.

**conclusion, sub-fact 5, the absence is the finding.** Turso publishes nothing
about an open-source desktop application whose users each bring their own Turso
account. No guide, no terms clause, no FAQ, no blog post. There is no permission to
cite and no prohibition to work around.

# Conclusion

**No.** A person on Turso's free plan cannot create a team organization, and no
plan below Scaler can hold members at all. Creating an organization asks for a card
and a Scaler subscription (`turso org create`), the pricing page marks Teams as
`No` on Free and Developer and `Yes` from Scaler up, and the invite endpoints carry
"Invites are limited to scaler plan and above".

**The cost is one organization-level subscription, not a seat count.** Scaler is
$29 a month billed monthly, or $24.92 a month billed yearly, as of 2026-09-13. No
primary source prices a seat, and the plan quota schema has no member field. What
the members themselves need is **not established**: every documented gate is
phrased against the organization, and no source says whether a member's own account
must carry a plan. That is the one sub-fact this file leaves open.

**A member does not need an account beforehand** if the invite path is used. Turso
emails a signup link to a stranger, or an invite to an existing user's registered
address. Roles are `admin`, `member`, `viewer`. `owner` is readable but not
assignable.

**And Turso says nothing at all about the bring-your-own-account pattern**, in the
docs or the terms. Its only nearby clause, from a page last updated March 2024,
restricts use to "your own internal business, personal, non-commercial use, and not
on behalf of or for the benefit of any third party", which contradicts the reseller
pattern Turso's own API documentation names.

# Not checked

- **Whether the dashboard gates organization creation the same way the CLI does.**
  `app.turso.tech` needs a signed-in account and nothing was driven. The CLI page is
  the only primary statement of the Scaler requirement, and a dashboard that
  behaved differently would contradict it without either page saying so.
- **Whether a free-plan user can be a member of somebody else's Scaler
  organization.** This is the open sub-fact above. Settling it needs two real
  accounts and one real invite, and it cannot be read off any page.
- **Whether a member limit exists per plan.** No documented number was found. The
  quota schema has no field for it, which is evidence that the platform does not
  model one, not proof that no limit is enforced elsewhere.
- **Per-plan location counts.** `PlanQuotas.locations` exists with example `3` and
  no page states a value for any plan.
- **What `GET /v1/organizations/{org}/plans` actually returns.** It would answer the
  quota question authoritatively, per plan, in one call, and it needs a token that
  reaches org-level paths. The consent-minted token recorded in
  [[efforts/819-an-organization-hosts-its-own-workspaces/evidence/prototypes/one-real-consent]]
  is group-scoped and is refused there.
- **The invitee's screens.** What the signup link lands on, whether accepting
  requires anything beyond a GitHub login, and whether a declined invite can be
  resent. Nothing is documented and nothing was run.
- **Whether the Terms of Use are the operative agreement for a paid plan.** The page
  is dated March 2024 and names CHISELSTRIKE INC. Whether a separate subscription or
  cloud services agreement supersedes it at checkout was not looked for.
- **Prorating, and what happens to a team organization when its Scaler subscription
  lapses.** Whether members lose access, whether the organization reverts to
  personal, or whether it is blocked outright. `turso plan select` and the billing
  portal were read as documentation only.
