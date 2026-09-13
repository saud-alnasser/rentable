---
use-when: "building a ticket in this effort and the approach is not obvious from the spec"
---

# Architecture

The spec is [[efforts/826-the-organization-and-the-way-in-are-rethought/spec]]; requirements
and criteria are referenced by number and never restated here. Every path below is relative to
`apps/desktop/` unless written out.

**The model changes land first and the screens second, and the model changes are four,
each cutting one seam 819 built.** Four alternatives were put to the human on 2026-09-13 and
the choices are recorded with what lost.

## The invitation link carries the generated password as its secret (requirements 8, 9)

`JoinLink` regains 819's optional invitation half, `invitation: { id, secret }`, and `secret`
is the 23-character password `invite::generate_password` already draws. Nothing in
`organization/vault.rs` changes: the vault is built with `create_vault_with_secret(secret,
SHIPPING_KDF)` exactly as today, and accepting the link opens it with `open_vault(secret,
&vault)` and reseals it with `reseal_vault(&secret_key, chosen_password, SHIPPING_KDF)`, the
path `password::change_password` already takes. The password is never shown and never
crosses on its own; it crosses once, inside the opaque link string `Invited.join_link`, which
[[rules/credentials]] already sanctions crossing.

*Rejected: a 32-byte secret with a key derived by HKDF and no Argon2. It matches the spec's
wording more literally and costs a second vault construction: `KdfParams` would need a
sentinel the AAD binds, `MemberKey` a public constructor, and the fixed vectors at
`vault.rs:1148` a second set. The property is identical, since a 23-character password from a
32-symbol alphabet is 115 bits of entropy, so the cheaper construction wins.*

**The issuer can copy the link again; nobody else can.** The `invitation` row gains
`sealed_secret`, the secret sealed with `seal_to_public_key` to the issuer's public key, and
`issued_by`, the issuer's member id. `invitation_link(invitation_id)` unseals it with the
session's secret key and rebuilds the link; for anybody else the row offers only "new link",
which is a reset. *Why not seal it under the content key: every member holds that key, and a
member who opened a pending colleague's vault would hold that colleague's grants, which may
reach workspaces the member does not.* Neither column is under the invitation signature,
whose preimage stays `...invitation.v2` over `{ id, member_id, expires_at }`: a tampered
`sealed_secret` fails to open for the issuer and opens for nobody, and a tampered `issued_by`
only misplaces a copy control.

**Revoking a pending account is an ordinary removal.** `invitation_revoke` on a member who has
never accepted deletes the invitation row and then writes the member row `removed` with its
grants deleted, through `removal::remove_member`'s ordinary path, so a link somebody kept opens
a vault that holds nothing. Revoking a reset link on an active member deletes the row only; the
member's vault is the reset one and opens on nothing until another reset, which the dialog
says.

**A reset is `reissue_invitation` with one correction.** `issue` takes the permissions to
write rather than deriving them from the role, so a reset keeps a widened member widened
(requirement 6). Everything else stays: the fresh vault, the re-sealed grants over what the
issuer reaches, the unreachable list.

## A remembered session is the derived member key in the keyring (requirement 12)

`derive_member_key` produces the 32-byte Argon2id output that `open_sealed_secret_key`
turns into the X25519 secret; that function is `pub(crate)` and the seam is one visibility
level down. After every successful `sign_in_by_username`, `invitation_accept` and
`change_password`, Rust files the member key in the OS credential store under service
`rentable.member-key` and account `<organization id>:<member id>`, base64url. The first
`organization_state_get` of a launch, inside the `old_shape_check` cell after the old-shape
check, reads the record's `member_id`, reads that entry, opens the vault with it, and fills the
`member` slot through `session::open_session`; any failure at any step forgets the entry and
leaves the wall up. `sign_out` and `forget` delete the entry. A keyring that refuses to store
is a diagnostic, never a failure: the person signs in again next launch.

