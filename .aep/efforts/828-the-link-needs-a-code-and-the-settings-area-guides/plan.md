---
use-when: "building a ticket in this effort and the approach is not obvious from the spec"
---

# Architecture

The spec is [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]];
requirements and criteria are referenced by number and never restated here. Every path is
relative to `apps/desktop/` unless written out. The evidence behind the link decisions is
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/evidence/research/what-a-link-exposes-and-what-a-code-can-bound]].

**Three seams, and the model's lands first**, and a fourth added mid-run (*The way in, on a
machine holding nothing*, below, decided with the human on 2026-09-15 from
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/evidence/research/what-a-consent-alone-can-recover]]). What a link's text carries and what unseals it;
the second-machine link and the row that spends it; the settings area's rows and the you
section's writes. The two rail menus are small and independent and land before any of them.
Three approaches were put to the human on 2026-09-15 and the choices are recorded with what
lost.

## The link carries one sealed payload (requirements 1, 2, 4, 5, 11)

`JoinLink` in `tauri/src/organization/link.rs` becomes five clear fields and one of two
credentials:

```
{ organizationId, organizationName, verifyingKey, remoteUrl,
  credential: { clear: "<token>" } | { sealed: "<base64url>" },
  half?: { kind: "invitation" | "machine", id, secret, expiresAt } }
```

The organization's own link is the clear credential and no half, exactly what
`invite::organization_link` builds today from `organization.link_credential_sealed`. Every
other link is a sealed credential and a half. **A link in the previous shape names
`readOnlyCredential` and no `credential`, and `decode` refuses it as not a link** (requirement
11), which is the one migration this effort has.

**What is sealed, and under what.** The payload is JSON, `{ credential, vaultPassword? }`:
the issuer's own grant on the organization database, read from the session's
`organization_credential` slot, and on an invitation or a reset the generated vault password
that `invite::issue` draws today. It is sealed with `vault::seal_under_member_key` under the
key `derive_member_key(code, code_salt(secret), SHIPPING_KDF)`, which is the derivation
`invite::seal_under_code` already runs, with the half's kind, id and `expiresAt` bound as
associated data so a rewritten expiry opens nothing, the property `code_context` gives the row
today. The credential inside lapses when the issuer's grant does, four weeks at most
(requirement 2); `setup::credential_expiry` reads that moment off the token, and the link's
`expiresAt` is the earlier of seven days and that moment, so a link never outlives what it
carries and the panel says the true date.

**The code lives as long as the link, one code per link.** *Chosen by the human on 2026-09-15
over ninety seconds with a fresh code being a fresh link.* Nothing reads a row before the
credential is out, so the seal has to ride in the link's text, and a fresh code would be a
fresh text to re-send. The clock never bounded an attacker, since a credential once unsealed is
held and the barrier is the derivation (`invite.rs`, *the barrier is the derivation and not the
clock*); what it bounded was the honest person. So `invitation.code_seal` and
`invitation.code_expires_at` leave the row, `invite::invitation_code` and its command, router
procedure, hook, panel control and countdown are retired, and `invitation.sealed_secret`, the
issuer's copy, holds three parts, password, secret and code, so `invitation_link` rebuilds the
identical link and answers the code beside it. A pending row's copy link shows the same pair to
its issuer; anybody else with the act issues a new link, which is a reset, as today.

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **A. One sealed payload in the link, one code per link** (chosen) | the credential is never legible in any link; one derivation, one AAD, one seal for credential and vault password; the row loses two columns and one command | the link text is longer; a code read out and written down lives seven days beside a link that is elsewhere | the same 32^6 at Argon2id the invitation accepts today, now guarding the directory | one code path for three kinds of link |
| B. Clear credential, minted short-lived | no code on the way in; the smallest change | only the owner's machine mints, so an administrator's invitation and a member's second machine cannot make one; fails requirement 1 | a link leaks the directory for its whole life | none |
| C. Sealed credential in the link and a ninety-second code in the row | keeps the countdown the human tested | two codes, or one code that changes the link text every ninety seconds and forces a re-send; a second machine has to be reached inside ninety seconds | the honest flow fails often; the attacker's bound is unchanged | two seals to keep in step |
| D. Credential fetched from the row after the code | the link stays short | circular: nothing reads the row without the credential | none, because it cannot be built | none |

