---
use-when: "deciding whether the Turso consent alone can rebuild an owner's machine, or what retiring the organization's own link would cost"
---

# Question

An owner holds nothing but their Turso account. On a fresh first run, what can the walk learn
from the consent alone to find the organization already in the consented group, mint a credential
for it, pull its replica and land the owner at the sign-in wall, and what exactly stands in the
way?

# Sources

Read on 2026-09-15, in the worktree of effort 828 at `15fd4699` (tickets 01 to 06 of 828 landed;
the sealed link and the second-machine link are in the tree).

- `apps/desktop/tauri/src/organization/{setup,connect,command,join,session,store,link,invite,machine,removal,workspace,vault,authority}.rs`: the first run, the connect, the wall, the rows, and the acts that mint and rotate.
- `apps/desktop/tauri/src/sync/turso/{discovery,platform}.rs`: what the consent's token is spent on.
- `apps/desktop/src/lib/organization/{setup.ts,connect.ts}`, `component/{organization-link,setup-walk,reconnect-authority}.svelte`, `apps/desktop/src/lib/platform/host.ts`: the walk, the connect screen, the sync section's link block.
- `.aep/efforts/819-an-organization-hosts-its-own-workspaces/evidence/prototypes/one-real-consent.md`: one real consent, its token's claims, and what it was refused. A record of live runs against Turso, dated inside it. Primary for this repository, secondary for Turso.
- `.aep/efforts/826-the-organization-and-the-way-in-are-rethought/spec.md` (requirement 13 and its four corrections, requirement 21, criterion 21) and `tickets/{13,21,22}.md`.
- `.aep/references/turso.md`, `.aep/contexts/desktop/organization.md`, and the research file beside this one, `what-a-link-exposes-and-what-a-code-can-bound.md`.
- Turso's own documentation, fetched 2026-09-15:
  <https://docs.turso.tech/api-reference/databases/list.md>,
  <https://docs.turso.tech/api-reference/groups/list.md>,
  <https://docs.turso.tech/api-reference/databases/create-token.md>,
  <https://docs.turso.tech/api-reference/user/get-current.md>,
  <https://docs.turso.tech/llms.txt> (the documentation index).

# Findings

## 1. What a consent yields, and what it is refused

**The token is group-scoped, carries nine scopes, names its group only by uuid, and never
expires.** *source:* one real consent's claims were `group_uuid`, `jti`, `org_id` (a number) and
`scopes`, and the list is exhaustive: no `aud`, no `iss`, no `exp`, no `iat`, no `nbf`; the nine
scopes are `db:configure`, `db:create`, `db:delete`, `db:mint-token`, `db:rotate-creds`,
`group:configure`, `group:mint-token`, `group:rotate-creds` and `read`
(`819/evidence/prototypes/one-real-consent.md`, the claims block and the conclusion under it).
*source:* `/v1/auth/validate` answered 200 with `{"exp":-1}` (same file). *conclusion:* the
consent carries `db:mint-token` over every database in its group, so minting a credential for an
organization database already in that group needs no other authority.

**What the token cannot read is the account it sits on.** *source:*
`GET https://api.turso.tech/v1/organizations` answered
`403 {"error":"group-scoped token cannot access org-level resources"}`, and the `org_id` claim is
a number that three Platform API paths answered *organization 26543 not found* for
(`819/evidence/prototypes/one-real-consent.md`). *source:* the repository treats 403 and 404 on
both group calls as "absent" rather than as failures (`sync/turso/platform.rs:78`, the `ABSENT`
constant and its docstring). *source:* the human's fourth run of the 826 build had both probes
answer nothing, recorded as *a group-scoped token is refused every organization-level read, the
user endpoint included* (`826/spec.md`, requirement 13's fourth correction; `826/tickets/22`,
under *Constraints*). *conclusion:* **the organization slug is not learnable from the token.**

