---
status: draft
---

# Problem

Four things the human asked for on 2026-10-05, read against the code.

## A machine holds one organization, and the wall hides the way off it

**A person on the wall cannot find how to leave the organization this machine holds.** The human,
reading the sign-in screen: "there's no option ... to leave the current [organization], so the user
will be stuck with the org". The act exists. `disconnect` sits in the foot control's popover on the
wall (`startup/component/sign-in.svelte`, the `extras` handed to
`settings/component/way-in-preferences.svelte`), behind the confirm the organization page uses
(`organization/component/disconnect-dialog.svelte`). But that popover is a ghost button labelled
with the language's name, and nothing on the wall says a way out is inside it. Effort 843 ticket 01
moved it there; the human's report is that the move made it unfindable.

**The no-workspace screen has the same trap with no exit at all.** A member admitted to an
organization whose owner has not created a workspace yet lands on
`startup/component/no-workspace.svelte`. For anyone but the owner it is a name and a sentence, and
its foot control hands in no extras: no sign-out, no disconnect.

**And a machine cannot hold a second organization.** The human then asked for "an option to switch
between orgs on the same machine on the login page": above the sign-in form, the organization shown
as a square that is part of the view, a dropdown of the organizations this machine holds, switching
between them, adding one, and removing one with a confirm, fitting the current design. This
reverses a decision of the human's own: on 2026-09-13 they withdrew a wall that listed
organizations as selectable rows, because "the rows made the wall a choice between organizations
rather than a login page" ([[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]]
requirements 7 and 17; [[efforts/826-the-organization-and-the-way-in-are-rethought/spec]]
requirement 3). On 2026-10-05, shown that decision, they chose to reconsider it. The new shape
keeps the sign-in form as the wall's subject and puts the choice in one compact control above it.

The one-organization rule is built into the shell, not only drawn on the wall:

- **The machine's record holds one.** `RemoteSyncStore.organization: Option<HeldOrganization>`
  (`tauri/src/machine/record.rs:280`, "the one organization this machine holds, or none ... It was
  `organizations`, a list, until 2026-09-13"), in `remote-sync.json`. Beside it, one current
  `workspace`, one `turso_organization`, one in-memory `workspace_token`, and `replicas` whose
  entries carry a workspace and a member but **no organization**.
- **A second is refused in five places**, all with `RefusalReason::AnotherOrganizationHeld`: link
  connect, first run, connect existing (`organization/invitation/connect.rs` `refuse_while_held`,
  `organization/setup/command.rs`, `organization/setup/connect.rs`), invitation accept
  (`organization/invitation/join.rs:206-218`) and machine link (`organization/invitation/machine.rs:136-153`).
- **Disconnect forgets everything, not one organization.** `forget::forget`
  (`organization/session/forget.rs`) sweeps every `org-*` and `ws-*` replica file in the data
  directory, clears every replica entry and the Turso organization, and deletes the Turso
  consent token, which sits under one fixed keyring account, `rentable.turso-platform` / `owner`
  (`tauri/src/turso/consent.rs:110-115`).
- **One session at a time.** One open organization store, one member session, one signed-out flag,
  one workspace engine (`organization/state.rs`, `tauri/src/database/mod.rs`); sign-in signs out
  any open session first, and sign-out deletes the remembered key for that organization.
- **Already keyed per organization:** the organization replica (`org-<id>.db`) and the remembered
  member key (`rentable.member-key`, account `<organization id>:<member id>`).

## Passwords

**The owner chooses the organization's first password once, and is never asked to type it again.**
The walk's name step (`organization/setup/component/name-step.svelte`) takes it in one field. A
typo there is the owner's password from then on, and nobody can reset it. The two other places a
new password is chosen already ask twice: joining by a link (`connect-screen.svelte`) and changing
the password from settings (`change-password-dialog.svelte`).

**A password field gives no way to check what was typed.** Every password field draws dots and
nothing else. The human asked for an eye at the field's end that shows the password while pressed
and held, and hides it on release.

## The organization's name

**The owner cannot rename the organization.** It is typed once in the walk's name step and nothing
changes it afterwards; the organization tab of settings (`settings-organization.svelte`) draws the
standing, the mark, roles, members and leaving, none of which touches the name. The human asked for
a rename in that tab, shown to the owner only.

**The name is not one value in one place:** the replicated organization row holds it sealed
(`organization.name_sealed`); each machine keeps it in the clear in its record so the wall can name
it before anybody unlocks (`HeldOrganization.name`); every invitation link carries it as it stood
when made (`organization/invitation/link.rs`). **The organization row is under no signature**:
`Authority` in `organization/authority/preimage.rs` covers member, role, override, mark,
invitation, succession, workspace and grant rows, and not the organization, so any member holding
the database's credential could write a name. A workspace's name already has a rename under
`renameWorkspace`.

# Goal

A machine holds as many organizations as its people need. The wall shows which one it is signing
in to, and from there a person switches to another, adds one, or removes one after one confirm,
and nobody is ever stuck on a way-in screen. Every surface that chooses a new password asks for it
twice, and every password field shows its contents for exactly as long as a person holds the eye
at its end. The owner renames the organization from the organization tab, and every member's
machine shows the new name once it has synced. Every machine that holds an organization today
holds the same one, the same way, after the update.

# Scope

- The machine's record, the refusals, disconnect, the Turso consent token, and the session, as far
  as holding several organizations needs.
- The wall (`sign-in.svelte`) and the no-workspace screen (`no-workspace.svelte`): the switcher.
- The wall's foot control: it loses both extras.
- The account menu, signed in: a way to the switcher.
- The carry-over of every existing install.
- The owner's first password in the walk's name step: a confirmation field.
- Every password field in the desktop application, eleven today:

  | Surface | File | Field |
  | --- | --- | --- |
  | the wall | `startup/component/sign-in.svelte` | password |
  | joining by a link | `organization/setup/component/connect-screen.svelte` | password, confirmation |
  | the walk's name step | `organization/setup/component/name-step.svelte` | password, and the new confirmation |
  | the walk's existing-organization step | `organization/setup/component/existing-step.svelte` | password |
  | change password | `organization/session/component/change-password-dialog.svelte` | current, new, confirmation |
  | delete organization | `organization/component/delete-organization.svelte` | password |
  | offer ownership | `organization/member/component/offer-ownership.svelte` | password |
  | accept ownership | `organization/member/component/accept-ownership.svelte` | password |

- The organization tab, for the owner: a rename, the signed name in the replicated organization
  row, what each machine shows afterwards, and what links do.

# Requirements

## Several organizations on one machine

1. **A machine holds any number of organizations: none, one, or several.** Setting up, connecting
   an existing organization, joining by an invitation link and connecting by a machine link each
   add an organization to the ones held, where today they are refused while one is held. One Turso
   group still holds one organization.
2. **The wall shows the organization switcher above the sign-in form.** A square, drawn as part of
   the wall's column in the way-in surface's own look, carrying the selected organization's tile
   and its name and a chevron that says it opens. The organization's name is drawn once on the
   wall.
3. **Opening it lists every organization this machine holds**, each with its tile and name, the
   selected one marked, then "add organization", then a way to remove one. Choosing another
   organization makes it the wall's: where this machine remembers a sign-in for it, the person is
   taken straight in; otherwise the wall asks for that organization's username and password.
4. **"Add organization" leads to the two ways in**, set up and join by a link, as the welcome
   offers them. Leaving them without finishing brings back the wall of the organization that was
   selected; finishing selects the new one.
5. **Removing an organization asks once, and forgets that one alone.** The confirm is the
   disconnect confirm, naming the organization being removed. Confirming deletes that
   organization's replica, its workspaces' replicas, its remembered sign-in, its entry in the
   machine's record, and its Turso consent where this machine held one. Every other organization
   held keeps all of its own. Removing the last one brings back the welcome. Cancelling changes
   nothing.
6. **The switcher cannot be used while the screen is busy**: on the wall while a sign-in runs, on
   the no-workspace screen while a workspace is being created.
7. **The no-workspace screen carries the same switcher**, for the owner and every other member, so
   a member there can switch, add or remove.
8. **Signed in, the account menu offers "switch organization".** It takes the person to the wall
   with the switcher open, and keeps the open organization's remembered sign-in, so choosing it
   again goes straight back in. Signing out is unchanged: it forgets the remembered sign-in of the
   open organization alone and lands on its wall.
9. **One organization is open at a time.** Only the open one replicates and runs the heartbeat. An
   organization not open learns that it was signed out from elsewhere, deleted, or renamed when it
   is next opened.
10. **A link names the organization it is for.** An invitation or machine link for an organization
    not held adds it; one for an organization already held opens that organization's way in.
11. **Each organization keeps its own Turso consent.** An owner who owns two organizations on two
    Turso accounts holds both consents on one machine, and owner-only acts in one use that
    organization's consent and no other.
12. **The wall's foot control carries the language and the appearance, and nothing else.**
    "Disconnect" and "use a link" leave it, for the switcher's remove and "add organization".
13. **Every machine that holds an organization today holds the same organization after the
    update, the same way.** Signed in stays signed in, a remembered sign-in still opens with no
    password, its replicas are kept and not pulled again, and an owner's Turso consent still
    works. Nobody is asked to set up, connect, or sign in again because of this change.

## Passwords

14. **The owner's first password is asked for twice.** The walk's name step draws a confirmation
    field directly under the password, labelled as the join and change-password confirmations are.
    The organization is not created while the two differ, and the refusal is a sentence under the
    confirmation field, in the form's own error treatment.
15. **Every surface that chooses a new password keeps asking twice.** Joining by a link and
    changing the password keep their confirmation fields and refusals unchanged.
16. **Every password field carries an eye at its trailing end.** At rest it is a closed eye and the
    field draws dots. While a person presses and holds it, the field shows the characters and the
    eye is drawn open. On release the field draws dots again and the eye closes. It never stays
    open: it closes when the pointer is released anywhere, when the press is cancelled, and when
    the window loses focus.
17. **The eye works without a mouse.** It is a button named for what it does ("show password" in
    English, its counterpart in Arabic), reachable with Tab, and holding Space on it shows the
    password until Space is released. Enter in a password field still submits its form.
18. **Holding the eye does not disturb the field.** The cursor stays where it was, what was typed is
    unchanged, and typing after release continues in the field. While the field is disabled the eye
    is disabled with it.

## The organization's name

19. **The owner sees a rename in the organization tab**, beside the organization's name, and nobody
    else sees it: not a manager, not a member holding any combination of flags.
20. **The rename takes the same name rules as setting up.** The name is trimmed, may not be empty,
    and may not exceed `ORGANIZATION_NAME_LIMIT`, refused with the sentences the walk's name step
    uses.
21. **Only the owner's rename is accepted.** A rename sent by anybody else is refused in the shell
    with no change, whatever the interface drew.
22. **The owner's machine shows the new name at once**, in the organization tab, the shell, the
    switcher and its own record.
23. **Every other member's machine shows the new name once it has synced while signed in**, in the
    shell, the switcher and its record. A machine that has not opened the organization since keeps
    naming the last name it saw.
24. **Links already handed out keep working.** Joining by one still succeeds; the link's text may
    name the old name, and the machine that joins shows the current name once it is in.
25. **Links made after the rename carry the new name.**
26. **A name the owner did not write is not shown.** The organization's name is put under the
    owner's signature, as the mark is, and a machine reading a name whose signature does not check
    keeps showing the last name that did.

# Acceptance Criteria

1. Rust tests: with one organization held, setting up a second, connecting an existing one,
   accepting an invitation for another and connecting by a machine link for another each succeed,
   and the record then holds both. `AnotherOrganizationHeld` is no longer produced. A first run
   into a group that already holds an organization is still refused.
2. A component test of the wall with two held organizations finds the switcher above the username
   field, naming the selected organization, and finds that name drawn once on the wall.
3. Component tests: opening the switcher lists both organizations with the selected one marked, then
   "add organization" and remove. Choosing the other with a remembered sign-in calls the open path
   for it with no password asked; choosing one without asks for its username and password on its
   wall.
4. Component tests: "add organization" shows set up and join by a link; going back restores the
   previous selection; a finished add selects the new organization.
5. A Rust test with two organizations held, each with a workspace replica, a remembered key and,
   for one, a Turso consent: removing one deletes exactly its `org-<id>.db`, its workspaces' replica
   files, its keyring entry, its record entry and its consent, and the other organization's files,
   key, entry and consent are byte-for-byte unchanged. Removing the last held organization leaves
   the welcome. Component tests: remove opens the disconnect confirm naming that organization, and
   cancelling changes nothing.
6. With `isSigningIn` true on the wall and `isCreating` true on the no-workspace screen, the switcher
   is disabled. Covered by component tests.
7. A component test of the no-workspace screen, for `canCreate` true and false, finds the switcher
   with switch, add and remove.
8. A component test finds "switch organization" in the account menu; a test shows that using it
   keeps the open organization's keyring entry and lands on the wall with the switcher open, and
   that signing out deletes only the open organization's entry.
9. A Rust test with two held organizations: a heartbeat replicates the open one only; an
   organization signed out from elsewhere while not open shows as signed out when next opened.
10. Rust tests: a link for an organization not held adds it; a link for a held organization
    selects it and adds nothing.
11. A Rust test holds two organizations owned on two Turso accounts: each owner-only act reaches the
    Platform API with its own organization's consent, and forgetting one consent leaves the other.
12. Opening the wall's foot control shows the language and the appearance and no other act. Covered
    by a component test.
13. A test starts from a `remote-sync.json`, keyring and data directory written by the current
    release (one organization, signed in with a remembered key, two workspace replicas, an owner's
    Turso consent) and asserts that after the update the same organization is held, the session
    resumes with no password, no replica is deleted or pulled again, and an owner-only act reaches
    Turso.
14. In the walk's name step, a password and a different confirmation do not create the
    organization, and a sentence under the confirmation says they differ; matching values create it
    as today. Covered by a component test.
15. The existing tests of the join and change-password confirmations pass unchanged.
16. For every field in the scope table, a test shows `type="password"` at rest, `type="text"` while
    the eye is held, and `type="password"` after pointer release, after `pointercancel`, and after
    the window's `blur`. The eye's icon is the closed eye at rest and the open eye while held. In
    Arabic the eye sits at the field's left end, its trailing end there.
17. Keyboard: Tab reaches the eye; Space held shows the password and Space released hides it; Enter
    in the field submits the form. The eye's accessible name is "show password" in English and the
    Arabic string in Arabic. Covered by component tests.
18. Holding and releasing the eye leaves the field's value and cursor position unchanged, and focus
    returns to the field after a pointer hold. With the field disabled the eye is disabled. Covered
    by component tests.
19. A component test of the organization tab draws the rename for an owner session and draws no
    rename for a manager session and for a member session holding every flag.
20. A rename to blank, to whitespace, and to one character past the limit is refused with the walk's
    sentences; a valid name is trimmed before it is written. Covered by tests on the form and in
    the shell.
21. A Rust test calls the rename as a non-owner session and asserts a refusal and an unchanged
    `name_sealed`.
22. After a rename on the owner's machine, the organization tab, the shell, the switcher and the
    record read the new name without a restart. Covered by a test on the record and a component
    test on the tab.
23. A Rust test with two replicas: after the owner renames and the member's replica syncs while
    signed in, the member's record names the new name. A replica that has not synced still names
    the old one.
24. A Rust test joins by a link minted before the rename; the join succeeds and the joined machine's
    record names the new name.
25. A link minted after the rename carries the new name. Covered by a Rust test.
26. A Rust test writes a new `name_sealed` straight into a replica without the owner's signature and
    asserts that a member's machine keeps naming the previous signed name; an organization set up
    before this change still opens and names its name.

# Constraints

- **The application has users** ([[contexts/repository]], *Constraints*). Requirement 13 is the
  bar for the record, the keyring, the replicas and the Turso consent, and the organization row's
  signature (requirement 26) is added to organizations that already exist without locking any
  member out. Nothing is reset to land this.
- **Data at rest changes under [[rules/migrations]] and [[contexts/desktop/persistence]]**: the
  machine's record shape, the keyring account of the Turso consent, the replica entries, and the
  organization row's signature.
- **Credentials stay where [[rules/credentials]] puts them.** The password's value is shown on the
  screen only and no new command, store or log line sees it. Each organization's Turso consent stays
  in the keyring on the owner's machine. The name stays sealed in the replica.
- **Owner only is a constant, not a flag.** The owner's role always carries everything
  ([[contexts/desktop/organization]]), so no `renameOrganization` flag is added.
- **The confirm is the existing one.** The disconnect dialog's wording is effort 824 requirement
  20's; this change opens it from the switcher, naming the organization being removed.
- **Both locales.** Every new string in English and Arabic; the eye and the switcher's chevron
  follow the reading direction.
- **Design calls follow Apple's HIG first**, then [[rules/interface]] and
  [[contexts/desktop/components]]. The switcher fits the way-in surface effort 843 settled; it is
  not a second card.
- **Contexts that state one organization per machine are corrected in the same change**:
  [[contexts/desktop/remote-sync]], [[contexts/desktop/organization]] and the code comments that
  name the rule (`machine/record.rs`, `sign-in.svelte`, `setup/command.rs`, `invitation/machine.rs`).

# Out of Scope

- **Several organizations open at once.** One is open; the others wait on disk.
- **Replicating organizations that are not open**, in the background or otherwise.
- **Switching from the rail by a list.** Signed in, the way to another organization is the account
  menu's "switch organization", which leads to the wall.
- **The organization's mark in the switcher.** The mark is sealed and cannot be read before
  sign-in; the tile is drawn from the name.
- **Leaving an organization's membership.** Remove forgets the organization on this machine; it
  does not take the person off the member list.
- **One Turso group holding several organizations.** Unchanged.
- **A reveal that stays on.** The eye shows only while held; no toggle and no preference.
- **Password strength, password manager integration, or a reset flow.**
- **Renaming the Turso group or databases, renaming for anybody but the owner, rewriting links
  already handed out, or changing the mark or the organization's id.**

# Assumptions

- "The logo" in the human's picture is a tile that tells organizations apart. The organization's
  mark cannot be opened at the wall, so the tile is the name's first letter on a tinted square.
- Switching away keeps the remembered sign-in, since a person switching to look at another
  organization has not asked to be signed out of this one.
- "User settings password" refers to change password, which already asks twice; requirement 15
  keeps it so.
- The eye goes on every password field, including the ones that check a current password.
- A keyboard user is served by holding Space on the eye, matching the press-and-hold the human
  described.
- "The organization settings tab" is the tab drawn by `settings-organization.svelte`.
- A machine refreshes an organization's clear name in its record on a sync while signed in, and
  only then, because the sealed name cannot be opened without an open vault.

# Risks

- **Remove deleting another organization's data.** Today's forget sweeps every replica file and the
  one consent token. Criterion 5 checks the other organization byte for byte for this reason.
- **The update stranding an existing install.** Moving the record from one organization to many,
  and the consent token to a per-organization key, touches every machine in the field. Criterion 13
  starts from a real current-release machine.
- **A workspace replica file named by workspace id alone** could collide between organizations only
  if two organizations shared a workspace id; ids are generated, so this is held as unlikely, and
  the plan says whether replica entries carry the organization.
- **Organizations set up before the name was signed** have an unsigned name; criterion 26 checks
  that they still open.
- **The eye adds a tab stop** between the password and the submit button; Enter still submits.
- **The window losing focus while the eye is held** could leave a field shown if `blur` is not
  handled; criterion 16 tests it.
- **Two machines naming an organization differently** until the stale one opens it and syncs;
  requirement 23 accepts this.