*Why the member key and not the X25519 secret: the AAD on `sealed_secret_key` binds the salt
and the cost, so the entry stops opening anything the moment the vault is resealed by anyone,
a reset elsewhere included, with no comparison to write. The price is that the member's own
password change rewrites the entry, which `change_password` does in the same call. Rejected:
the secret key, which survives a password change and holds the long-term secret rather than
the key that opens it; and a session file, which [[rules/credentials]] forbids.*

**The keyring becomes one module.** `tauri/src/keyring.rs` holds `store(service, account,
value)`, `read`, `forget`, the `#[cfg(test)]` static keyed by `(service, account)` and the
`take_the_credential_store` turn lock, all lifted from `sync/turso/consent.rs`, whose three
functions become callers. One fake for two entries rather than two statics.

## Certification stays the owner's (requirements 4, 6, 7)

The permission table becomes the seven acts of requirement 4, in `packages/workspace-permission/index.ts`
and `organization/permission.rs` together (the Rust test reads the TypeScript as text and pins
three literal lines, `permission.rs:143`): `inviteMember 0`, `removeMember 1`, `changeRole 2`,
`renameWorkspace 3`, `resetPassword 4`, `renameMember 5`, `grantWorkspace 6`. Bits 4 and 5
change meaning; that is safe because nothing is published and requirement 19 forgets every
organization written under the old table. `mask_of_role` gives the owner and the administrator
every act and the member none; `OWNER_PERMISSIONS` in `setup.rs` follows.

Six of the seven acts sign a row; `renameWorkspace` writes the sealed name outside the
signature (`workspace::rename_workspace`) and is the one that does not. `signer_of` in
`workspace.rs` already finds a certificate by member id, key and `revoked_at` and never reads
the role, so a widened member signs as soon as a certificate row names them. **Only the owner's
vault derives the organization key that issues one**, and that stays so: `member_change_role`
and `member_invite` refuse, for a caller who is not the owner, any role or permission set that
carries a signing act the target does not already hold, with one sentence naming the owner. A
holder of `changeRole` who is not the owner narrows anybody and widens only with
`renameWorkspace`.

`member_change_role(member_id, role, permissions)` writes the member row re-signed with the new
role and permissions (both under `MemberAuthority`), and keeps the certificate in step: a target
gaining its first signing act gets `cert-<member id>` issued by the owner; a target losing its
last signing act has its rows re-signed under the actor and its certificate revoked, through
`store::re_sign_rows_of_certificate` and `Certificate::revoked`, the routine removal already
uses. Nobody changes their own row and nobody changes the owner's.

*Rejected: sealing the organization key into every administrator's vault so that they can
certify. It is a second master secret, and a removed administrator's copy of it cannot be
rotated out of the replica on their disk.*

## The settings area is one component, sectioned by `?section=` (requirements 14 to 17)

`routes/settings/+page.svelte` becomes thin: it owns the queries the four pages own today
(settings, organization state, members, remote sync) and renders
`settings/component/area.svelte` with what they answered and the section read from the
address. The area is pure props, so criterion 14 is asserted by rendering it with two
sessions; no route page renders under vitest and none starts to.

The section is `?section=<name>` on `/settings`, the idiom `record-surface.svelte` established
and `contracts/[id]` reads: the pathname stays `/settings`, so `opensSignedOut` in
`layout/shell-surface.ts` still admits it for the language control and `back.ts` still keys the
trail by pathname, so moving between sections is not leaving the page. `settings/section.ts`
holds the ordered list, `sectionOf(url)`, `sectionsFor(session, holdsTursoAuthority)` and
`withSection(name)`, typed the way `create-intent.ts` types `withCreateIntent` so `resolve`
keeps its route type.

The section control is `settings/component/rail.svelte`: a `nav` of anchors, one per visible
section, styled with `sidebarMenuButtonVariants` from the sidebar primitive so it reads as the
application's rail, the current one marked `aria-current`. *Rejected: vertical `Tabs`. The
wrapper does not type `orientation`, the pill styling is horizontal, and tab semantics say
"same page, other view" where these are seven pages sharing a frame. Also rejected: a path
segment per section, which `opensSignedOut` would refuse unless it moved from exact to prefix
matching, which its own comment argues against.*

