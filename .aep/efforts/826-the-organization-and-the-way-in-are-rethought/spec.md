---
status: draft
---

# Problem

**The organization is sound and heavy, and the weight is the model's, not the screens'.**

Effort 819 put an organization on the customer's own Turso account so that rentable ships
with no server. What it built to do that is a vault per member sealed under a password, a
chain of administrator certificates signing every row, a grant per member per workspace at
two access levels, one permanent organization link, invitations that expire, generated
passwords handed over beside the link, removal at two speeds, reissue, reset, rename and a
lock-out cost. Effort 824 rebuilt the screens on top of it, and on 2026-09-13 the human
closed it after walking the first run, not because a screen was wrong but because the
experience was: too many things to hand a colleague, too many places to administer, a login
page every morning, and four pages saying pieces of one thing.

Reading the code and the evidence found five things underneath that feeling.

- **The first run asks for something the free plan cannot do.** The walk's connect step tells
  the owner to create an empty group in Turso's dashboard and pick it on the consent screen.
  `turso group create` says creating more than one group is limited to Scaler, Pro and
  Enterprise ([[efforts/826-the-organization-and-the-way-in-are-rethought/evidence/research/what-an-organization-with-members-costs-on-turso]]),
  so on a Free or Developer account the only group to pick is the one already holding
  everything, and the instruction cannot be followed.
- **Three strings to hand over, and one of them shown once.** An invitation is the
  organization's link, a username and a generated password, copied one at a time from a
  panel that says it cannot send them. The person connects with one, signs in with the other
  two, and is made to change the third.
- **A password every launch.** The vault opens for the run of the process and nowhere else,
  so every launch is the login page, on a machine that is nearly always one person's.
- **Four pages for one job.** Organization, workspace, account and settings each carry a
  slice: members and pending accounts on one, a members list with no actions and the sync
  status on another, the password on a third, the language and updates on a fourth. The
  workspace page's members row still reads "one person, and only one is possible today".
- **Half the permission model reaches no screen.** `changeRole`, `deleteWorkspace` and
  `transferOwnership` sit in `packages/workspace-permission` and in Rust with no interface,
  and the acts that do have one are gated by two coarse roles, so "administrator" is the
  only answer to "what may this person do".

*Directed by the human on 2026-09-13: rethink what an organization, a workspace, a member, an
invitation and an account are, and how onboarding, sign-in, roles, permissions and their
settings work and look; keep the domain logic, the record screens, the shell and Turso as
the sync engine. Ten choices were made the same day in three rounds and are recorded under
Requirements with their reasons.*

# Goal

**One Turso account, connected once; one link to hand a colleague; one place to administer;
and the application opens where you left it.**

The person who sets rentable up brings a Turso account and nothing else, and the walk tells
them the truth about what the consent covers. A member gets in by opening one link and
choosing a password, and from then on that machine opens straight into their last workspace.
What a person may do is a set of granular permissions, given as a named role and adjustable
one person at a time, and everything administrative, members, workspaces, the Turso account,
sync, the person's own password, the language, updates, lives in one settings surface the
rail's two menus open. Every concept has one name.

# Scope

- **The organization model**, in Rust and in the organization database: the permission set,
  the fixed roles, per-member widening and narrowing, the invitation link that carries
  everything, the reset that is a fresh link, the session that survives a launch.
- **The way in**: the first-run walk, the connect screen, the wall, the change-password
  surface, and what startup does with a remembered session.
- **The settings area**: one surface replacing `routes/organization`, `routes/workspace`,
  `routes/account` and `routes/settings`, with the invite and workspace dialogs, the members
  list and the workspaces list rebuilt inside it.
- **The rail's two menus**, redrawn to open the settings area's sections.
- `packages/workspace-permission`: the act table and the role table.
- The English and Arabic strings all of the above read, and the tests that pin them.
- `[[contexts/desktop/organization]]`, `[[contexts/desktop/remote-sync]]` and
  `[[contexts/repository]]`, corrected where this changes what they say.

# Requirements

*The organization* (*round one, 2026-09-13*)

