---
use-when: "building a ticket in this effort and the approach is not obvious from the spec"
---

# Architecture

The spec is [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]];
requirements and criteria are referenced by number and never restated here. Every path is
relative to `apps/desktop/` unless written out. The evidence behind the link decisions is
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/evidence/research/what-a-link-exposes-and-what-a-code-can-bound]].

**Three seams, and the model's lands first.** What a link's text carries and what unseals it;
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

# Migration

Nothing is published. A link in the previous shape is refused by `decode` with the sentence a
non-link gets; a pending invitation at upgrade holds a `code_seal` no new link opens and is
reissued from its row. A replica with the two dropped columns still opens: `write_invitation`
names its columns and both were nullable, and `machine_link` is created on open by
`CREATE TABLE IF NOT EXISTS` like every other table. `forget::old_shape` gains no variant.

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
