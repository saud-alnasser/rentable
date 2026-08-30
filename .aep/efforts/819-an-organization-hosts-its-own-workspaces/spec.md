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

**The two are never collapsed into one database**, not even for an organization holding a
single workspace. A workspace credential is whole-database, so a directory sharing a file
with a ledger is a directory every full-access member can read outside the application, and
requirement 15 would then rest entirely on requirement 16's signatures. *Settled 2026-08-30;
it was an open question, and the answer follows from the credential granularity rather than
from a preference.*

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
resets passwords, and manages membership.

**Only an owner creates or destroys a workspace, and this is forced rather than chosen.**
Creating one means creating a database on the customer's Turso account, which needs the
platform authority requirement 5 keeps on the owner's machine and out of every database. An
administrator therefore has nothing to create a database with. *Settled 2026-08-30; the open
question asked whether administrators should be permitted to, and requirement 5 had already
answered it.* A member reads and writes the workspaces they
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

**A reset is a reissue, and no escrow copy of anybody's vault exists.** A vault is sealed to
its member's password, so an administrator cannot open one; a reset builds a fresh vault
from credentials the administrator already holds, under a new password, by the same path an
invitation takes. **The limit is deliberate**: an administrator restores access only to
workspaces they can reach themselves, and a member locked out of a workspace no present
administrator belongs to waits for one who does.

*Settled 2026-08-30. The alternative was a copy of every vault sealed to an organization
administration key, which would let any administrator restore anything. It was rejected
because that key opens every member's credentials at once, which is a second master secret
beside the owner's Turso authority and the obvious thing to steal. Reissue creates no secret
that did not already exist.*

**A member may choose their own password at first change, subject to a strength floor
checked on the machine.** The password is the only thing between an attacker holding the
ciphertext and the workspace, and there is no server to slow them down, so the interface
says exactly that rather than showing a meter. *Settled 2026-08-30; risk 4 raised it. A
password nobody can remember is written on a note beside the machine, which is worse than a
chosen one that clears the floor.*

**14. Removing a member ends their access, and how fast is the administrator's choice.**

Turso rotates credentials per database and totally, so cutting off one member cuts off every
member of that workspace at once. Removal therefore has two paths and the interface offers
both:

- **Remove** stops renewing. The member's credential dies when it expires, access ends within
  its lifetime, and nobody else is disturbed. This is what the control plane does today, and
  it is the default.
- **Remove and lock out now** rotates the workspace's credentials. The removed member is cut
  off immediately, and every remaining member's sync stops until their application reaches
  the organization database and collects a re-sealed credential. The interface says so before
  it does it.

**What removal never does is take back what is already on their disk.** Their replica holds
the rows it held, and requirement 18 means their application still opens. Removal ends future
synchronisation and nothing else, and saying otherwise would be a promise the architecture
cannot keep.

*Settled 2026-08-30. Rotating always was rejected because an ordinary departure would break
every colleague's sync, including anybody offline at the time. Never rotating was rejected
because it leaves no answer at all for the departure that is not ordinary.*

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

**22. An organization outlives the person who created it.**
Where the consented Turso account reaches an organization, the application provisions into
that organization rather than the personal account, selects it without asking, and the owner
role becomes whoever can consent on it. Where it reaches none, the personal account is used
and **the application states plainly that the organization ends with that account**, at the
moment the choice is made rather than in documentation somewhere.

*Two Turso mechanisms carry succession and both were found 2026-08-30. A second admin on the
customer's Turso organization can complete the consent, and the group transfer endpoint moves
a group to another organization with, in Turso's words, existing database URLs and tokens
continuing to work. Neither reprovisions anything and neither reseals a vault. Requiring an
organization outright was rejected because whether one needs a paid plan could not be
established, and a requirement resting on an unverified price breaks for the customer who
cannot pay it.*

