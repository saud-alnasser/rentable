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

**A spent link still admits a machine to the wall.** An invitation link and its code, and a
machine link and its code, are each marked spent once used (`consumed_at`) and lapse within a
week; the human asked for a lifetime the maker chooses, from an hour to a week, three days unless changed. A spent machine link is refused. A spent invitation link is refused only after
`connect::connect` has already recorded the organization on a machine that held nothing
(`organization/invitation/join.rs`), so that machine is left on the organization's wall. The
human: the code should be spent at once so it cannot be used again unless the owner or a manager
gives a new one, and the link too if possible.

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
- Invitation and machine links: spent means spent, on every machine.
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

1. **With no organization held, the way in is today's.** The welcome offers set up and join by a
   link, and the walk and the connect screen run as they do now.
2. **With one or more held, the wall shows the organization switcher above the sign-in form.** A
   square, drawn as part of the wall's column in the way-in surface's own look, carrying the
   selected organization's tile and name and a chevron that says it opens. The organization's
   name is drawn once on the wall. The wall opens on the organization last signed in to.
3. **The switcher shows the chosen organization, answers a hover, and opens on a click into a
   dropdown** listing every organization this machine holds, each with its tile and name, the
   chosen one marked, and an x at the end of each row that removes that organization (requirement
   5). The last option is "add organization" with a plus. Choosing another organization makes it
   the wall's, and the wall asks for that organization's username and password.
4. **"Add organization" goes through the same process as the welcome**: set up, or join by a link
   and its code. Leaving it without finishing brings back the wall of the organization that was
   selected; finishing selects the new one.
5. **Removing an organization asks once, in a confirm dialog, and forgets that one alone.** The
   confirm is the disconnect confirm, naming the organization being removed. Confirming deletes
   that organization's replica, its workspaces' replicas, its remembered sign-in, its entry in the
   machine's record, and its Turso consent where this machine held one. Every other organization
   held keeps all of its own. Removing the last one brings back the welcome. Cancelling changes
   nothing.
6. **The switcher cannot be used while the screen is busy**: on the wall while a sign-in runs, on
   the no-workspace screen while a workspace is being created.
7. **The no-workspace screen carries the same switcher**, for the owner and every other member, so
   a member there can switch, add or remove.
8. **Switching happens signed out.** A signed-in person reaches the switcher by signing out, which
   is unchanged: it forgets the remembered sign-in of the open organization and lands on its wall.
9. **One organization is open at a time.** Only the open one replicates and runs the heartbeat. An
   organization not open learns that it was signed out from elsewhere, deleted, or renamed when it
   is next opened.
10. **A link and its code admit one machine, once.** Once a machine has used them, opening them
    again, on that machine or any other, is refused before anything is connected, recorded or
    pulled, and the refusal says to ask the owner or a manager for a new link. Today a spent
    invitation link still connects a machine that holds nothing before the spent row is read
    (`organization/invitation/join.rs`), which lands that machine on the organization's wall.
11. **Whoever makes a link chooses how long it and its code last.** One lifetime covers both,
    since the code is half of the key that opens the link and the pair lapses together. The
    choice runs from one hour to one week: every hour from 1 to 23 hours, then every day from 1 to
    6 days, then 1 week, and nothing else. It starts at 3 days. It is offered wherever a link is
    made, for invitation links and machine links alike, and the link lapses at the chosen moment
    or sooner where the credential sealed inside it dies. The handover says when the pair lapses,
    with the time of day as well as the date. Today every link lasts a week
    (`INVITATION_LIFETIME_MS`) and the handover prints a date alone
    (`organization/member/component/link-handover.svelte`). **A link the owner's machine makes
    carries a database credential minted to die at the link's own lapse**, so once it lapses it
    reaches nothing on Turso either; a link a manager makes carries the manager's own grant, as
    today, since only the owner's machine can mint.
12. **Adding an organization again takes a new link.** A person who removed an organization, or
    whose link was spent, comes back only by a link and code the owner or a manager makes for
    them, or, for the owner, by connecting the existing organization from set up. Nothing left on
    the machine admits it again.
13. **A link for an organization not held adds it; one for an organization held opens that
    organization's wall** and admits nothing new.
14. **Each organization keeps its own Turso consent.** An owner who owns two organizations on two
    Turso accounts holds both consents on one machine, and owner-only acts in one use that
    organization's consent and no other.
15. **The wall's foot control carries the language and the appearance, and nothing else.**
    "Disconnect" and "use a link" leave it, for the switcher's remove and "add organization".
16. **Every machine that holds an organization today holds the same organization after the
    update, the same way.** Signed in stays signed in, a remembered sign-in still opens with no
    password, its replicas are kept and not pulled again, and an owner's Turso consent still
    works. Nobody is asked to set up, connect, or sign in again because of this change.