**Reaching before the code is gone, so reading a link is a decode.** `organization_link_inspect`
reached the organization with the link's clear credential and judged the invitation's standing
before the person had typed anything. It becomes `organization_link_read(link) -> LinkShape {
organizationId, organizationName, kind: organization | invitation | machine, expiresAt? }`, a
pure decode with no network, and the standing is judged inside the act that takes the code.
`join::inspect`, `LinkFacts`, `LinkStanding` and `InvitedFacts` go with it; the four
standings survive as the refusal sentences `invitation_refused` already writes.

**The act that takes the code does everything, in this order.** Unseal the payload with the
code, refusing a missing or wrong code by name with the sentences `join.rs` already carries
(`CODE_MISSING`, `CODE_REFUSED`; `CODE_LAPSED` retires with the clock, and a link past its
`expiresAt` is refused as a lapsed link before any key is derived); reach the organization with
the unsealed credential through `command::reached`, which takes the credential rather than
reading it off the link; record the organization on this machine through `connect::connect`
where it holds none, so a consumed link still lands a person at the wall as today; then judge
the row and act. `invitation_accept(link, code, password)` keeps its signature and, past the
unseal, runs exactly what `join::accept` runs today with the vault password from the payload
rather than from the row. `organization_connect(link)` stays for the clear-credential link
alone and refuses a sealed one with a sentence saying it needs a code.

## A second machine is a link with an unsigned row behind it (requirement 3)

`machine_link` is the organization database's eighth table:

```
machine_link (id TEXT PRIMARY KEY NOT NULL, member_id TEXT NOT NULL,
              expires_at INTEGER NOT NULL, consumed_at INTEGER, created_at INTEGER NOT NULL)
```

**It is unsigned, and that is the accepted limit, not an oversight.** A plain member holds no
certificate and signs nothing (826, requirement 6), and this is the one row a plain member
writes on their own account. It is written under the member's own organization credential the
way `member.session_epoch` already is (`store::set_session_epoch`), which is the precedent: a
column outside the chain that gates availability and never authority. What a rewritten row
buys is opening a consumed or lapsed machine link on one more machine, which lands at the wall,
where the password is still what admits; the credential inside the link is the member's own,
which their vault already yields. *Rejected: a signed row, which a plain member cannot write;
no row, which drops the single use requirement 3 names; and a machine link that only the owner
or an administrator makes, which the human chose against.*

`machine::make(store, session, kdf, now) -> MachineLink { link, code, expiresAt }` draws a
secret and a code, deletes the member's earlier open rows so one stands at a time, writes the
row for seven days or until the session's organization credential lapses, whichever is sooner,
and builds the link with the session's credential and no vault password in the payload. No
issuer copy is kept: the you section shows the pair once and making another is one press.

`machine::connect(store, machine, link, code, now)` refuses while an organization is held
(`connect::refuse_while_held`), unseals, reaches, reads the row and refuses a lapsed, consumed
or missing one naming which, records the organization through `connect::connect` with no
member, marks the row consumed, and pushes. The wall follows, and the sign-in fills the
credential slot from the vault as `sign_in_by_username` does today; the link's credential is
used for the one pull and held nowhere.

## The connect screen judges after the code (requirements 1, 3)

`organization/connect.ts` reorders its steps around the decode. `paste` → `reading` (the
decode; `unreadable` on refusal, no network) → by kind: an `organization` link runs the connect
and leaves for the wall, unchanged; an `invitation` link enters the `password` step straight
from the decode, with the organization's name from the link, the code field it already draws
and the two password fields, and the accept judges; a `machine` link enters a `code` step with
the code field alone and `machine_connect` judges. A refusal from either act, lapsed, consumed,
revoked or another organization, lands on the `refused` step the screen already draws, keyed
off the Rust code as `joinFailed` keys it today; `inspectionFailed` narrows to the decode and
the network. `linkKind` reads the shape, not a standing. The `connect-screen.svelte` steps
follow, and the component test drives every step with both new kinds of link.

## The you section states facts and writes on the form surface (requirements 3, 8)

**The password.** `settings/component/area.svelte` draws, under the password legend, one
`Field.Field` row: the existing description and an outline `change password` button. The
button opens `organization/component/change-password-dialog.svelte`, a `FormSurface` of
`light` weight whose body is the three fields and the floor sentence
`change-password-form.svelte` draws now; the form component becomes that dialog's body and
`change-password.svelte.test.ts` follows it. A change that went through closes the surface
and empties it; a refusal keeps it open with the shared handler's sentence, the shape
`invite-form.svelte` already has.