# Components

**Rust, `tauri/src/`**

| Module | Becomes responsible for |
| --- | --- |
| `keyring.rs` (new) | the credential store: store, read, forget, the test static and its turn lock |
| `sync/turso/consent.rs` | calls `keyring::` for the Turso token; nothing else moves |
| `organization/permission.rs` | the seven acts, the role masks; `Administration::ALL`, `name`, the pinned literals |
| `organization/link.rs` | `JoinLink.invitation: Option<InvitationHalf { id, secret }>`; `for_invitation`, `invitation_half` |
| `organization/invite.rs` | `invite_member` taking `[(workspace id, access)]`; `issue` taking permissions; `sealed_secret` and `issued_by` written; `invitation_link`; `revoke_invitation` removing a pending member; `rename_member` under `RenameMember`; `reissue_invitation` under `ResetPassword` |
| `organization/join.rs` | `accept(store, machine, held, link, password, credential, now)`: find the invitation, judge its standing, open the vault with the secret, reseal under the password, consume, record the member, file the key. `inspect` produces the standing again and the invited username. `admit` loses the `must_change_password` branches |
| `organization/session.rs` | `open_session` reused by resume; `remember(session)` and `resume(store, held)` over `keyring::` |
| `organization/role.rs` (new) | `change_role`: the row rewrite, the certificate issue and revoke, the owner-only refusal for signing acts |
| `organization/workspace.rs` | `grant_workspace` under `GrantWorkspace`; `withdraw_grant`; `create`, `delete`, `renew` unchanged under `require_owner` |
| `organization/removal.rs` | unchanged; called by `revoke_invitation` for a pending member |
| `organization/forget.rs` | one more signal: an `invitation` table without `sealed_secret` |
| `organization/command.rs` | the commands in Interfaces; `state_of` resumes a remembered session; `sign_out` forgets the entry |
| `organization/setup.rs` | `OWNER_PERMISSIONS` over seven bits; the walk's `create_organization` files the owner's key |

`must_change_password` stays on the row and in `MemberAuthority`'s neighbours but is written
`false` by `accept`; the column is not removed, because removing it changes nothing a person
sees and widens the diff.

**TypeScript, `src/lib/`**

| Module | Becomes responsible for |
| --- | --- |
| `platform/host.ts`, `platform/tauri.ts` | the payloads and calls in Interfaces |
| `organization/router.ts` | the gates in Interfaces |
| `sync/admission.ts` | two kinds only, `signInRequired` and `admitted`; `passwordChangeRequired` goes |
| `layout/startup.ts` | `changePassword` and the `change-password` state go; `StartupState` loses it; `#admit` has one refusal |
| `layout/component/startup-change-password.svelte` | deleted |
| `layout/component/startup-sign-in.svelte` | the locked wall gains a "use a link" text control beside disconnect, to `/organization/join` |
| `organization/component/join-screen.svelte` | renamed `connect-screen.svelte` in the vocabulary ticket; steps `paste`, `inspecting`, `unreadable`, `unreachable`, `refused` (lapsed, consumed, revoked, another organization), `password` (organization name, username, password and confirmation at the floor, one primary "join") |
| `organization/join.ts` | `JoinStep` grows the two steps; `linkKind(facts)` |
| `organization/setup.ts` | `SetupStatement` becomes `groupCoverage`, `accountCreation`, `succession` |
| `settings/section.ts` (new) | the section list and helpers above |
| `settings/component/area.svelte` (new) | the frame: title, rail, the chosen section's blocks; pure props |
| `settings/component/rail.svelte` (new) | the section control |
| `settings/component/{locale,ending-soon,updates,diagnostics}.svelte` | unchanged, drawn by `general`, `updates`, `diagnostics` |
| `organization/component/identity.svelte`, `change-password-form.svelte` | drawn by `you`; the form keeps `currentLabel` |
| `organization/component/members.svelte` | rebuilt: one list, active and pending rows, the row actions of requirement 15 behind their acts; owns `role-dialog.svelte` (new), `access-dialog.svelte` (new), `rename-member-dialog.svelte`, and the remove `DeleteDialog` that lives on the organization page today |
| `organization/component/invitations.svelte` | deleted |
| `organization/component/invite-form.svelte` | asks username, role, and per workspace a checkbox and an access choice; the result panel is one link with one copy control |
| `organization/component/workspaces.svelte` | rebuilt: rows with name, member count, open mark; rename, members, delete behind their gates; new workspace for the owner; `workspace/component/transfer.svelte` beneath, acting on the open workspace |
| `workspace/component/{identity,members}.svelte` | deleted; `rename-form.svelte` opens from the workspaces row |
| `workspace/component/sync.svelte`, `organization/component/{reconnect-authority,organization-link,disconnect}.svelte` | drawn by `sync`, plus a "forget Turso account" control for the owner over `consent.disconnect` |
| `organization/dialogs.svelte.ts`, `layout/component/organization-dialogs.svelte` | `invited` carries a link and a username; shown by invite, new link and copy link alike |
| `layout/destination.ts` | `secondaryDestinations` become the sections, `url` typed to admit `withSection`; `palette.svelte` keys rows on the full string |
| `layout/component/workspace-menu.svelte`, `account-menu.svelte` | rows as requirement 17 |
| `routes/{organization,workspace,account}/+page.svelte` | deleted |
| `i18n/{en,ar}/index.ts` | `settings.section.*`, `settings.you.*`, the members and workspaces strings under `organization.*`; `organization.dashboard.*`, `workspace.*` stale keys, `account.*`, `layout.changePassword.*`, the five control-plane leftovers under `organization` removed |