## Passwords

17. **The owner's first password is asked for twice.** The walk's name step draws a confirmation
    field directly under the password, labelled as the join and change-password confirmations are.
    The organization is not created while the two differ, and the refusal is the walk's own field
    error on the confirmation field, saying the two differ.
18. **Every surface that chooses a new password keeps asking twice.** Joining by a link and
    changing the password keep their confirmation fields and refusals unchanged.
19. **Every password field carries an eye at its trailing end.** At rest it is a closed eye and the
    field draws dots. While a person presses and holds it, the field shows the characters and the
    eye is drawn open. On release the field draws dots again and the eye closes. It never stays
    open: it closes when the pointer is released anywhere, when the press is cancelled, and when
    the window loses focus.
20. **The eye works without a mouse.** It is a button named for what it does ("show password" in
    English, its counterpart in Arabic), reachable with Tab, and holding Space on it shows the
    password until Space is released. Enter in a password field still submits its form.
21. **Holding the eye does not disturb the field.** The cursor stays where it was, what was typed is
    unchanged, and typing after release continues in the field. While the field is disabled the eye
    is disabled with it.

## The organization's name

22. **The owner sees a rename in the organization tab**, beside the organization's name, and nobody
    else sees it: not a manager, not a member holding any combination of flags.
23. **The rename takes the same name rules as setting up.** The name is trimmed, may not be empty,
    and may not exceed `ORGANIZATION_NAME_LIMIT`, refused with the sentences the walk's name step
    uses.
24. **Only the owner's rename is accepted.** A rename sent by anybody else is refused in the shell
    with no change, whatever the interface drew.
25. **The owner's machine shows the new name at once**, in the organization tab, the shell, the
    switcher and its own record.
26. **Every other member's machine shows the new name once it has synced while signed in**, in the
    shell, the switcher and its record. A machine that has not opened the organization since keeps
    naming the last name it saw.
27. **Links already handed out keep working.** Joining by one still succeeds; the link's text may
    name the old name, and the machine that joins shows the current name once it is in.
28. **Links made after the rename carry the new name.**
29. **A name the owner did not write is not shown.** The organization's name is put under the
    owner's signature, as the mark is, and a machine reading a name whose signature does not check
    keeps showing the last name that did.

# Acceptance Criteria

1. A component test with no organization held draws today's welcome with set up and join by a
   link, and no switcher. Rust tests: with one organization held, setting up a second, connecting
   an existing one, accepting an invitation for another and connecting by a machine link for
   another each succeed, and the record then holds both; `AnotherOrganizationHeld` is no longer
   produced; a first run into a group that already holds an organization is still refused.
2. A component test of the wall with two held organizations finds the switcher above the username
   field, naming the organization last signed in to, and finds that name drawn once on the wall.
3. Component tests: the switcher names the chosen organization and opens on a click; the dropdown
   lists both organizations with the chosen one marked and an x on each row, and "add organization"
   with a plus last; pressing a row's x opens the remove confirm for that row's organization and
   does not switch to it; choosing the other draws its wall asking for its username and password.
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
8. A test signs out of one of two held organizations and asserts its keyring entry alone is
   deleted and the wall shows the switcher on that organization.
9. A Rust test with two held organizations: a heartbeat replicates the open one only; an
   organization signed out from elsewhere while not open shows as signed out when next opened.
10. Rust tests, for an invitation link and for a machine link: used once, then opened again on the
    same machine and on a machine holding nothing, each second opening is refused with the
    "already used" reason, the record is unchanged, and no replica file is written.
11. Component tests of the link act: the lifetime choice offers exactly 1 to 23 hours, 1 to 6
    days and 1 week, in that order, starting at 3 days, and the handover prints the lapse with date
    and time. Rust tests: a link made with each of 1 hour, 3 days and 1 week carries an expiry of
    exactly that long after it was made, or the credential's death where sooner; a lifetime under
    an hour, over a week, or off the steps is refused by the shell; a link opened past its expiry
    is refused as lapsed. A link the owner's machine makes seals a credential whose own expiry
    equals the link's; a manager's seals the manager's grant.
12. A Rust test removes an organization and opens the link that first added it: refused as in 10. A
    new link for the same account admits it.
13. Rust tests: a link for an organization not held adds it; a link for a held organization selects
    it and adds nothing.
14. A Rust test holds two organizations owned on two Turso accounts: each owner-only act reaches the
    Platform API with its own organization's consent, and forgetting one consent leaves the other.
15. Opening the wall's foot control shows the language and the appearance and no other act. Covered
    by a component test.
