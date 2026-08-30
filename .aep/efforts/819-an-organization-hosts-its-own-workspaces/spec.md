---
status: draft
---

# Problem

**rentable cannot ship, because shipping it means running a service.**

`apps/control-plane/` is built and deployed nowhere. It holds accounts, workspaces,
membership and sessions, it is in the credential path continuously, and the desktop
refuses to open a workspace without one (`sync/admission.ts`, `+layout.svelte`). So the
application is finished up to the point where somebody other than its author could use it,
and the last step is a hosted process with a database, an uptime obligation, a Turso bill,
and a Google Cloud project — all carried by us, for every customer, forever.

That obligation is the problem, and it has three faces:

- **Cost sits on the wrong side.** Every workspace's storage is billed to our Turso
  account. A customer's ledger grows and our bill grows with it, with no relationship to
  anything the customer pays.
- **We are a dependency we did not agree to be.** A control plane that stops answering
  locks every customer out of their own rents ledger within three days, because the session
  window is what admits them. Nobody signed up to be that.
- **The setup burden lands on whoever installs it.** `apps/desktop/.env.example` asks for a
  control-plane URL, a Google OAuth client id and secret, and — for anyone running the
  control plane too — a Turso Platform API token, an organization slug and a group. That is
  a developer's checklist standing between a person and a rent tracker.