**`packages/workspace-permission`**: the act table, `Role` unchanged, `ADMINISTRATION_BY_ROLE`
with owner and administrator both `maskOf(...EVERY_ADMINISTRATION)`; `tests/permission.test.ts`
rewritten for the seven acts.

# Interfaces

**Commands, in `command.rs` and mirrored in `host.ts` and `router.ts`.** A row says the gate
Rust enforces; the router's `permitted(...)` names the same act and is the earlier refusal.

| Command | Gate | Answers |
| --- | --- | --- |
| `organization_link_inspect(link)` | public | `LinkFacts { organizationId, organizationName, remoteUrl, standing, invitation: { username } \| null }`; `standing` is `none` for an organization link and `open`, `lapsed`, `consumed` or `revoked` for an invitation link |
| `organization_connect(link)` | public | as today for an organization link; for an invitation link, records the organization where none is held, and refuses with `preconditionFailed` where another is |
| `invitation_accept(link, password)` | public | `OrganizationState` with a session; refuses a lapsed, consumed or revoked invitation by name, a password under the floor, and a link for an organization other than the held one |
| `organization_sign_in`, `organization_sign_out`, `organization_disconnect` | as today | as today; sign-in files the key, the other two forget it |
| `organization_state_get()` | public | as today; the first call of a launch resumes a remembered session |
| `organization_change_password(current, next)` | member | as today, and rewrites the keyring entry |
| `member_invite(username, role, workspaces: [{ id, access }])` | `inviteMember`; a signing role needs the owner; `read-only` needs the owner | `Invited { memberId, invitationId, username, joinLink, expiresAt, unreachableWorkspaces }` and no password field |
| `member_reset(member_id)` | `resetPassword` | `Invited`, the link carrying a new invitation half; permissions kept |
| `invitation_link(invitation_id)` | `inviteMember`, and the issuer's row | the link again; `forbidden` for anybody else |
| `invitation_revoke(invitation_id)` | `inviteMember` | removes a never-accepted member as an ordinary removal; deletes the row alone for a reset |
| `member_change_role(member_id, role, permissions)` | `changeRole`; a signing act the target lacks needs the owner | `MemberFacts` |
| `member_rename(member_id, username)` | `renameMember` | as today |
| `member_remove(member_id, lock_out)`, `member_lock_out_cost` | `removeMember`; lock-out the owner's | as today |
| `workspace_grant(workspace_id, member_id, access)` | `grantWorkspace`; `read-only` the owner's | as today |
| `workspace_grant_withdraw(workspace_id, member_id)` | `grantWorkspace`; never the owner's own | deletes the grant; the credential dies at its expiry, as an ordinary removal's does |
| `workspace_create`, `workspace_delete`, `organization_renew_credentials`, `organization_own_link` | the owner, in Rust; `procedure.member` in the router | as today; `permitted('deleteWorkspace')` goes with the act |
| `organization_members()` | member | `MemberFacts[]` |
| `organization_invitations()` | removed | folded into `MemberFacts.pending` |