16. A test starts from a `remote-sync.json`, keyring and data directory written by the current
    release (one organization, signed in with a remembered key, two workspace replicas, an owner's
    Turso consent) and asserts that after the update the same organization is held, the session
    resumes with no password, no replica is deleted or pulled again, and an owner-only act reaches
    Turso.
17. In the walk's name step, a password and a different confirmation do not create the
    organization, and the confirmation field carries the walk's field error saying they differ; matching values create it
    as today. Covered by a component test.
18. The existing tests of the join and change-password confirmations pass unchanged.
19. For every field in the scope table, a test shows `type="password"` at rest, `type="text"` while
    the eye is held, and `type="password"` after pointer release, after `pointercancel`, and after
    the window's `blur`. The eye's icon is the closed eye at rest and the open eye while held. In
    Arabic the eye sits at the field's left end, its trailing end there.
20. Keyboard: Tab reaches the eye; Space held shows the password and Space released hides it; Enter
    in the field submits the form. The eye's accessible name is "show password" in English and the
    Arabic string in Arabic. Covered by component tests.
21. Holding and releasing the eye leaves the field's value and cursor position unchanged, and focus
    returns to the field after a pointer hold. With the field disabled the eye is disabled. Covered
    by component tests.
22. A component test of the organization tab draws the rename for an owner session and draws no
    rename for a manager session and for a member session holding every flag.
23. A rename to blank, to whitespace, and to one character past the limit is refused with the walk's
    sentences; a valid name is trimmed before it is written. Covered by tests on the form and in
    the shell.
24. A Rust test calls the rename as a non-owner session and asserts a refusal and an unchanged
    `name_sealed`.
25. After a rename on the owner's machine, the organization tab, the shell, the switcher and the
    record read the new name without a restart. Covered by a test on the record and a component
    test on the tab.
26. A Rust test with two replicas: after the owner renames and the member's replica syncs while
    signed in, the member's record names the new name. A replica that has not synced still names
    the old one.
27. A Rust test joins by a link minted before the rename; the join succeeds and the joined machine's
    record names the new name.
28. A link minted after the rename carries the new name. Covered by a Rust test.
29. A Rust test writes a new `name_sealed` straight into a replica without the owner's signature and
    asserts that a member's machine keeps naming the previous signed name; an organization set up
    before this change still opens and names its name.

# Constraints

- **The application has users** ([[contexts/repository]], *Constraints*). Requirement 16 is the
  bar for the record, the keyring, the replicas and the Turso consent, and the organization row's
  signature (requirement 29) is added to organizations that already exist without locking any
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
- **Switching while signed in.** The switcher lives on the wall; a signed-in person signs out to
  reach it, and nothing in the rail or the account menu switches organizations.
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
- "User settings password" refers to change password, which already asks twice; requirement 18
  keeps it so.
- The eye goes on every password field, including the ones that check a current password.
- A keyboard user is served by holding Space on the eye, matching the press-and-hold the human
  described.
- "The organization settings tab" is the tab drawn by `settings-organization.svelte`.
- A machine refreshes an organization's clear name in its record on a sync while signed in, and
  only then, because the sealed name cannot be opened without an open vault.

# Risks

- **A manager's link carries a credential that outlives the link.** Turso has no per-token
  revocation; rotating invalidates every token for the database ([[references/turso]], under
  revocation). A manager's machine holds no Turso consent and cannot mint, so a manager's link
  seals the manager's own grant, which lives up to four weeks from its mint whatever the link's
  lifetime. Whoever holds both that link and its code could read the grant out by hand and reach
  the organization database until the grant lapses, though the application refuses the link
  itself once spent or lapsed (requirements 10 and 11). An owner's link does not carry this risk:
  its credential is minted to die with the link.
- **Remove deleting another organization's data.** Today's forget sweeps every replica file and the
  one consent token. Criterion 5 checks the other organization byte for byte for this reason.
- **The update stranding an existing install.** Moving the record from one organization to many,
  and the consent token to a per-organization key, touches every machine in the field. Criterion 16
  starts from a real current-release machine.
- **A workspace replica file named by workspace id alone** could collide between organizations only
  if two organizations shared a workspace id; ids are generated, so this is held as unlikely, and
  the plan says whether replica entries carry the organization.
- **Organizations set up before the name was signed** have an unsigned name; criterion 29 checks
  that they still open.
- **The eye adds a tab stop** between the password and the submit button; Enter still submits.
- **The window losing focus while the eye is held** could leave a field shown if `blur` is not
  handled; criterion 19 tests it.
- **Two machines naming an organization differently** until the stale one opens it and syncs;
  requirement 26 accepts this.