**Another machine.** `organization/component/another-machine.svelte` under a legend of its
own after the other-machines block: a description and an outline button. Pressing runs
`useMakeMachineLink`, and the pair is shown in a `FormSurface` of `light` weight with a `done`
control, through a block shared with the invite result: `organization/component/link-handover.svelte`,
extracted from the result panel `invite-form.svelte` draws today, taking the organization
name, the link, the code, the expiry and the unreachable list, with `copied` and `onCopy` from
its host so the clipboard stays the host's. The code is drawn large with no copy control and
no countdown; the sentence beside it says the link and the code are both needed and that the
code is read out, never sent. Nothing is stored for a copy later; a person who lost the pair
presses again.

## Members and workspaces rows carry one visible control (requirements 6, 7)

**One control per row, at its end, opening the row's acts in four groups.** The hover cluster
goes. In its place each row draws an outline `icon-sm` button with the ellipsis glyph, labelled
in the tooltip and to a screen reader, opening a `DropdownMenu` whose items are the row's acts
in the four groups requirement 6 names, separated by `DropdownMenu.Separator`, with the
destructive acts at the foot as `variant="destructive"` items. This is the record card's own
visible route ([[rules/interface]], *Record card actions*) for a row that has no page to open,
so the trigger is the control and the row itself opens nothing (*Row activation*). It is a new
package block, `packages/design/src/lib/block/row-actions.svelte`, taking a label and
`groups: RecordCardAction[][]` over the type `record-card.svelte` already exports, so a card
and a row offer an action looking the same; it reaches nothing but the design system, which is
what puts it in the package ([[rules/frontend]]). An act the session lacks is absent from the
menu, as it is absent from the cluster today, and every gate keeps its prop.

**The section head says what the section is for.** Above the list, one row: the legend and a
`Field.Description` sentence on the start side, and the section's primary on the end side,
`invite` for a holder of `inviteMember` and `new workspace` for the owner holding the
authority, with the authority refusal sentence standing where the button would for an owner
who lost it. The list follows, and in the workspaces section the transfer stays beneath under
the open workspace's name.

**Judged on the real organization before it is accepted.** The ticket that builds the members
section runs the application against the human's organization from the run's worktree, and the
human looks at it before the ticket is resolved; the workspaces section is built on the same
block and checked the same way.

*Rejected: keeping the hover cluster and adding a visible toggle, which is two routes to the
same acts; a sheet per member, which is a second surface to build and test for acts that are
each one dialog already; every act as a labelled button on the row, which is the wall of
controls the prototype of the settings area withdrew.*

## The two menus (requirements 9, 10)

`layout/component/workspace-menu.svelte` loses `canInvite`, `canCreateWorkspace` and
`refusal`, the side-by-side pair and the create row; it keeps the header, the radio group of
workspaces and one full-width row to the workspaces section at the foot.
`layout/component/sidebar.svelte` stops composing the two refusal sentences, and the strings
`workspaceMenu.invite`, `workspaceMenu.inviteRefused` and `workspaceMenu.workspaceRefusedOwner`
retire in both locales; `workspaceMenu.workspaceRefusedAuthority` and `workspaceMenu.create`
stay, since the workspaces section reads them. `account-menu.svelte` and
`account-signed-out.svelte` put `capitalize` on the sign-out and sign-in spans, the class the
settings span carries.

## Every connected machine is registered (requirement 15)

`machine` is the organization database's ninth table, unsigned like `machine_link` and for the
same reason: every machine writes its own row, and a plain member signs nothing.

```
machine (id TEXT PRIMARY KEY NOT NULL, member_id TEXT, seen_at INTEGER NOT NULL,
         created_at INTEGER NOT NULL)
```

A machine's own id is drawn once and kept in the local organization record
(`HeldOrganization.machine_id`); a record written before this field exists is given one at its
next launch, which is also when the row is first written. The writers are the acts that already
exist: `connect::connect` writes the row with no member; the sign-in names the member and the
sign-out clears it; `organization_state_get`, which every launch runs, refreshes `seen_at` and
writes the row where it is missing; `disconnect` deletes the row before forgetting locally. Each
write pushes. `store::connected_machines(now) -> Vec<(MachineRecord, Option<MemberRecord>)>`
answers the rows seen inside `MACHINE_PRESENCE_WINDOW`, seven days, joined to the member rows so
the caller can read a role; it is the registry's only reader and requirement 14's gate is its only
caller. *Rejected: a signed row, which a plain member cannot write; a row per session rather than
per machine, which the epoch already covers; and a registry the settings area lists, which the
spec puts out of scope.*

## The account connects to the organization the group holds (requirement 14)