1. **Only the owner holds a Turso account.** The organization lives on the owner's account
   as 819 built it; members are made inside the application and never touch Turso. *Chosen
   over every member holding a Turso account: a Turso organization with members needs the
   Scaler plan, 29 dollars a month, and the documentation says only an owner or admin may
   mint the token the consent produces, so a plain member may not be able to sign in at all
   ([[efforts/826-the-organization-and-the-way-in-are-rethought/evidence/research/what-an-organization-with-members-costs-on-turso]],
   [[efforts/826-the-organization-and-the-way-in-are-rethought/evidence/research/what-a-turso-member-can-do-through-the-consent]]).
   Chosen over a single-person application because it drops what 819 and 824 built.*
2. **An organization holds several workspaces, and a member reaches only the ones they were
   given**, at full or read-only access. This is 819's model and the human's picture of
   2026-09-13; the switcher in the rail stays. *Chosen over workspaces shared by everybody
   and over one workspace per organization.*
3. **A machine holds one organization, or none**, and reaching another is disconnect, then
   connect. Unchanged from 824's requirement 17.

*Permissions and roles* (*round two, 2026-09-13*)

4. **What a member may do is a set of granular permissions.** The grantable acts are:
   `inviteMember` (invite, and revoke or renew a pending invitation), `removeMember`
   (ordinary removal), `changeRole` (change another member's role and permissions),
   `resetPassword` (issue a member a fresh link), `renameMember`, `grantWorkspace` (give or
   withdraw full access to a workspace the actor holds full access on), and
   `renameWorkspace`. `transferOwnership` leaves the table (see Out of Scope).
5. **The acts that need the Turso authority belong to the owner and cannot be granted**:
   creating and deleting a workspace, minting a read-only credential, locking a member out,
   renewing credentials, the Turso account itself, and the organization's own link. The
   interface never offers them to anybody else, and a refusal names the owner. *Chosen over
   sealing the token into a granted member's vault: a nine-scope token with no expiry held
   on several machines is a credentials-rule change with a revocation story of its own.*
6. **Roles are fixed bundles, and a member's permissions can be widened or narrowed
   individually.** rentable ships three: `owner` (every act, including requirement 5's),
   `administrator` (every grantable act), `member` (none). A role is what a person is
   invited as and what the members list calls them; the stored permissions are the truth,
   and a holder of `changeRole` can add or remove single acts on another member's row. Nobody
   changes their own permissions and nobody changes the owner's. *Chosen over owner-defined
   roles, which need a role editor, and over permissions with no role name, which leave the
   members list with no one-word summary.*
7. **A member who is given an act that writes another member's row can sign it.** The chain
   819 built stays: what a member may do is what their signed row carries, every command
   refuses again on the row, and a row is verified against the key the link pinned. How a
   widened member comes to hold a certificate, and when it is retired, is `plan.md`'s.

*The way in* (*round two, 2026-09-13*)

8. **An invitation is one link.** Inviting asks for a username, a role and the workspaces
   with their access; what it produces is a single `rentable://` link and the sentence that
   rentable cannot send it. Opening the link on a machine that holds no organization
   connects the machine, names the organization and the username, and asks the person to
   choose a password; on choosing it they are signed in and inside their first workspace.
   The link admits whoever opens it first, once, and lapses after seven days; the pending row
   offers it to copy again until then. No generated password exists. *Chosen over the
   organization link plus a username and a handed password.*
9. **A reset is a fresh link.** A holder of `resetPassword` issues a member a new link; the
   member opens it and chooses a new password. The member's grants are re-sealed as reissue
   does today, only over the workspaces the issuer holds full access on, and the rest are
   named as unreachable. The member's own password change, from the settings area, still
   needs the current password.
10. **The organization link stays, for a second machine.** An existing member connects a new
    machine with the organization's link and signs in with their username and password, as
    824 built. The connect screen takes either kind of link in one field and reads which it
    is. The owner restored on a second machine repeats the consent from the settings area.
11. **The wall is the login page of the held organization**: its name, a username, a
    password, unlock, and disconnect at the foot. Unchanged from 824's requirement 7. It is
    reached after a sign-out or on a machine connected by the organization link.
12. **A signed-in machine stays signed in.** After a sign-in the machine keeps what it needs
    to open the member's vault, and the next launch opens straight into the last workspace
    under the loading surface. Signing out forgets it and shows the wall. The password is
    asked again only to change it. *Chosen over a password on every launch, on the reading
    that a machine is nearly always one person's; the risk on a shared machine is recorded
    below.*

*The first run*

13. **The walk is connect, name, workspace, as 824 built it, and its connect step says what
    the consent covers.** No instruction to create a group. The step says that the consent
    covers every database in the group chosen, that on a Free or Developer account there is
    exactly one group, so a Turso account used for rentable alone is the clean choice, and
    that on a paid account an empty group is the one to pick. The succession sentence stays,
    shorter. Nothing is typed but the organization's name, the owner's username, a password
    and the first workspace's name.

*The settings area* (*round three, 2026-09-13*)

14. **One settings surface, sectioned, replaces four pages.** `/organization`, `/workspace`
    and `/account` are retired; `/settings` holds a section rail and these sections, in this
    order: `general` (language, ending soon), `you` (username, role, organization, change
    password, sign out), `members`, `workspaces`, `sync` (sync status and sync now, the
    account refusal, the Turso account with reconnect and forget, the organization link,
    disconnect this machine), `updates`, `diagnostics`. Each section is addressable so a
    menu can open it. What a section shows is gated by what the session permits, and a
    section with nothing to show for this member is absent, not empty.
15. **The members section is one list.** A row is a username, an avatar, a role, the
    workspaces held with their access, and for an invited person who has not yet signed in
    a pending mark with the expiry. Row actions, each behind its act: change role and
    permissions, workspaces and access, rename, new link, remove. Remove asks once and
    offers lock out in the same dialog, for the owner, with its cost; a pending row offers
    copy link, new link and revoke. The invite button opens the invite dialog. *Pending
    invitations as rows in the list was chosen over a section of their own.*
16. **The workspaces section is one list.** A row is the name, the member count and whether
    it is the open one; row actions are rename (`renameWorkspace`), members (who holds it
    and at what access, `grantWorkspace`), and delete (owner, asking once and naming what is
    lost). New workspace is the owner's button and opens the workspace dialog. Export and
    import stay, acting on the open workspace, in this section.
17. **The rail's two menus open the sections.** The workspace menu keeps the switcher and
    offers workspaces and invite; the account menu offers you, settings and sign out. The
    two dialogs (invite, new workspace) open from the rail and from the settings area alike,
    as 824's requirement 12 built.

*Vocabulary*

18. **One name per thing, in both locales.** `organization` is the business on its Turso
    account; `member` is a person in it; `Turso account` is the only thing called an
    account, and a member's own row is `you` or their username; `workspace` is a set of
    records; `invitation link` and `organization link` are the two links; `access` is full
    or read-only on a workspace; `role` is the bundle and `permissions` the acts;
    `connect` and `disconnect` are a machine and the organization; the Turso consent is
    `connect Turso account` and `forget Turso account`; `sign in` and `sign out` are the
    member. `pending account`, `unlock your place` and every string the retired pages read
    go.

*Everything in scope*

19. **A machine holding the previous shape forgets it at startup**, as 824's requirement 17
    did: a member table without the new permission set, or an invitation table of the old
    shape, is the signal; every replica is deleted, the record emptied, the Turso authority
    cleared, and the application opens on the first screen. Nothing is published, so there
    is no migration.
20. **Both locales, and the tests that hold the shape.** Every screen and section this
    effort adds or moves has a component test asserting what it renders and what each act
    is gated on; the Rust model tests cover every permission against every role, the
    invitation link's single use and lapse, the reset link, the remembered session and its
    forgetting on sign-out; the Arabic strings are written, not copied.

# Acceptance Criteria

1. `grep` over `apps/desktop/src` and `apps/desktop/tauri/src` finds no path that asks a
   member for a Turso consent, and the walk's connect step is reached only by the first run.
   The organization context records the declined reading and why.
2. A member invited with two of three workspaces sees two rows in the switcher and cannot
   open the third; a read-only member's write is refused by Turso, as 819's criterion 11
   already pins.
3. `organization_state_get` answers with one organization or none; connecting while one is
   held is refused. Unchanged tests from 824 still pass.
4. `packages/workspace-permission/index.ts` exports exactly the seven acts of requirement 4,
   the Rust mirror test still reads it as text and passes, and `transferOwnership` appears
   nowhere in the tree.
5. Every command that needs the Turso authority calls the owner check before anything else
   and, for a non-owner, refuses with a sentence naming the owner; a test calls each with an
   administrator holding every grantable act. No interface control for any of them renders
   for a non-owner, asserted in the workspaces and members section tests.
6. `ADMINISTRATION_BY_ROLE` gives the owner every act, the administrator every grantable
   act and the member none; `member_change_role(member_id, role, permissions)` writes both,
   refuses the caller's own row and the owner's row, and the members list shows a widened
   member's role and their extra acts. Asserted in Rust and in the section's test.
7. A member widened with `inviteMember` can invite, and the invited row verifies on every
   other client; narrowed back, a row they newly sign is refused. Asserted in Rust with the
   chain's existing tests extended.
8. `member_invite(username, role, workspaces)` returns one link and no password; opening it
   on a store holding no organization records the organization, presents the username and
   a password field, and on submit opens the vault and signs in with `must_change_password`
   false; a second open of the same link is refused, and an open after seven days says the
   invitation lapsed. Asserted in Rust and in the connect screen's test; the invite dialog's
   test finds one copy control.
9. `member_reset(member_id)` returns a link; opening it on the member's machine asks for a
   new password and re-seals their grants over the issuer's reachable workspaces, naming the
   rest. Asserted in Rust. The you section's change-password form asks for the current
   password, asserted in its test.
10. The connect screen accepts an organization link and lands on the wall, and accepts an
    invitation link and lands on the choose-password step, from one field. Asserted in its
    test with both link kinds.
11. `startup-sign-in.svelte.test.ts` from 824 passes unchanged for the locked wall.
12. With a remembered session, `startup.start()` reaches `ready` with the last workspace open
    and never shows `sign-in`; after `signOut()` the next `start()` shows `sign-in` as
    `locked`; nothing under the data directory or the machine record holds a password or a
    private key in the clear, asserted by a Rust test that reads what was written. Verified
    once by hand across a relaunch.
13. `setup.test.ts` holds `fieldsPresented` to name, username, password, workspace, and the
    vocabulary guard finds no group instruction; the connect step's three statements are
    pinned as literals in both locales and name the one-group fact.
14. `routes/organization`, `routes/workspace` and `routes/account` do not exist;
    `routes/settings` renders the seven sections in order for the owner, and for a plain
    member renders `general`, `you`, `workspaces` limited to what they hold, `sync` without
    the owner's items, `updates` and `diagnostics`, with no `members` section. Asserted in
    the page's test with two sessions.
15. The members section's test renders an active row and a pending row with the fields of
    requirement 15, finds each row action present only when the session permits its act,
    and finds the invite button opening the dialog.
16. The workspaces section's test renders rows with the fields of requirement 16, finds
    rename, members and delete each behind their gate, finds new workspace only for the
    owner holding authority, and finds export and import present.
17. The workspace menu's test finds the switcher rows, a workspaces row opening
    `/settings` at the workspaces section and an invite row opening the dialog; the account
    menu's test finds you, settings and sign out.
18. `src/lib/i18n/tests/organization.test.ts` asserts the retired strings are absent from
    both locales and that each term of requirement 18 has one key; a read of both locales
    for every string the effort added is recorded in the run log.
19. A store of the previous shape is forgotten on the first `organization_state_get` of a
    launch, asserted in Rust with a fixture built by the shape 824 left; verified once on the
    human's machine.
20. `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass.

# Constraints

- **[[rules/credentials]], *Client boundary*: the password, the keys, the Turso authority and
  every credential stay in Rust.** A remembered session (requirement 12) is held in the OS
  credential store by Rust, and what crosses to the web layer is still facts. *Why: the
  credential boundary and the network boundary have to be the same boundary.*
- **No server, no mail, no service registered on the customer's behalf.** The invitation and
  the reset are links a person hands over themselves. *Why: 819's constraint, and the reason
  this application can ship.*
- **No key opens more than its holder's own credentials.** A reset is a reissue over what the
  issuer reaches; no escrow arrives as a convenience. *Why: 819's requirement 13 and its
  reasoning.*
- **The chain stays, and every act that writes another member's row is signed by a certified
  key.** *Why: Turso's permissions are per table, so every writer of the organization
  database can write every row, and the signatures are what make a row's authority proof
  against that (819's requirement 16).*
- **Removal keeps its two speeds.** Ordinary removal ends renewal; lock out rotates and says
  its cost. *Why: 819's requirement 14, settled twice, and nothing here changes the
  revocation radius Turso offers.*
- **Usernames stay sealed.** A wrong password still costs one derivation per member. *Why:
  824's constraint; a link holder must not learn who is in the organization.*
- **Every screen before sign-in stays on `StandaloneSurface`, every writing form on
  `FormSurface`, and the settings area is built from the design package's blocks.**
  `[[rules/interface]]`. *Why: the two rules exist so a screen reads as this application.*
- **Looks are settled on screen, on real data.** The settings area's section rail, the
  members rows and the invite result are prototyped in the running application against the
  human's own organization before the tickets that build them are cut. *Why: 824's
  history is one slot and one row set added and withdrawn after being looked at.*
- **A changeset rides with the change.** *Why: every screen here is one a person sees.*
- **Nothing here changes the rents ledger, the record screens, or the shell frame.** *Why:
  the human said these are good.*

# Out of Scope

- **Every person on their own Turso account.** Declined on the cost and the unverified
  consent; recorded as a repository boundary in `[[contexts/desktop/organization]]`.
- **Owner-defined roles and a role editor.** Roles are the three fixed bundles.
- **Transfer of ownership.** The owner is whoever holds the Turso authority and the
  organization key; succession is Turso's, as 819's requirement 22 states. The act leaves
  the permission table rather than staying as a promise.
- **A session that expires on its own.** A remembered session ends at sign-out and nowhere
  else.
- **Two-factor authentication, sending mail, a hosted tier, Turso account creation, per-table
  permissions.** 819's boundaries, unchanged.
- **Creating a Turso group from the application.** A group-scoped token cannot.
- **A migration for organizations built before this effort.** Nothing is published; a
  machine forgets them (requirement 19).
- **The rents ledger, the record screens, the command palette, the shell frame, the
  dashboard.**
- **Renaming the organization.** Not asked for; the name is set on the walk.

# Assumptions

- The OS credential store on Windows, macOS and Linux can hold what a remembered session
  needs, as it holds the Turso authority today.
- An invitation link can carry a secret that opens a vault built under it, as 819's original
  join did before 824 retired it, and the same path serves a reset.
- Opening an invitation link on a machine that already holds an organization is refused with
  the disconnect-first sentence, as connecting is today.
- The settings area's section rail fits the design package's existing sidebar and field-set
  blocks without a new block; if it needs one, the plan says so.
- The seven acts of requirement 4 are enough for the organizations expected; a 54th flag is
  the permission package's own migration story and is far away.

# Open Questions

- Whether the invitation link should also carry the workspace access levels the invite chose,
  so that the person's first screen can name what they hold before they choose a password.
  Cosmetic; the plan decides.
- Whether the `sync` section's name reads right in Arabic beside `members` and `workspaces`,
  or whether `Turso` should head it. Settled on screen.

# Risks

- **A remembered session weakens a shared machine.** Anyone at the machine opens the ledger.
  Sign-out is the answer and the you section says so; a session that expires is out of
  scope by decision and this is the cost.
- **An invitation link is a credential for seven days.** Whoever opens it first is the
  member. The invite result says to hand it over the way you would a password; revoke is
  one press away.
- **The chain's complexity survives, and widening spreads it.** Certificates were the
  owner's and administrators'; a widened member needs one too. The plan owns when it is
  issued and retired, and the existing re-signing routine is what it extends.
- **Forgetting at startup wipes the human's own machine again.** As 824 did; the run says so
  before the first launch of the build.
- **The effort is large.** Twenty requirements across Rust, four retired routes, one new
  area, both menus, both locales. The plan cuts it by area and may propose landing the model
  before the screens; the human decides whether it stays one effort.
- **The workspace page's export and import move.** A person who knew where they were finds
  them in the workspaces section; the command palette still searches them.