**Payloads.** `MemberFacts { id, username, role, permissions, workspaces: [{ id, access }],
pending: { invitationId, expiresAt, standing, canCopy } | null, createdAt }`. `canCopy` is
whether the caller issued it. `OrganizationSession` loses `mustChangePassword`. `Invited` loses
`generatedPassword`. `JoinLink`'s JSON gains an optional `invitation: { id, secret }` and the
test at `link.rs:153` pins five keys on an organization link and six on an invitation link,
with `"password"` absent from both.

**Router gates that move**: `workspace.grant` and `workspace.withdraw` to `grantWorkspace`;
`member.rename` to `renameMember`; `invitation.reissue` to `resetPassword` and renamed
`member.reset`; `member.changeRole` new under `changeRole`; `invitation.accept` and
`invitation.link` new; `workspace.remove` to `procedure.member`.

**Frontend helpers**: `withSection(section)` returns `` `/settings?section=${section}` ``
typed as a template literal over the route, as `withCreateIntent` does;
`sectionsFor(session, holdsTursoAuthority)` returns the visible sections in order:
`general`, `you`, `members` (session permits any of `inviteMember`, `removeMember`,
`changeRole`, `resetPassword`, `renameMember`, `grantWorkspace`), `workspaces` (a session),
`sync` (a session), `updates`, `diagnostics`; with no session, `general`, `updates`,
`diagnostics`.

# Data Model

`invitation` gains `sealed_secret BLOB NOT NULL` and `issued_by TEXT NOT NULL`, both outside
the signature. No other table changes. `member.permissions` carries the seven-bit table.
`remote-sync.json` is unchanged; the member key is in the credential store, never in it.

# Technical Approach

The order is model first, screens second, and inside each half the ticket that others
build on lands first. `blocked-by` on the tickets says which.

1. **The permission table and the forget signal** (requirements 4, 5, 6 without the change
   command, 19). Package, Rust mirror, `OWNER_PERMISSIONS`, `require` call sites moved to
   their acts, `require_owner` unchanged, the `sealed_secret` column and its signal in
   `forget.rs`, the per-module fixtures updated. Everything after this builds on the table.