**The slug is learnable from a listing, and the recovery case is exactly the case where a listing
is non-empty.** *source:* MCP `list_databases` returns each database's `Name` and `hostname`, and
a hostname is `<name>-<slug>.<region>.turso.io`, so the slug is what is left of the first label
once the record's own name is removed from the front (`sync/turso/discovery.rs`, the module
docstring and `slug_from_hostname` at lines 172 to 182). *source:* a live listing carries `Name`,
`hostname`, `group`, `group_id`, `organization_id` and more
(`819/evidence/prototypes/one-real-consent.md`, the `list_databases` observation). *observation:*
the empty group is the one case the slug cannot be read, which is why the walk asks for the group
name there (`826/tickets/22`). *interpretation:* an owner recovering has an `org-<id>` database in
the group, so the listing names it, and the slug, the group and the hostname all fall out of the
same record.

**A group-scoped platform token listing the databases of its group over HTTP is not established
here.** *source:* Turso documents `GET /v1/organizations/{organizationSlug}/databases` with an
optional `group` query parameter, *Filter databases by group name*, and each record carrying
`Name`, `DbId`, `Hostname`, `group`, `primaryRegion`, `delete_protection`
(<https://docs.turso.tech/api-reference/databases/list.md>, the OpenAPI block). *observation:*
**there is no `GET /v1/organizations/{org}/groups/{groupName}/databases` in Turso's
documentation.** The groups section of the index lists retrieve, configuration, update, delete,
transfer, unarchive, create-token and invalidate-tokens, and no databases sub-resource
(<https://docs.turso.tech/llms.txt>, and
<https://docs.turso.tech/api-reference/groups/list.md>). *observation:* nothing in this repository
calls the databases listing over HTTP. The listing it reads is MCP's
(`sync/turso/discovery.rs:675`, `list_databases`), and `platform.rs` calls only the per-database
create, mint, delete and configuration paths plus the two group probes.
*conclusion:* the documented filter exists, it needs the slug in the path, and **whether a
group-scoped token is accepted on it has never been run.** Per-database paths under the same slug
are accepted, live on 2026-09-11 (`references/turso`, the database-level `PATCH` paragraph), which
makes acceptance plausible and not established.

**Nothing in the docs contradicts the repository's own record, and nothing in the docs states the
scope rules either.** *observation:* `GET /v1/user` is documented and returns `user.username`
(<https://docs.turso.tech/api-reference/user/get-current.md>); the documentation says nothing
about which token scopes may call it, so the 403 or 404 the repository observed is a fact about the
server rather than about the documentation.

## 2. How the walk decides today, and what `org-` lets it recognise

**It does not decide. There is one first-run path and it creates.** *source:*
`setup::create_organization` is the whole of the first run: it discovers or creates, then creates
the database `org-<organization id>` and everything after it
(`organization/setup.rs:186` onward; the name is built at line 242 from
`ORGANIZATION_DATABASE_PREFIX`, line 83). *observation:* there is no branch anywhere that reaches
an organization already in the group.

**A consent meeting a group that already holds an `org-*` database is refused before anything is
created, and the consent is thrown away.** *source:* `one_organization_to_a_group`
(`organization/setup.rs:690`) finds any listed name whose `org-` prefix strips to something
non-empty and refuses with

> this group already holds the organization database `<held>`; a group holds one organization, so
> pick another group or another Turso account

*source:* the refusal runs before the create, and it calls `abandon_the_consent`
(`setup.rs:271`), which forgets the platform token from the credential store and clears
`store.turso_organization` (`setup.rs:719` to `736`). *source:* the walk detects it by refetching
the state and finding the authority gone, not by the prose, and returns to the connect step
carrying the sentence (`826/tickets/13`, *Notes*; `src/lib/organization/setup.ts`,
`refusalAfterFailedCreate`). *conclusion:* **today the recovery case is the refusal case, and the
refusal also destroys the credential a recovery would have used.**

**What `org-<id>` buys is recognition and the id.** *interpretation:* the prefix is the whole mark
of one of ours (`setup.rs:77` to `83`), the suffix is the organization id
(`setup.rs:242`), and the hostname on the same record gives the remote. So the listing that
today triggers the refusal carries, in one row, the three things a recovery needs to reach the
database. *observation:* the prefix also matches `org-chart`, raised and not taken in
`826/tickets/13`, which errs toward refusing.

**The listing is read once per machine and then never again.** *source:*
`discovery::organization` answers out of `store.turso_organization` when one is recorded, with
`databases: None`, and only asks Turso when nothing is recorded (`sync/turso/discovery.rs:723`).
*interpretation:* on a fresh machine nothing is recorded, so the recovery case always has the
listing in hand.

**Two places start a consent, and only one of them is reachable with no organization held.**
*source:* `routes/organization/new/+page.svelte` (the first-run walk) and
`lib/organization/component/reconnect-authority.svelte` (the settings area, which needs a
signed-in owner) are the only callers of `useConsentResult`. *source:*
`organization_reconnect_authority` (`organization/command.rs:1427`) is not gated on a session and
would record the slug on a machine holding no organization, but it connects nothing, mints
nothing and opens no replica; it refuses only the empty-group case. *conclusion:* the entry point
a recovery would need does not exist; what exists is a walk whose only outcome is a create.

## 3. What a rebuild needs against what the consent gives

Taking `connect::connect` as the definition of a rebuilt machine (`organization/connect.rs:48` to
`105`): it writes `HeldOrganization { id, name, verifying_key, remote_url, member_id: None,
role: None, joined_at }` (`organization/mod.rs:56` to `72`), after reading the organization row
once and refusing where the row's id or verifying key disagrees with the link's.

| what a rebuild needs | where it would come from | present? |
| --- | --- | --- |
| remote URL | the listing's `hostname`, as `libsql://{hostname}` (`setup.rs:532`) | yes |
| organization id | the database name minus `org-` (`setup.rs:242`) | yes |
| a credential | `POST /v1/organizations/{slug}/databases/{db}/auth/tokens`, under `db:mint-token` | yes |
| verifying key | the `verifying_key` column of the organization row | readable, but see below |
| organization name | the `name_sealed` column | **no** |
| this machine's record | `connect::connect`, which takes a `JoinLink` | needs a link-shaped input |

**The credential a recovery would mint, and what the owner's own grant is.** *source:* the mint
takes Turso's own duration spelling and `full-access` or `read-only` and nothing finer
(<https://docs.turso.tech/api-reference/databases/create-token.md>;
`references/turso`, the *Commands* block). *source:* the owner's own grant on the organization
database is minted at `ORGANIZATION_CREDENTIAL_LIFETIME`, `"4w"`, full access
(`setup.rs:71`, `518` to `524`), and the never-expiring read-only one is the link's alone
(`LINK_CREDENTIAL_LIFETIME`, `"never"`, `setup.rs:75`, `525` to `530`). *source:* renewal mints at
`WORKSPACE_CREDENTIAL_LIFETIME`, also `"4w"` (`organization/workspace.rs:44`, `587`).
*conclusion:* a recovery would mint its own credential and is not limited to either of those; what
it minted would be a full-access four-week grant like every other, or shorter.

**The verifying key is in a row and is readable with any credential, and the repository says it is
not a trust anchor.** *source:* the column exists and is documented as *stored here for a second
machine to compare against and never to verify with. A reader verifies against the key its join
link pinned* (`organization/store.rs:144` to `147`; the schema at line 69). *source:* a reader
verifies against a key it was handed rather than one it read, because a database whose rows were
rewritten could rewrite the key that checks them
(`organization/authority.rs`, lines 17 to 26; `organization/connect.rs`, the module docstring).
*interpretation:* a consent-only rebuild that pinned the row's key would be comparing the database
against itself, which is the one thing the design refuses.

**The owner's password re-derives that key, which is an anchor the database does not hold.**
*source:* the organization key is `derive_seed(ORGANIZATION_KEY_PURPOSE)` over the owner's vault
secret and is stored nowhere (`setup.rs:539` to `543`, and the module docstring's *Where the keys
live*; `organization/vault.rs:296`, `derive_seed`). *conclusion:* the owner's password is a
verifying key that travels with the person rather than with the machine. *interpretation:* using it
inverts today's order, because the wall needs the key before it can read members
(finding 4), which is a fork rather than a finding.

**The organization's name is the one field the consent cannot supply.** *source:* `name_sealed` is
sealed under the content key (`setup.rs:566`; `store.rs:142`, `143`), and the content key is
sealed to each member's public key and opened by their password (`setup.rs:594`;
`contexts/desktop/organization`, *Vault*). *source:* both `HeldOrganization.name`
(`mod.rs:60`) and `JoinLink.organization_name` (`organization/link.rs`, the struct) are clear
strings, and `invite::organization_link` opens `name_sealed` from a session to build a link
(`organization/invite.rs:1257` to `1284`). *conclusion:* a machine recovered from the consent
alone knows where the organization is and what its id is, and **cannot say its name until somebody
signs in.** Every refusal the wall writes names the organization
(`session::refused_by_name`, `session.rs:334`), so the name is not cosmetic on that screen.

**What is missing, stated plainly.** The clear name; a trust anchor that is not the database being
judged; and an entry point, since `connect::connect` takes a `JoinLink` and
`connect::refuse_sealed` refuses anything without a clear credential in it
(`connect.rs:110` to `119`).

## 4. What the wall then needs, and what a recovered owner can do

**The wall reads the local replica and needs no credential to do it.** *source:* `open_replica`
opens the replica with an **empty** credential slot, filled only once a vault is open
(`organization/command.rs:524` to `550`). *source:* `sign_in_by_username` needs
`verifying_key_of(held)` (`session.rs:973`), reads members verified against it
(`store::members`, `store.rs:683`), tries the password against each non-removed vault, compares
the sealed username, refuses a row still marked `must_change_password`, then opens the session and
files the member key in the keyring (`session.rs:340` to `405`). *conclusion:* the wall works on
whatever the recovery pull left on disk, which is the same thing a link connect leaves.

**The session's credential is the grant's, not the recovery's.** *source:* `open_session`
overwrites the credential slot with the token unsealed from the member's grant on the organization
database (`session.rs:800` to `816`). *interpretation:* whatever a recovery minted is replaced at
sign-in by a grant that may have lapsed while every machine was gone, so the owner would be signed
in holding a dead credential until a renewal ran.

**A recovered owner does get the authority back and can renew and mint.** *source:*
`owner_platform` builds the Platform API client from `setup::authority()` (the keyring token) and
`store.turso_organization` (`command.rs:570` to `581`), both of which the consent supplies.
*source:* `organization_renew_due` fires when any grant is inside the seven-day window
(`command.rs:865`; `workspace::credentials_due`, `workspace.rs:506`, which an already-lapsed grant
also satisfies), and `renew_credentials` mints fresh credentials for every workspace **and the
organization database**, re-seals each to every member who still holds a grant, and moves the
owner's own into the session's slot (`workspace.rs:525` to `630`, and lines 607 to 621 for the
slot). *conclusion:* once at the wall and through it, a recovered owner is the owner again:
they renew members' grants, and the acts that need the authority are theirs.

**The machine's record does not differ, because there is one writer.** *source:* a link connect and
a second-machine connect both end in `connect::connect` (`organization/machine.rs:250`), which is
the only place `HeldOrganization` is written outside the first run. *source:* `joined_at`'s own
comment names three ways a machine can have got there and stores none of them (`mod.rs:69` to
`71`). *conclusion:* nothing on the machine records how it arrived, so a recovered machine is
indistinguishable from a linked one, and the session it opens is an ordinary session.

## 5. Lock-out and recovery do not fight, because the organization database is never rotated

**`lock out` rotates workspace databases and deliberately not the organization's.** *source:* the
module says so: *The organization database is not rotated: its rows are sealed and signed, the
member's credential on it expires with the ordinary lifetime, and it is what a remaining member
reads the re-sealed grant from, so rotating it would take away the very thing recovery needs*
(`organization/removal.rs:14` to `18`). *source:* the only `rotate_credentials` call is over the
affected workspaces (`removal.rs:219`), and a test asserts exactly two `ws-` databases rotated and
the organization database not (`removal.rs:762` to `767`). *observation:* `rotate_credentials` is
called nowhere else in the tree.

*conclusion, and it contradicts two artifacts:* `contexts/desktop/organization` says a leak of the
organization link *exposes the directory until a lock-out rotates the database*, and 828's spec
carries the same sentence under Risks. **No act in this repository rotates the organization
database**, so today nothing retires that credential at all. The repository wins.

*conclusion, on the question as asked:* a recovering consent meets an organization whose
organization database has never been rotated, so a freshly minted credential is simply a fresh
credential and there is no rotated-versus-unrotated distinction to get wrong. Where a workspace
database was rotated by a lock-out, the recovered owner's workspace credentials come from the
re-sealed grant rows on the replica, which is `session::refresh_credentials`'s ordinary path
(`session.rs:833` to `841`).

## 6. What retiring the organization's own link would remove

**The clear credential itself.** `LINK_CREDENTIAL_LIFETIME` and the second mint in `finish`
(`setup.rs:75`, `525` to `530`); the `link_credential_sealed` column and its writer and reader
(`store.rs:71`, `152`, `408`, `415`, `429`, `444`); `Credential::Clear` and `JoinLink::new`
(`link.rs`, the enum and the constructor); `connect::refuse_sealed` and `CODE_NEEDED`
(`connect.rs:33`, `110`), which exist only to separate the clear link from every other.

**Every reader of `link_credential_sealed` outside the schema is one of two functions.** *source:*
a grep over `apps/desktop/tauri/src` finds it in `setup.rs` (the write), `store.rs` (the column,
the insert, the select), `session.rs:1337`, `store.rs:1697` and `store.rs:2300` (test fixtures),
and `invite.rs:1274` and `1315`, which are `organization_link` and `own_link`.

**And `organization_link` unseals it only to throw it away.** *source:* `invite::issue` and
`invite::copy` build the locator through `organization_link` and then replace its credential with
the sealed payload (`invite.rs:566` to `569`), and so does `machine::make`, whose own comment says
*Its clear credential is replaced by the seal below and never leaves this function*
(`machine.rs:115` to `117`, `152`). *conclusion:* **the never-expiring read-only credential is used
nowhere but the organization's own link.** Every other caller of `organization_link` decodes it and
discards it, so retiring the link makes `organization_link` a locator of four clear fields and
removes a content-key unseal from every invite, reset and second-machine link.

**What else goes.** The command and its route: `organization_own_link` (`command.rs:849`),
registered in `lib.rs:252`, `tauri.ts:242`, `host.ts:612`, `useOrganizationLink` in
`lib/organization/query.ts`. The sync section's block: `component/organization-link.svelte`, drawn
from `lib/settings/component/area.svelte:22`, with `organization.dashboard.linkDescription`,
`organization.setup.copyLink` and `organization.setup.linkCopied` in both locales
(`lib/i18n/en/index.ts:787`, `788`, `853`, `862`). The connect screen's branch: `LinkKind`'s
`Organization` variant and `linkKind`'s `organization` case, which is the one kind that lands on
the wall with no code (`lib/organization/connect.ts:144`, `158`), and `organization_connect`
itself (`command.rs:240`), whose whole subject is the clear-credential link. Its front-end tests:
`lib/organization/tests/organization-link.svelte.test.ts` and
`lib/settings/tests/area.svelte.test.ts:377`.

**The Rust tests that use it.** `connect.rs:313`
(`the_organizations_own_link_connects_with_no_code_and_a_sealed_one_is_refused`), `invite.rs:2724`
and `2791` (the owner reads it again, and a member is refused). Beyond those, `organization_link`
is the fixture every module builds a link from and would survive the change:
`invite.rs:1530`, `join.rs:512` and `1814`, `machine.rs:391`, `migration.rs:665`,
`password.rs:318` and `609`, `removal.rs:535` and `1128`, `role.rs:368`.

## 7. What else stands in the way

- **The refusal destroys the consent.** `abandon_the_consent` forgets the platform token and the
  slug (`setup.rs:719`). A recovery reached through the same listing would have to not do that, and
  the walk's own signal for requirement 21's refusal is precisely *the authority is gone*
  (`826/tickets/13`, *Notes*; `lib/organization/setup.ts`, `refusalAfterFailedCreate`), so the two
  cannot both keep their present signal.
- **One organization to a group survives recovery only if recovery is told apart from creation.**
  Requirement 21 is a rule about creating a second organization (`826/spec.md`, requirement 21);
  recovering the one that is there is not that, and nothing in the code can currently tell the two
  apart because both arrive as the same consent on the same listing.
- **The wall's chicken and egg.** The verifying key is needed to read members
  (`store.rs:683`), and the owner's password is what re-derives the verifying key
  (`setup.rs:539`). Today the key comes from the link, which is what a recovery does not have.
- **The prefix is loose.** `org-chart` in the owner's own group is read as an organization database
  (`setup.rs:690`; raised in `826/tickets/13`), so a recovery driven off the same match would try
  to open somebody's spreadsheet.
- **A lapsed owner grant.** The owner's grant is four weeks (`setup.rs:71`), nothing renews while
  every machine is gone, and `open_session` fills the credential slot from the grant
  (`session.rs:800`). A recovery more than four weeks after the last launch signs the owner in
  holding a dead credential; `organization_renew_due` would then mint fresh ones
  (`command.rs:865`, `workspace.rs:530`), but only after the sign-in has already replaced what the
  recovery minted.
- **Delete protection and the group's own state.** A recovery mints and reads and creates nothing,
  so `references/turso`'s *Never run* is not engaged; the standing warning that a protected group
  has already failed to hold once (`references/turso`, *Verification*) is about deletes and does
  not bear on this.

**Forks a design would have to decide, stated and not decided:**

1. **Where the trust anchor comes from** on a machine with no link: the row's `verifying_key`, which
   `authority.rs` and `store.rs:144` refuse as a verifier; or the key re-derived from the owner's
   password, which means reading member rows before they can be verified and ordering the wall
   before the connect.
2. **What the machine is called before a sign-in**: leave `HeldOrganization.name` empty or hold a
   placeholder until the vault opens and then write the opened name; or ask the owner to type the
   name and refuse where it does not match once it can be checked.
3. **How recovery is told from creation at the consent**: a listing that names an `org-*` database
   offers recovery instead of refusing; or the walk asks first and the refusal stays for the answer
   that says create.
4. **Whether the consent's minted credential survives the sign-in**, or `open_session` keeps
   replacing it with the grant's.
5. **Whether a recovery is the owner's alone.** Anybody holding the consent can mint and pull; the
   wall is what refuses them, and that is the same bound the organization link has today.
6. **Whether requirement 21's refusal keeps its present signal to the walk** (the authority gone),
   given a recovery must keep the consent.

# Conclusion

A consent over the group that holds an organization yields, from one MCP listing, the database
name, the hostname and the group; the name gives the organization id, the hostname gives the
remote URL and the organization slug, and the slug plus `db:mint-token` gives a credential of any
lifetime and either access level. Everything needed to pull the replica is therefore reachable from
the consent alone. What the consent cannot give is the organization's name, which is sealed under
the content key, and a verifying key that is not read out of the database it judges; and what the
code cannot give is an entry point, because the only first run creates, `connect::connect` takes a
`JoinLink`, and a consent landing on a group that already holds an `org-*` database is refused and
the consent thrown away. The organization database is never rotated by any act in this repository,
so recovery and lock-out do not collide, and two artifacts that say a lock-out rotates it are wrong
about this database. Retiring the organization's own link removes one mint, one column, two
functions' use of it, one command with its route and its block in the sync section, one branch of
the connect screen and three Rust tests, and nothing else uses the never-expiring credential.

# Not checked

- **Whether a group-scoped platform token is accepted on
  `GET /v1/organizations/{slug}/databases` with the `group` filter.** The documented endpoint takes
  the filter and the repository has never called it; only per-database paths under a slug are
  live-verified.
- **Whether `GET /v1/user` answers 403 or 404 for a group-scoped token.** The repository treats
  both alike (`platform.rs:78`) and the run that met it recorded only that it answered nothing.
- **Whether the MCP tool set now offers a groups tool.** It did not on 2026-09-11 and
  `group_from_mcp` probes for one at run time (`discovery.rs`); no run since is recorded here.
- **Whether the `organization_id` UUID in a listing record works in the slug position.** Open since
  819 and untried.
- **What a recovery does about workspace databases.** Only the organization database was followed;
  whether a recovered owner's workspace replicas rebuild themselves was not read.
- **Whether `store.pull()` on a replica opened with a freshly minted credential behaves as it does
  on a link connect.** `reached` was read (`command.rs:1462`); nothing was run.
- **The Arabic strings behind the sync section's link block**, counted only in English.