**And the model underneath it is one workspace per account, which is not how the customer
is shaped.** `workspace.ownerAccountId` is `.unique()`, sign-up creates exactly one
workspace (#615), and there is no route to list what an account belongs to. A rental
business has several properties and several staff, and it has one relationship with us.
Requirement 14 of [[efforts/a-workspace-follows-its-user/spec]] noted organizations as the
place membership starts ending routinely and left them unbuilt.

*Directed by the human, 2026-08-30: the application ships as a desktop application and
nothing else. We write the software. The customer owns the account it runs against and
pays for it directly, and we register with no service on their behalf.*

# Goal

**An organization runs rentable entirely on storage it owns, and we run nothing.**

An owner installs the application, names their organization, and connects their own Turso
account through a browser consent. The application creates the organization's records and
its workspaces there. Staff are invited from a dashboard inside the application, join by a
link, and sign in with an email and a password. Nothing is pasted, no token is typed, and
no process of ours is reachable, running, or billed.

**The credential path stops being a service and becomes a vault.** What a member may do is
decided by which credentials their password unlocks, rather than by what the interface
chooses to show them.

# Scope

- Organizations, as a new concept: created, named, held locally, switched between.
- Workspaces as the property of an organization rather than of an account, with several
  per organization.
- The organization database: what replaces `control-plane`'s four tables, on the
  customer's account.
- Acquiring the customer's Turso authority by browser consent, from inside the
  application.
- Provisioning: creating the group, the databases, and applying
  `@rentable/workspace-migrations` to them, from a client rather than a server.
- Invitation, sign-in, password change, password reset, member removal.
- The credential vault: what is sealed, to whom, and what unlocks it.
- Roles and administration, enforced by credential rather than by interface.
- Retirement of `apps/control-plane/` and of Google sign-in.
- What the repository keeps so that a hosted tier remains possible later.

# Requirements

**1. An organization exists, and it owns workspaces.**
A workspace belongs to exactly one organization. An organization holds one or more
workspaces. `workspace.ownerAccountId` being `.unique()` is the constraint this removes.

**2. An organization's records live on the customer's own Turso account, in one database.**
The organization database replaces `control-plane`'s `account`, `workspace`, `membership`
and `session` tables. It holds no rents record: a ledger is a workspace database, and the
separation the control plane had between the credential path and the data path survives as
a separation between two databases rather than between a service and its clients.

**3. The owner grants the application authority over their Turso account by browser
consent, and types nothing.**
No Platform API token is pasted, and no organization slug or group name is typed. The
consent is the whole of it.

**4. The application asks for the narrowest Turso authority that does the job.**
Creating databases and minting credentials for them. Never deleting a database, unless the
human is deleting a workspace in the interface at that moment.

**5. The owner's Turso authority is held on the owner's machine and never written to any
database.**
It is re-obtainable by repeating the consent, which is why it is never sealed into the
vault: a credential a person can re-acquire for themselves is not one worth storing where
an attacker could reach it.

**6. An owner moves to a new machine without losing the organization.**
Install, join, sign in, and repeat the consent once. No device is the organization's
keeper.

**7. A member is invited by email, from a dashboard inside the application.**
The invitation names their role and which workspaces they belong to, and produces a link
and a generated password. **The application sends no mail**: we have registered with no
mail service, so the interface says so and offers what a person needs to send it
themselves.

**8. A member joins by opening the link, which registers the organization on that machine.**
The link carries what the machine needs to find the organization and nothing that is
useful on its own.

**9. A member signs in with an email and a password, and the password unlocks their
credentials rather than being compared against a stored value.**
A wrong password yields no usable key. There is no comparison for a modified client to
skip.

**10. A first sign-in requires the password to be changed.**

**11. Roles decide administration, and administration is enforced by what a member's vault
holds.**
An owner creates and destroys workspaces and removes members. An administrator invites,
resets passwords, and manages membership. A member reads and writes the workspaces they
belong to. A member who is granted read-only access cannot write, and the refusal comes
from Turso rather than from the interface.

**12. Administration is not the owner's alone.**
`packages/workspace-permission` already names `inviteMember`, `removeMember`, `changeRole`,
`renameWorkspace`, `deleteWorkspace` and `transferOwnership` as separate acts. Which of
them a role carries is what a role means.

**13. A member can change their own password, and an administrator can reset one they do
not know.**
A reset does not require the old password and does not reveal the member's existing
credentials to the administrator performing it.

**14. Removing a member ends their access to the workspaces they held.**
What "ends" means in the presence of a credential already on their machine is
[[skills/plan]]'s to work out; that it must end is this requirement.

**15. The holder of an invite link alone learns nothing about who is in the organization.**
Names, email addresses and workspace names are not legible to somebody holding only what
the link carries.

**16. A member's role, permissions and identity cannot be altered by another member.**
Turso's permissions are per table and not per row, so every member who can write the
organization database can write every row of it. The fields that carry authority must be
proof against that.

**17. The login screen lists the organizations this machine has joined, and switches
between them.**
One person may hold different roles in different organizations, and one machine may be
used by more than one of them.

**18. Signing in works with no network.**
Only synchronising needs one. This replaces the three-day refresh window, which
[[contexts/desktop/remote-sync]] describes and which exists because a service had to be
reachable.

**19. Google sign-in is retired.**
It is a service we registered with, its client id and secret ship in every build, and its
only remaining job is answering who somebody is — which the organization now answers.
*This is the second retirement of a Google integration here; Drive sync went at #554 and
sign-in is what survived it.*

**20. `apps/control-plane/` is retired, and what it knew that is still true survives as a
package.**
The Turso Platform API client, provisioning, and the workspace migration runner are used
by the desktop now. A hosted tier remains possible later without being planned: what makes
it possible is that the knowledge lives somewhere neither application owns.

**21. Both locales, both directions.**
Every surface this effort adds — consent, join, sign-in, the administration dashboard —
is first-class in Arabic and English, as everything here is.

# Acceptance criteria

1. A workspace row names an organization, and two workspaces of one organization can exist
   at once. Nothing constrains an account to one workspace.
2. A schema test fails if a rents domain table appears in the organization database, as
   `apps/control-plane/src/tests/boundary.test.ts` does today for the control plane.
3. A first run creates an organization without the human typing a token, a slug, a group
   name, or a URL. The setup screens are walked and the only text entered is the
   organization's name and a password.
4. The consent requests a scope set that excludes database deletion, and a test pins the
   set requested.
5. Nothing writes the Platform API token into any database. A test reads the organization
   database's schema and its writers and fails if the token can reach either.
6. An owner's organization is restored on a second machine from the link, the email, the
   password, and one consent, with the first machine offline.
7. Inviting produces a link and a generated password, and the interface states that it
   cannot send them. The generated password is not derived from the email or the name.
8. Opening the link on a machine that has never seen the organization adds it to the login
   screen's list.
9. A wrong password produces no credential. A test replaces the sign-in check with one
   that always succeeds and shows that the workspace still cannot be opened.
10. A member whose password has never been changed is required to change it before
    reaching any other surface.
11. A read-only member's write is refused by Turso, demonstrated against a live database.
    An administrator's attempt to delete a workspace database is refused for want of
    authority, not for want of a button.
12. Each act in `ADMINISTRATION` is granted or withheld by role, and a test covers each
    act against each role.
13. A password change re-seals the member's own credentials and leaves every other
    member's untouched. An administrator's reset restores a member's access without the
    administrator learning the member's previous password.
14. A removed member's application can no longer open the workspaces they held, and the
    remaining members' access is unbroken afterwards.
15. Given only what the invite link carries, no email address, display name, or workspace
    name is readable. A test asserts this against a populated organization database.
16. A member who writes another member's row with an altered role or key is rejected by
    every other client on read, and a test performs exactly that write.
17. Two organizations are joined on one machine and both appear at sign-in; switching
    between them changes what is open and requires no reinstall.
18. Sign-in succeeds with the network down, on a machine that has signed in before.
19. No Google OAuth client id, secret, or scope remains in the tree, and a test fails if
    one returns.
20. `apps/control-plane/` no longer exists as an application. `pnpm build` and the
    `integration` gate pass without it.
21. Every new surface renders correctly in Arabic and in English, right to left and left
    to right.

# Constraints

- **Credentials never cross the IPC boundary.** [[rules/credentials]], under *Client
  boundary*. Everything this effort adds — the consent, the key derivation, the vault, the
  Turso Platform calls — is Rust's. The web layer observes outcomes. This is the existing
  boundary and this effort does not get to relax it because it has more credentials to
  handle than the last one did.
- **The customer's account is the customer's.** We hold no token for it, keep no copy, and
  reach it only from a machine a member is sitting at.
- **We register with no service on the customer's behalf.** No identity provider, no mail
  provider, no error collector, no analytics. *This is what rules out the Clerk and Auth0
  route that Turso's JWKS support would otherwise open, which is recorded in the evidence
  because it is the obvious answer and somebody will propose it again.*
- **A password check that a modified client can skip is not a check.** With no server there
  is nothing to verify against, so the password must be what makes a credential usable.
  This is the constraint the whole credential design answers to, and requirement 9 is its
  acceptance criterion.
- **There is no rate limiting, and there cannot be.** An attacker attacks the ciphertext on
  their own hardware, so a counter kept locally protects nothing. Cost per guess is the
  only defence available, which makes the key derivation parameters a security decision
  rather than a performance one.
- **Offline-first survives, and gets stronger.** Every read and every write is served from
  the local replica, as today. Sign-in joins them, which the three-day window prevented.
- **Turso mints database credentials at two levels only.** `full-access` and `read-only`.
  The per-table permissions its CLI documents are not on the REST endpoint that mints
  tokens — confirmed against the OpenAPI specification, in the evidence. So a full-access
  member holds a credential that reaches the whole ledger outside the application, which is
  what decision 05 of [[efforts/a-workspace-follows-its-user/spec]] already accepted.
- **Revocation is per database and total.** Rotating a workspace's credentials invalidates
  every token for it at once, so removing one member is an act against everybody's
  credential. Nothing finer exists.
- **The desktop is the only client.** [[contexts/repository]] already says every layer
  including the one shaped like a backend runs inside the application; this makes it true
  of the last layer that did not.

# Out of scope

- **A hosted tier.** Requirement 20 keeps it possible and this effort does not build it,
  configure it, or leave a switch for it. A second entry under `apps/` is a later effort's,
  if ever.
- **Turso account creation.** The consent screen is where a person without an account makes
  one, and it is Turso's screen. We do not wrap it, mirror it, or explain it beyond a
  sentence.
- **Sending mail.** Requirement 7 is explicit that the application cannot. Adding a mail
  provider would be registering with a service on the customer's behalf, which the
  constraints forbid.
- **Recovering an organization whose owner is gone.** Transfer of ownership is named in
  `ADMINISTRATION` and is a real requirement, but it is an open question here rather than
  scope, because the answer changes what a vault holds and that is not settled.
- **Two-factor authentication.** A second factor with no service to carry it is a device
  secret, which breaks requirement 6. If it is wanted it is a later effort with its own
  argument.
- **Migrating the existing hosted workspace.** One database on one account belongs to the
  author and is not a customer. Whether it is carried across or recreated is an operational
  question for the day this lands.
- **Anything about how the rents ledger works.** Contracts, payments, tenants, units and
  every derived status are untouched. This effort changes where a workspace lives and who
  may open it, and not one thing about what is in it.
- **Per-table permissions.** The REST mint does not offer them, so roles bind
  administration and access level and not the shape of a query.

# Assumptions

- **Turso's OAuth 2.1 authorization endpoint honours a loopback redirect from a client that
  is not an MCP agent.** Its registration endpoint accepted one, and the metadata advertises
  a public client with PKCE, which is the ordinary shape for a desktop application. The
  authorize step is where it could still refuse. **This is the assumption the whole effort
  stands on**, and it is the first thing a prototype should attack.
- **The consent screen lets the caller request a scope set** rather than always offering the
  human the full picker. Requirement 4 is weaker if it does not.
- **A `read-only` credential is enough for a member to reach the organization database
  before their vault is open, and a `full-access` one after.** If a joining member must
  write before they have unlocked anything, requirement 15's protection is harder.
- **`turso` 0.8.0-pre.7's sync client accepts a database token minted by the Platform API
  and behaves the same as the one the control plane mints today.** It is the same kind of
  token, minted by the same endpoint, so this is expected rather than hoped for.
- **A small organization is under fifty people.** Every design here reads the whole member
  table onto the client and works over it locally, which is right at that size and wrong at
  ten thousand.
- **The customer's usage stays inside Turso's free tier for a long time.** 5 GB, 100
  databases, 500 million row reads per month, against a rents ledger for a few properties.
  This is an assumption about cost landing on the customer being tolerable, not about it
  being free forever.

# Open questions

- **What happens when the owner leaves, or dies.** Every path here roots in one Turso
  account. `transferOwnership` exists as a permission bit and has no mechanism. An
  organization that cannot survive losing its owner is a product failure, and the answer
  changes what a vault holds, which is why it is a question rather than a requirement.
- **Whether an administrator may create workspaces.** It decides the consent scope set and
  it decides what an administrator can cost the owner in Turso usage. Requirement 11 as
  written says no.
- **What a member sees when their organization's storage is out of quota, or its account is
  in arrears.** The failure is the customer's to fix and ours to explain, and it is a
  surface nobody has drawn.
- **Whether the organization database and a workspace database can be the same database for
  an organization holding one workspace.** It halves the provisioning for the common case
  and it puts the directory in the same file as the ledger, which requirement 2 separates
  for a reason.
- **How a schema migration reaches a workspace database when there is no server to apply
  it, and what a member on the older build sees while it has not.** Requirement 20 moves
  the runner into the desktop and does not say who runs it or when.
- **Whether the invite link's embedded credential expires, and what a person does when it
  has.** A short life bounds a leak and strands anybody who opens the link late.

# Risks

- **The consent flow is refused at the authorize step**, and there is no supported way for
  a desktop application to obtain a customer's Turso authority without pasting a token.
  This is the assumption above, restated as what it costs: requirement 3 falls, onboarding
  becomes a token paste, and the effort survives in a worse form rather than dying.
- **The credential design is wrong in a way that reviews well.** This is real cryptographic
  plumbing — a key derivation, a sealed credential, a signature over authority fields, a
  rotation path — and it is the kind of thing that passes every test and is broken anyway.
  It shows up as nothing at all until somebody competent looks. The mitigation is a written
  threat model before code and building it test-first, and both belong in the plan.
- **Turso's authorization surfaces are in beta.** JWKS issuers are limited to two named
  providers, the sync client is a pre-release, and the OAuth endpoints are documented as an
  MCP integration rather than as a public one. Any of them can move.
- **A generated password ends up weak in practice**, because an administrator replaces it
  with something they can say over the phone. It shows up as a compromise nobody attributes
  to this decision. Requirement 7 says generated; whether the interface permits a chosen one
  is a design question with a security answer.
- **Deleting the control plane deletes the only account system that works today.** The
  application currently signs somebody in. If this effort lands half-built, it lands
  unusable, so the order it is built in matters more than usual.
- **A support burden lands where nobody is watching.** Every customer now operates a Turso
  account, and every failure it can have is a failure of our application from where they are
  sitting. That is not a technical risk and it is the one most likely to actually happen.