2. **The keyring module** (requirement 12's foundation). Lift the credential store out of
   `consent.rs`; no behaviour change; the consent's tests keep passing through it.
3. **The invitation link, accept, reset, revoke, copy** (requirements 8, 9). `link.rs`,
   `invite.rs`, `join.rs`, the commands, `host.ts`, `router.ts`. `Invited` and `LinkFacts`
   change shape here, so the invite form's test is adjusted in the same ticket to compile.
4. **Change role, grant withdraw, member facts** (requirements 6, 7, 15's data). `role.rs`,
   `workspace::withdraw_grant`, `MemberFacts.workspaces` and `pending`, the invitation list
   command removed.
5. **The remembered session** (requirement 12). `session::remember` and `resume`, `state_of`,
   sign-in, accept, change password, sign-out and forget. Then the frontend half: admission
   loses `passwordChangeRequired`, startup loses `change-password`, the surface is deleted.
6. **The connect screen and the wall's link control** (requirements 10, 11). Both link kinds,
   the choose-password step, the refusals; the wall's control.
7. **The walk's connect step** (requirement 13). Strings and `setup.ts` only.
8. **A prototype of the settings area on screen**, against the human's organization, before
   9 to 11 are built: the rail, the members rows with a pending row, the invite result. The
   write-up lands under `evidence/prototypes/` and the code is deleted
   ([[rules/module-layout]], *Prototype code*). The spec's constraint requires this and the
   tickets for 9 to 11 declare it as a `blocked-by`.
9. **The settings area and its sections that move unchanged** (requirement 14, 17 for the
   general, you, updates, diagnostics sections). `section.ts`, `area.svelte`, `rail.svelte`,
   the route, `destination.ts`, both menus, the three routes deleted, `shell-surface.ts`
   untouched. The members, workspaces and sync sections are stubs drawn from today's
   components until 10 and 11 replace them, so the route works at every commit.
10. **The members section** (requirement 15). `members.svelte` rebuilt, the two new dialogs,
    the invite form's access choice and one-link result, `invitations.svelte` deleted.
11. **The workspaces and sync sections** (requirement 16, the rest of 14). `workspaces.svelte`
    rebuilt with rename, members and delete; transfer beneath; the sync section composed
    from the existing pieces plus the forget-Turso control; `workspace/component/{identity,
    members}.svelte` deleted.
12. **The vocabulary sweep** (requirements 18, 20). Rename `join-screen` to `connect-screen`,
    remove every retired string in both locales, the i18n test, the contexts corrected
    (organization: Link, Chain, the boundaries on owner-only acts and on the remembered key;
    remote-sync: Sign in, the credential boundary; repository: the first-run paragraph), and a
    read of both locales recorded in the run log.

Steps 1 and 2 are independent of each other; 3 needs 1; 4 needs 1 and 3; 5 needs 2 and 3; 6
needs 3 and 5; 7 stands alone; 8 needs nothing built; 9 needs 5 (the area's `you` section
draws the change-password form without a forced state); 10 needs 4, 8 and 9; 11 needs 4, 8
and 9; 12 needs everything.

# Integration

- **`layout/shell-surface.ts`** is read and not changed; `/settings` stays the one address
  that opens signed out, and the sections that need a session are absent there.
- **`layout/startup.ts`'s ports**: `organization.changePassword` leaves `StartupPorts` (the
  form in the `you` section calls its own mutation); `organization.getState` is what resumes,
  so `start()` is unchanged.
- **The command palette** searches the sections through `secondaryDestinations`; the
  `{#each}` in `palette.svelte` is keyed on the full string so seven rows on one pathname
  are seven keys.
- **`organization-dialogs.svelte`** stays mounted in the shell; the members section and the
  rail's invite row both call `openOrganizationDialog('invite')`, and `showInvited` draws one
  link for invite, reset and copy.
- **`workspace/component/permitted.svelte`** keeps its one remaining caller, `sync/router.ts`'s
  rename gate consumers; the workspaces section gates on the props the area hands it.
- **`packages/workspace-permission`** is consumed by `api/procedure.ts`'s `permitted`; the
  new act names flow through the existing type.

# Migration

Nothing is published. A machine holding an organization written under the six-act table has
an `invitation` table without `sealed_secret`; `forget::old_shape` reads that as the old shape
and forgets everything at the first `organization_state_get`, as 824 did. The human's own
machine is wiped again, and the run says so before the first launch of a build past step 1.
The two organizations left on the human's Turso account from before are untouched and will
not open under the new build; deleting them is the human's, in Turso's dashboard.

# Testing Strategy

Where a criterion names a test, this says which file and at what level ([[rules/testing]]).

| Criterion | Checked by |
| --- | --- |
| 1 | `grep -r consent_begin src tauri/src` finds `setup-walk`, `reconnect-authority` and their commands only; the context's boundary read in review |
| 2 | 819's live test for read-only stands (`workspace.rs`, armed by `RENTABLE_LIVE_TURSO`); the switcher's rows in `workspace-menu.svelte.test.ts` |
| 3 | `connect.rs` tests unchanged |
| 4 | `permission.rs` reads `index.ts`; `packages/workspace-permission/tests/permission.test.ts` rewritten; `grep transferOwnership` empty |
| 5 | a test in `workspace.rs` and `removal.rs` calling each owner act with an administrator holding all seven bits; the section tests assert no control for a non-owner |
| 6 | `role.rs` tests: role and permissions written and read back, self refused, owner refused; `members.svelte.test.ts` renders a widened row |
| 7 | `role.rs` and `authority.rs` tests: a widened member's signed invitation verifies on a second store; after narrowing, their new signature is refused with `revoked` |
| 8 | `join.rs` tests: accept opens, reseals, consumes, files the key; second open refused; lapsed refused by name; `connect-screen.svelte.test.ts` finds the password step; `invite-form.svelte.test.ts` finds one copy control and no password text |
| 9 | `invite.rs` test: reset keeps permissions, names unreachable; `join.rs`: the reset link accepts; `change-password.svelte.test.ts` asserts the current field |
| 10 | `connect-screen.svelte.test.ts` with an organization link and an invitation link from one field |
| 11 | `startup-sign-in.svelte.test.ts` unchanged, plus one case for the link control |
| 12 | `startup.test.ts`: a state with a session reaches `ready` with no `sign-in`; `session.rs` and `command.rs` tests over the keyring fake: resume, sign-out forgets, change password rewrites; a Rust test reads `remote-sync.json` and every replica for the key bytes; one relaunch by hand |
| 13 | `setup.test.ts` literals and the vocabulary guard |
| 14 | `area.svelte.test.ts` with an owner session and a member session, asserting the rail's entries and the sections' headings in order |
| 15 | `members.svelte.test.ts`: an active row and a pending row, each action present only with its act, invite opening the dialog |
| 16 | `workspaces.svelte.test.ts` (new): rows, the three gates, new workspace for the owner with authority, export and import present |
| 17 | `workspace-menu.svelte.test.ts` and `account-menu.svelte.test.ts` |
| 18 | `i18n/tests/organization.test.ts` extended with the retired keys and the one-key-per-term list |
| 19 | `forget.rs` test with a replica whose `invitation` table lacks `sealed_secret`; once by hand |
| 20 | the four gates |

Every Rust module keeps its own fixture; the builders named in the survey (`invite.rs::owned`,
`join.rs::invited`, `removal.rs::organization`, `store.rs::populated`) are extended in place.
The fixed vectors in `authority.rs` are unchanged, because no preimage changes. The link test
and the secrecy sweep in `join.rs:882` are extended rather than replaced.

# Operational Considerations

- **A keyring that refuses.** Linux without a secret service, or a locked keychain: sign-in
  succeeds, the store fails, a diagnostic is written, and the next launch shows the wall. Never
  a failure surface.
- **A stale remembered key.** After a reset elsewhere, the key opens nothing; the entry is
  forgotten and the wall names the organization, where the person uses the reset link.
- **The link screen while signed in.** An OS-delivered `rentable://` link while a session is
  open still routes to the connect screen, which refuses a link for another organization and
  offers a reset link's password step only after a sign-out; simplest is to refuse with "sign
  out first", said on the screen.
- **The human's machine** is wiped once by the forget, and the walk is re-run to create a
  fresh organization for the on-screen checks.

# Technical Risks

- **`issue` taking permissions touches every caller and fixture in `invite.rs`.** Shows up as
  a compile error, which is the good failure.
- **The keyring fake's turn lock now guards two entries.** A test that takes the turn and
  awaits a store call that takes it again deadlocks; the lock is taken once per test, at the
  top, as `forget.rs` does.
- **The area's queries fire under vitest for the owner case.** `organization-link.svelte` owns
  its query; under the query-providers fixture it fails to fetch and shows its error branch,
  which the area test does not assert on. Where that proves noisy, the link becomes a prop.
- **Seven sections on one pathname collide in `isActiveRoute`.** The rail marks the section
  from `page.url.searchParams`, never from `isActiveRoute`.
- **A reset link revoked leaves a member with an unopenable vault.** Recorded above and said
  in the dialog; the remedy is another reset.