**23. An invitation expires; the link does not.**
The link is a locator and carries no credential (requirement 8), so nothing about it goes
stale. The invitation it points at is a row in the organization database with a lifetime,
revocable and reissuable from the dashboard. A link opened after its invitation lapsed still
finds the organization, and says the invitation lapsed rather than failing.

**24. A workspace is never opened by a build that does not understand its schema.**
With no server, a migration is applied by a client, and a second client on an older build
must not read the result. The older build says the workspace needs a newer version of the
application and offers nothing else. **Which client applies a pending migration, and under
what lock, is [[skills/plan]]'s**; that no build ever reads a schema it was not written
against is this requirement.

**25. A refusal belonging to the customer's Turso account is explained as one.**
When Turso refuses for quota or for billing, the member is told the organization's account
needs attention rather than shown a synchronisation error. **The local replica keeps serving
every read and every write throughout**, because requirement 18 does not depend on the
account being in good standing. Account detail reaches the owner and nobody else.

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
    administrator learning the member's previous password. A test asserts that no key an
    administrator holds opens a vault the administrator did not build, so an escrow copy
    cannot be added later without failing it. A password below the strength floor is refused
    at first change.
14. After an ordinary removal no new credential is issued to the removed member and every
    remaining member's sync is unbroken, demonstrated against a live database. After a lock
    out, the removed member's existing credential is refused by Turso and a remaining member
    recovers by reaching the organization database once. A test pins that removal leaves the
    removed member's local replica readable, so the limit is recorded as behaviour rather
    than discovered later as a bug.
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
22. Where the consented account reaches an organization, the application provisions into it
    without asking. Where it reaches none, the personal account is used and the screen states
    that the organization ends with it. A test covers both answers.
23. An invitation past its lifetime is refused, and opening its link shows the organization
    by name with the reason. An administrator revokes an unused invitation and the link stops
    working.
24. A build older than a workspace's schema refuses to open it and says why. A test opens a
    migrated workspace with the previous schema version and asserts nothing is read.
25. A quota refusal from Turso produces a message naming the account rather than the sync,
    and reads and writes continue against the local replica while it stands. A member who is
    not the owner sees no account detail.

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
- **No key exists that opens more than its holder's own credentials.** Requirement 13
  settles reset as reissue for this reason. A design that introduces an organization-wide
  unlocking key is a different effort with a different threat model, and it must not arrive
  as a convenience during implementation.
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
- **A request queue for workspace creation.** Requirement 11 leaves only the owner able to
  create one, so an administrator who needs a workspace asks the owner out of band. Modelling
  the request as a row somebody approves is a second approval mechanism next to invitation,
  and it is the obvious thing to build without being asked for.
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

*Six questions stood here on 2026-08-30 and four were settled the same day, into requirements
11, 13, 14 and 22 to 25, each carrying the reasoning where it was decided. What remains is
two, they are both factual rather than product, and **one prototype answers both**.*

- **Whether the consent screen grants the scope set the caller asks for**, or always presents
  the human the full picker. Requirement 4 is a request either way; whether it is a
  constraint depends on this. The authorization server metadata advertises no
  `scopes_supported`, so nothing short of completing a consent settles it.
- **Whether a Turso organization requires a paid plan.** It decides whether requirement 22's
  preferred path is available to every customer or only to some. Turso's pricing page names
  no organization tier and no seat at all, checked 2026-08-30, so the source is silent rather
  than negative. Requirement 22 is written to survive either answer, which is why this
  question blocks nothing.

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
  providers and the sync client is a pre-release. *The third ground fell on 2026-08-30: the
  OAuth endpoints were recorded as an MCP integration, and the authorization server metadata
  is in fact served from `api.turso.tech`'s own well-known path, byte-identical to
  `mcp.turso.ai`'s. There is one authorization server, it is the account's, and `mcp`
  in the authorize path is a fact about the URL rather than about who may call it.* The
  remaining two can still move.
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