The walk today consents and then creates in one command. It splits at the consent: after the
consent `organization_group_inspect() -> GroupState { kind: empty | held, organizationId? }` reads
the listing through `discovery::organization` and recognises `org-<id>` as `setup.rs` already
does; on `empty` the walk goes to the name step and creates as today; on `held` it goes to a new
`existing` step, one sentence saying the group already holds an organization and that its owner
signs in to connect this machine, with the username and the password fields, and runs
`organization_connect_existing(username, password) -> OrganizationState`.

That command, `setup::connect_existing`, does everything in this order. It mints a full-access
four-week credential for `org-<id>` on the consent, opens a replica at the listing's hostname with
it and pulls. It reads the registry (`store::connected_machines`) and, where any row inside the
window belongs to a member whose row carries the owner's or an administrator's role, refuses with
`PreconditionFailed` naming that a connected machine can hand out a link, lets the consent go
through `abandon_the_consent` as requirement 21's refusal does, and drops the replica. Otherwise
it reads the member rows **unverified**, through a read that exists for this one caller and says
so, finds the row whose sealed username matches and whose vault the password opens, and derives
the organization key from that vault's secret (`derive_seed(ORGANIZATION_KEY_PURPOSE)`, the
derivation `create_organization` runs). **That derived key is the trust anchor**: its public half
is compared with the organization row's `verifying_key` and every member row is verified against
it; a mismatch means the password was not the owner's, and the command refuses with `Forbidden`
naming that only the owner connects this way and leaves the machine holding nothing. Past that it
opens the organization's name from `name_sealed` through the content key, writes
`HeldOrganization` with a fresh `machine_id`, registers the machine, opens the session as
`sign_in_by_username` does (which fills the credential slot from the owner's grant), and runs
`workspace::renew_credentials` so every grant, the owner's included, is fresh and the slot holds
a live one; then it pushes. The authority stays in the keyring as after a create.

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **A. The password is the anchor; connect and sign in are one act** (chosen) | nothing read out of the database is trusted before the owner's key verifies it; the name is known before the record is written; only the owner can, by construction | the wall's order is inverted for this one path, and a second unverified read exists | an unverified read that leaks into another caller; the docstring and the test that pins its one caller guard it | one command, one step in the walk |
| B. Trust the row's `verifying_key` | no unverified read | compares the database against itself, which `authority.rs` refuses on purpose; an administrator could connect by the account | the design's one prohibition | none |
| C. Ask the owner to type the organization's name and pin it | a name before sign-in | the name proves nothing and the owner may not remember it | a mismatch with no way to say why | none |

## The way in is an account or a link and a code (requirements 13, 17)

The first screen's no-organization state (`layout/component/startup-sign-in.svelte`) keeps its two
controls and gives each a sentence: the account, for whoever owns the organization, new or already
there; the link and the code, what an administrator or a member handed over. The strings under
`layout.signIn` change; nothing names a group, a database or a consent. The walk's
`oneOrganization` statement, which says a held group is refused, says instead that a held group is
connected to.

The connect screen's `paste` step gains the code field beside the link field, and `reading` takes
both. `afterRead` runs the machine connect at once for a machine link, with the code it holds, and
enters the `password` step for an invitation with the code already held, so that step is the two
password fields alone. The `code` step ticket 05 added goes. A decode refusal marks the link field
and a wrong code marks the code field, both on the paste step, through the `refused`,
`forbidden` and `invalidInput` reads `joinFailed` already makes; a lapsed, consumed, revoked or
replaced link lands on the `refused` step as today.

## The organization's own link retires (requirement 16)

Every reader of the never-expiring credential is one of two functions, and both throw it away
(the research file, finding 6). So: `LINK_CREDENTIAL_LIFETIME` and the second mint in
`setup::finish` go; `link_credential_sealed` leaves the schema, the record, the insert and the
select (a replica still carrying the column opens, since the write names its columns);
`JoinLink` loses `Credential::Clear`, its `credential` becomes the sealed payload and its `half`
is required, so `decode` refuses a link with no half as not a link; `invite::organization_link`
becomes `invite::locator`, four clear fields, which the invitation, the reset and the machine link
seal a payload onto; `connect::connect` takes the locator and the credential its caller unsealed,
which the accept and the machine connect already hand it; `connect::refuse_sealed` and
`CODE_NEEDED`, `organization_connect` and `organization_own_link` with their router procedures
and `useOrganizationLink`, `LinkKind::Organization`, `organization-link.svelte` and the sync
section's link block with its strings all go. The credentials rule, the organization context's
*Link* entry and 826's requirement 10 carry a second dated correction, and ticket 06's changeset
sentence about the recovery copy is rewritten.

## The owner deletes the organization (requirement 18)

`platform::DeletionIntent` gains `OrganizationDeletedByHuman`, the third reason the Turso
reference's *Never run* admits, and the reference says so. `removal::delete_organization(store,
session, platform, password)` is the owner's alone: it re-opens the owner's vault with the
password (a wrong one refuses before anything is touched), lists the workspaces from the replica,
deletes each workspace database and then the organization database through `delete_database`
with the new intent (protection lifted per database as the port already does), then forgets the
organization on this machine the way `disconnect` does and lets the consent go, since the group
is empty again. Every other machine holding it meets, at its next launch, a pull refused because
the database no longer exists; `forget` gains a sign for that answer, `OrganizationDeleted`, and
forgets the organization the way the old-shape signs do, landing on the first screen. The
settings area draws the control in the sync section's authority block, for the owner alone, and
the confirmation is a `FormSurface` of `heavy` weight naming what goes and taking the password.
*Rejected: deleting only the organization database and leaving the workspaces, which strands
ledgers on the owner's account; and a delete that keeps the consent, which leaves an authority
with nothing to govern.*

## A link admits a machine to an account (requirements 19, 20)

Today an invitation makes the account and the link in one act (`invite::issue`), a reset makes
a fresh invitation for an existing account, and a second-machine link is the member's own act
(`machine::make`). They become one account and one link act. **Making an account**,
`invite::create_account(session, username, role, permissions, workspaces)`, is `issue` up to
the row: the generated vault password, `must_change_password` set, the certificate where the
role needs one, no link and no invitation row. **Making a link**, `link::make_for(session, store,
member_id, kdf, now) -> MadeLink { link, code, expires_at }`, is offered to a holder of
`inviteMember` and refuses with `PreconditionFailed` where the register shows a machine signed
in on the account inside the window; it chooses the kind by the account's standing: an account
whose password is not yet set gets today's invitation-kind link (the vault password in the
payload, an `invitation` row behind it, single use, seven days) and an account with a password
gets today's machine-kind link (no vault password, a `machine_link` row). Nothing on the
onboarding changes: the connect screen already asks a password for the first kind and lands the
second at the wall. **Resetting a password**, `invite::unset_password(session, member_id)`, is
today's reset without the link: a fresh generated vault password sealed and `must_change_password`
set; the card then offers a link. The self-service act goes: `machine::make`,
`machine_link_make`, `machine.link`, `useMakeMachineLink` and `another-machine.svelte`, while
`machine::connect` and the `machine_link` table stay as the second kind's spending. The
invite form's result panel, the handover block, is what the card's link act shows.

*Rejected: keeping three acts, which is three places to explain one link; and offering a link
on an account with a machine signed in, which the human ruled out.*

## The directories (requirements 19, 21)

`members.svelte` and `workspaces.svelte` draw the record cards the complex directory draws
(`complex/component/directory.svelte` over `design/block/record-card.svelte`), one per account
or workspace, with the card's `actions` carrying the acts and its `href` opening the record's
edit surface in the section (`?section=members&account=<id>`), so activating a card is opening
its record ([[rules/interface]], *Row activation*). A card's content: for an account the
username, the role, the workspaces held and one line of standing (password not yet set, no
machine signed in, a machine signed in) read from the members query joined to the register; for a
workspace the name, the open marker, this reader's access and how many hold it. The foot carries
the section's one primary, add an account or new workspace, on the form surface. The owner's
card: removed by nobody, edited by nobody but the owner, its menu for an administrator empty and
so not drawn. `packages/design/src/lib/block/row-actions.svelte`, built for ticket 07's rows,
loses its only consumer and goes with its test. The strings of 07 that name rows go too.

## Ownership is transferred (requirement 22)

The organization's signing seed is derived from the founder's vault secret and stored nowhere.
A transfer seals it: `role::transfer_ownership(session, store, member_id, password)` re-opens the
owner's vault with the password, obtains the seed (derived for the founder, unsealed for a
transferee), seals it to the new owner's public key into a nullable column of the member row,
`owner_seed_sealed`, and swaps the roles, the new owner's row `owner` and the old owner's
`administrator` with a certificate, both signed by the key that has not changed. **The signed
preimage of a row whose column is null is unchanged**, so every existing row still verifies; a
row carrying the seal folds it into its preimage. Everything that today derives the owner's key
from the vault (`sign_in`'s owner path, `connect_existing`) reads the seal first and derives
only where there is none. The Turso authority stays in the founder's keyring: the sync section's
authority block on a new owner's machine says the authority follows the account that consented
and offers the reconnect that exists for an owner restored on a new machine (826).

*Rejected: re-deriving a new key from the new owner's password and re-signing every row, which
rewrites the whole directory for one act; and moving the Turso account, which the application
cannot do.*

# Interfaces

Rust commands, in `tauri/src/organization/command.rs`, registered in `lib.rs`:

| Command | Change |
| --- | --- |
| `organization_link_read(link) -> LinkShape` | replaces `organization_link_inspect`; a decode, no network |
| `organization_connect(link) -> OrganizationState` | clear-credential links only; refuses a sealed one by name |
| `invitation_accept(link, code, password) -> OrganizationState` | unchanged signature; connects where nothing is held, then judges |
| `invitation_link(invitation_id) -> InvitationLink { joinLink, code }` | answers the code beside the link |
| `invitation_code` | removed |
| `machine_link_make() -> MachineLink { link, code, expiresAt }` | new, any member |
| `machine_connect(link, code) -> OrganizationState` | new, public |
| `member_invite`, `member_reset` | `Invited` loses `codeExpiresAt`; `expiresAt` is the link's |
| `organization_group_inspect() -> GroupState` | new, public, after the consent |
| `organization_connect_existing(username, password) -> OrganizationState` | new, public |
| `organization_delete(password)` | new, owner |
| `organization_connect`, `organization_own_link` | removed with the organization link |
| `organization_state_get`, `organization_sign_in`, `organization_sign_out`, `organization_disconnect` | write the machine registry |
| `member_create(username, role, permissions, workspaces) -> Member` | new, `inviteMember`; replaces `member_invite` |
| `member_link_make(member_id) -> MadeLink` | new, `inviteMember`; the one link act |
| `member_password_unset(member_id)` | replaces `member_reset`; `resetPassword` |
| `machine_link_make` | removed |
| `member_transfer_ownership(member_id, password)` | new, owner |

`platform/host.ts` and `platform/tauri.ts` carry `LinkShape`, `InvitationLink`, `MachineLink`
and the narrowed `Invited`; `LinkFacts` and `LinkStanding` go. `organization/router.ts` drops
`invitation.code`, widens `invitation.link`, and adds `machine.link` under `procedure.member`
and `machine.connect` under `procedure.public`; `organization/query.ts` drops
`useInvitationCode` and adds `useMakeMachineLink`. `organization/dialogs.svelte.ts`'s
`InvitedLink` carries `code: string` and `expiresAt`, never a null code, since a copy shows
it. `routes/settings/+page.svelte` loses `codeFor`, `freshCode` and `useInvitationCode`, and
`settings/component/area.svelte` and `members.svelte` lose `onFreshCode` and `codeFor`.

# Data Model

- The link text, as the first section spells it.
- `invitation` loses `code_seal` and `code_expires_at`; `sealed_secret` holds three parts under
  the separator `issuer_copy` uses, which the code alphabet and the password alphabet both
  exclude.
- `machine_link`, the eighth table, in `store::TABLES` and `SCHEMA`; the seven-tables test
  becomes eight.
- Nothing under a signature changes; `invitation.v2`'s preimage is untouched.
- *Added 2026-09-15.* `machine`, the ninth table, unsigned, in `store::TABLES` and `SCHEMA`;
  the eight-tables test becomes nine. `organization` loses `link_credential_sealed`.
  `HeldOrganization` gains `machine_id`, drawn at connect and at the next launch of a record
  that has none. `DeletionIntent` gains `OrganizationDeletedByHuman`.
- *Added 2026-09-16.* `member` gains `owner_seed_sealed`, nullable, in the signed preimage only
  where present; a member's standing is read, never stored.

# Technical Approach

1. **The two menus first.** Casing and the narrowed workspace menu are two small commits with
   no dependency, and they are what the human sees first when they launch.
2. **The link's shape, in Rust.** `link.rs`, `invite::issue` and its two callers,
   `invitation_link`, `join::accept`, `command::reached`, the read command replacing the
   inspect, and the retirement of the code refresh; the boundary (`host.ts`, `tauri.ts`,
   `router.ts`, `query.ts`, `dialogs.svelte.ts`) rides in the same ticket because nothing
   compiles across it otherwise. The credentials rule, the organization context and 826's
   corrections ride here too, since this is the commit that changes what they describe, and
   so does the changeset.
3. **The machine link, in Rust**, on top of 2: the table, `machine::make`, `machine::connect`,
   the two commands and their boundary.
4. **The connect screen**, on top of 3, since it draws the machine kind.
5. **The handover block and the you section**, on top of 3: the block extracted from the
   invite result, the password dialog, the another-machine block.
6. **The members section**, on top of 2, since the pending row's acts change: the row-actions
   block lands here, then the section head and rows, judged on the real organization.
7. **The workspaces section**, on top of 6, on the same block.
8. *Added 2026-09-15.* **The registry**, in Rust: the table, the local record's id, the writers
   in the four acts, the reader and the window.
9. **The account connects to the held organization**, on top of 8: the inspect, the connect,
   the walk's step.
10. **The way in**: the first screen's sentences and the connect screen as one form, on top of
    ticket 05, independent of 8 and 9.
11. **The organization's own link retires**, on top of 9 and 10, since both stop needing it.
12. **The owner deletes the organization**, on top of 11, since both edit the sync section.
13. *Added 2026-09-16.* **A link admits a machine to an account**, in Rust and the boundary, on
    top of 12, since both touch the commands and the you section.
14. **The members directory**, on top of 13; then **the workspaces directory** on the same
    shape; then **the transfer**, on top of the members directory, which is where its act lives.

# Migration

Nothing is published. A link in the previous shape is refused by `decode` with the sentence a
non-link gets; a pending invitation at upgrade holds a `code_seal` no new link opens and is
reissued from its row. A replica with the two dropped columns still opens: `write_invitation`
names its columns and both were nullable, and `machine_link` is created on open by
`CREATE TABLE IF NOT EXISTS` like every other table. `forget::old_shape` gains no variant.
*Added 2026-09-15:* `machine` is created on open the same way; a local record with no
`machine_id` is given one at its next launch; a replica still carrying
`link_credential_sealed` opens, since every write names its columns; `forget` gains one sign,
the organization database gone on the platform, which is a fact about the remote and not a
shape.

# Testing Strategy

| Criterion | Checked by |
| --- | --- |
| 1 | `link.rs`: the fields test asserts a clear credential on the organization link and no clear token in an invitation or machine link's text, and that the sealed field is not a Turso token by shape; `join.rs` and `machine.rs`: accept and connect with the right code reach the organization, and a wrong, a lapsed-link and a missing code are refused with `CODE_REFUSED`, the lapsed-link sentence and `CODE_MISSING`; `connect-screen.svelte.test.ts` finds the code field on an invitation and a machine link and none on an organization link |
| 2 | `invite.rs` and `machine.rs`: the payload's credential is the session's, and `credential_expiry` of it is within four weeks of `now`, on an invitation, a reset and a machine link |
| 3 | `area.svelte.test.ts` finds the another-machine control; `machine.rs`: make, connect on a second store with the code, the record holds the organization and no member, `sign_in_by_username` admits with the unchanged password, a second connect is refused as consumed, a connect past seven days as lapsed, and a wrong code by `CODE_REFUSED` |
| 4 | `area.svelte.test.ts` with an owner finds the link block and the recovery sentence, with an administrator finds neither; `connect.rs`: `organization_connect` with the clear link records the organization and no code is asked |
| 5 | read: the two paragraphs, and 826's requirement 10, requirement 23 and *Link* entry carry a dated correction |
| 6 | `members.svelte.test.ts`: the sentence, the invite control before the first row, and for each act the row-actions trigger opened and the item present or absent per gate, with an administrator session and a member session |
| 7 | `workspaces.svelte.test.ts`: the same, plus the create control for an owner holding the authority, the refusal for one who does not, and the transfer legend under the list |
| 8 | `area.svelte.test.ts`: no `input[type=password]` until the change control is pressed, then the form surface with three and the floor sentence; the another-machine control opens a surface with one copy control and a code element with no copy control |
| 9 | `workspace-menu.svelte.test.ts`: header, radio rows with the open one checked, one workspaces row, and no invite, create or refusal element |
| 10 | `account-menu.svelte.test.ts`, signed in and out: the sign-in and sign-out spans carry `capitalize`; `i18n/tests/organization.test.ts`: both strings lowercase in both locales |
| 11 | `link.rs`: a hand-written previous-shape link is refused with `InvalidInput` and the non-link sentence |
| 12 | the integration gate; the Arabic locale test; `.changeset/` on the branch |
| 13 | `startup-sign-in.svelte.test.ts` (or the layout test that renders the no-organization state): two controls, their two sentences, and no group, database or consent named |
| 14 | `setup.rs`: over the in-memory platform holding a listing with `org-<id>`, `connect_existing` with the owner's password lands the machine holding the organization, signed in, every grant fresh; an administrator's password refused as `Forbidden` with nothing held; a registry row of an owner's machine six days old refused as `PreconditionFailed`; an empty listing still creates. `setup.test.ts` and the walk's test: `held` reaches the `existing` step, `empty` the name step |
| 15 | `store.rs` and `connect.rs`: the row after connect, sign-in, sign-out and disconnect; `connected_machines` at six and eight days; no signer on any of the four writes |
| 16 | `grep` over the Rust source for `LINK_CREDENTIAL_LIFETIME`, `link_credential_sealed`, `Credential::Clear` and `"never"` finds nothing; `link.rs`: a text with no half is refused; `area.svelte.test.ts`: no link block for the owner; `connect-screen.svelte.test.ts`: no code-free path; read: the two corrections |
| 17 | `connect-screen.svelte.test.ts`: link and code fields on the first step; an invitation then the two password fields; a machine link connects with no further field; an unreadable link marks the link field and a wrong code the code field |
| 19 | `members.svelte.test.ts`: one card per account with its standing, the add control at the foot, each act on the menu by its gate, the owner's card empty for an administrator; `invite.rs`: an account made with no password refused at the wall until its link is opened |
| 20 | `link.rs` or `invite.rs`: the first kind opens with a chosen password and lands signed in, the second lands at the wall, an account with a machine signed in is refused, a reset unsets and the next link asks a password, single use and seven days; `connect-screen.svelte.test.ts`: the choose-password fields for the first kind, the wall for the second; `area.svelte.test.ts`: no link act in the you section |
| 21 | `workspaces.svelte.test.ts`: one card per workspace with its facts, the create control or the refusal at the foot, the three acts by their gates, the transfer beneath |
| 22 | `role.rs`: the transfer swaps the roles, every row still verifies against the unchanged key, the new owner connects a fresh machine with the account by the sealed seed, an administrator is refused; `area.svelte.test.ts`: the authority sentence for a new owner holding none |
| 18 | `removal.rs`: every workspace database and the organization database deleted with `OrganizationDeletedByHuman`, the machine holding nothing after, an administrator refused, a wrong password refused before any delete; `forget.rs`: a machine whose pull says the database is gone forgets at launch; `area.svelte.test.ts`: the control for the owner and not for an administrator, the confirmation on the form surface |

# Operational Considerations

- **The organization's own link is the owner's recovery copy and nothing else now.** The
  sync section says so beside it. An owner with every machine gone connects with it and
  signs in; the walk is unchanged.
- **A link's life is the shorter of seven days and its credential's.** The panel prints the
  date, so an invitation made by an administrator whose grant renews in three days says three
  days, and the owner's machine renewing grants is what lengthens the next one.
- **A second machine is connected by the member alone.** Nobody else can make the pair, and a
  member who lost every machine asks for a reset, which is the path that already exists.

# Technical Risks

- *Added 2026-09-15.* **The unverified read.** `connect_existing` reads member rows before any
  key can verify them; the read is a function with one caller, its docstring says why, and a
  test pins that nothing else calls it. What it yields is used only to find a vault the
  password opens, and the key that vault derives is what verifies everything after.
- **What a deleted database answers.** Whether libsql reports a database deleted on the platform
  as a refusal the shell can tell from a network fault has not been run here; the delete ticket
  establishes it and keys `forget`'s new sign on it, or records that it cannot and says what a
  machine meets instead.
- *Added 2026-09-16.* **The signed preimage with an optional column.** A row without the seal
  must hash exactly as before; the test that verifies every row after a transfer, and one that
  verifies a row written before the column, are what guard it.
- **The listing's loose prefix.** `org-chart` in the owner's group reads as an organization
  database today and would be offered for connection; the connect then fails to find the rows
  and refuses, which is the same outcome the create's refusal gives, and no better.

- **The serde shape of `credential`.** An externally tagged enum serialises as
  `{"clear": "..."}` or `{"sealed": "..."}`, which is what the plan spells; the fields test
  pins both texts so a derive attribute cannot drift them.
- **The unsigned table.** A reviewer meeting `machine_link` with no signature reads it as a
  gap; the docstring on the table and the paragraph in the organization context say why it is
  the epoch's shape, and a test writes a rewritten row and shows it lands at the wall.
- **Dropdown menus under vitest.** The row-actions block is opened in tests the way
  `record-card`'s own test opens its menu; if the portal misbehaves under jsdom the block's
  test opens it through the primitive's `open` prop rather than a click.
- **The extracted handover block** has two hosts with different clipboard handlers; keeping
  `copied` and `onCopy` as props rather than reading the clipboard inside is what keeps the
  invite form's test renderable without one.
