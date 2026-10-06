---
status: implemented
---

# Problem

Four things the human asked for on 2026-10-05, read against the code, and a fifth they added the
same day while the effort was being built: the walk's group field. A sixth followed that day: a
new member starts locked.

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

## The walk's group field

**Asking for the Turso group costs the owner everything they typed.** Where Turso takes none of
the group names the application can work out, the first create is refused and the walk's name
step grows a group field (`askGroup` in `organization/setup/component/first-run.svelte`). The
human, 2026-10-05: when that field appears after the first submit, every other field is cleared,
so the name, the username and the password have to be typed again. It should only add the new
field, ask for it, and carry on from there.

## A new member starts locked

**A new account can act the moment its person signs in.** An invitation makes a signed member row
with a generated password (`invitation/account.rs`, `write_account`); the person sets their own at
the join or first sign-in, and from then on acts with every flag their role carries. Nobody who
made the account sees that the right person got in and chose a password before the account can
change anything. The human, 2026-10-05: a new member is locked by default, able to sign in, set
the password and view data and nothing more, shown with a locked badge on their card, until a
member able to change permissions (an owner or a manager) unlocks them. Members who already set
their password are not locked; members invited but not yet in are.

**What enforces a flag today.** Organization acts are refused in Rust off the actor's verified row
(`session::actor`, `permission::require`). Record writes (complexes, units, tenants, contracts,
payments) are refused by the frontend's procedures alone (`procedure.permitted` in `api/trpc.ts`);
the SQL runs with the member's grant and Rust checks no flag on it. The only bar a modified client
cannot pass is a read-only credential, which the owner alone mints. `must_change_password` is an
unsigned column the member's own machine can rewrite, so it cannot carry a lock.

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
    organization's wall.** There the link is judged against the organization's own replica, with no
    session open: a password-reset link for a member of that organization lets them choose a new
    password as today; any other link (an invitation, a machine link, or one used or lapsed) is
    refused with the "already used" sentence, and nothing is added or recorded. *Settled by the
    human on 2026-10-05, while the effort was being built: the plan's short-circuit admitted
    nothing, which refused a spent link silently and stranded a member whose password was reset.*
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

## The walk's group field

30. **Asking for the group keeps what was typed.** When the create is refused because Turso needs
    the group named, the name step keeps the organization's name, the username, the password and
    its confirmation exactly as typed, adds the group field with its sentence, and puts the focus
    in it. Creating again sends the kept values with the group; nothing has to be retyped.

## A new member starts locked

31. **Every account made from now on starts locked.** An account an invitation makes is locked
    from its creation, and stays locked through the join and the first password.
32. **A locked member signs in, sets their password and views, and does nothing else.** They see
    the records their role lets them view, and the directory where their role shows it; every
    control that adds, edits, deletes or administers is drawn dimmed with the locked reason, as
    [[rules/interface]] draws every refused act, and every such act is refused: organization acts in Rust, record writes by the
    procedures that already refuse a missing flag. A sentence on their screen says the account is
    locked until an owner or a manager unlocks it.
33. **The member's card carries a locked badge** while they are locked, on every machine that
    shows the directory.
34. **Who unlocks.** The owner, or a member holding `AssignRole` or `OverrideMember` who outranks
    the locked member, sees an unlock on the locked member's card once that member has set a
    password, and unlocking asks for confirmation. Nobody unlocks themselves. Before the password
    is set the card says the member has not signed in yet and offers no unlock.
35. **The lock is signed.** Locked and unlocked are written under the signature of whoever set
    them, as the mark and the overrides are, and a lock row that does not verify reads as locked.
    A locked member cannot unlock themselves by writing to their own replica.
36. **Existing members carry over.** A member who had set a password before this change is not
    locked. A member invited before it who has not yet set one is locked, by the first machine of a
    member able to unlock that opens the organization after the update.
37. **A password reset locks again.** A reset hands the account to whoever holds the new link, so
    the account is locked until it is unlocked again.
38. **A machine added by a machine link keeps its member's lock.** A machine link made for a
    locked member carries that the member was locked, and the machine it connects reads that
    member locked with no lock row, as a machine that joined by an invitation does, until a
    verifying unlock is read. *Added 2026-10-06 by the human from review round two.*
39. **A setup interrupted by a restart keeps its Turso consent's details.** The Turso organization
    a consent was granted over, while it waits for the organization it will belong to, is written
    to the machine's record and read back at the next launch, apart from the copy kept for older
    builds. *Added 2026-10-06 by the human from review round two.*

## The walk's existing step

40. **The owner's connect to an existing organization keeps what they typed.** A refused connect
    on the walk's existing step leaves the username and the password in their fields with the
    refusal beside them. *Added 2026-10-06 by the human; the same defect as requirement 30's, on
    the step beside it, present on `main` before this effort.*

## Found in the app before merge

41. **Adding an organization starts its Turso step unconnected.** The setup walk reads the setup's
    own consent, never the selected organization's. *Added 2026-10-06 by the human.*
42. **An owner whose Turso consent stopped working is told to connect again.** A consent Turso
    answers as an invalid token reads as not connected, and the act that met it says to connect
    Turso again from the organization settings. Where a newer consent over the same Turso account
    supersedes an older one, the organizations on that account keep working. *Added 2026-10-06 by
    the human, after a link was refused by Turso.*
43. **A card shows an edit the moment it is made.** Any record edited from a card or a list is
    shown changed as soon as the edit is done, everywhere it is drawn, with no tab switch or
    reload. *Added 2026-10-06 by the human, from a workspace rename in the settings.*
44. **The account menu opens each settings tab.** It lists Settings, Account, Organization and
    Workspaces, each opening the settings on that tab, then Sign out. The workspace menu's entry
    reads "Manage Workspaces". *Added 2026-10-06 by the human.*
45. **Sign out is immediate.** It asks nothing and goes straight to the sign-in wall, with no reload
    of the page. *Added 2026-10-06 by the human.*
46. **A link's lifetime is chosen on a slider.** The same steps as requirement 11, on a slider with
    the chosen lifetime written beside it, in place of the dropdown. *Added 2026-10-06 by the human.*

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
    it and adds nothing; on a held organization a spent link and an unused invitation are refused as
    "already used" with the record unchanged, and a reset link for a member lets them set a new
    password and sign in.
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
30. A component test of the first run, through the real create path and its refusal (not a
    rerender of the walk with new props), fills the name step, has the create refused with the
    group asked for, and asserts the name, username, password and confirmation fields still hold
    what was typed, the group field is shown and focused, and a second create sends the kept
    values with the group.
31. A Rust test: an account made by an invitation has a verifying locked row; after the join and
    the first password it is still locked.
32. A Rust test: a locked member's organization acts (an invite, a role change, a rename of a
    workspace, an ownership offer) are refused with a locked refusal and change nothing; their
    sign-in, password change and reads succeed. A component test: a locked session draws every write
    control on a record list dimmed with the locked reason, and its procedures refuse a record write;
    the locked sentence shows.
33. A component test of the directory draws the locked badge on a locked member's card and not on
    an unlocked one's.
34. A Rust test: the owner and an outranking manager holding `AssignRole` unlock a locked member who
    set a password; a manager without either flag, a member who does not outrank, and the member
    themselves are refused; an unlock before the password is set is refused. A component test: the
    unlock is drawn only for those readers, opens a confirmation, and is absent before the password
    is set.
35. A Rust test writes an unlocked lock row straight into a replica without a valid signature and
    asserts the member still reads as locked.
36. A Rust test starts from an organization made before this change with one member who set a
    password and one invited who has not: after an owner's machine opens it, the first is unlocked
    and the second is locked.
37. A Rust test resets an unlocked member's password and asserts they read as locked.
38. A Rust test: a locked member's machine link, opened on a new machine after the member's lock
    row and the owner's marker were deleted, leaves that member reading locked there and refused an
    organization act; an unlocked member's machine link does not latch.
39. A Rust test: a consent granted for an added organization, then a reload of the record before
    the create, finds the pending Turso organization again, and the selected organization's own is
    unchanged.
40. A component test of the first run through the real connect path: a refused connect leaves the
    username and password as typed and shows the refusal.
41. A component test: with the selected organization holding its own consent and no setup consent,
    the walk asks to connect and does not say connected.
42. A Rust test: a 401 invalid token from an organization's own consent reads that organization as
    not connected and refuses with the reason that names connecting again.
43. A component test: a workspace renamed from its settings card shows the new name once the rename
    resolves, with no tab change.
44. A component test: each account menu entry opens the settings on its tab; the workspace menu
    reads "Manage Workspaces".
45. A component test: sign out asks nothing and draws the wall with no loading pass.
46. A component test: moving the link form's slider by keyboard changes the lifetime written beside
    it, and the link is made with that lifetime in hours.

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
- **Locking a member who is already unlocked by hand**, other than by a password reset.
- **A read-only credential for a locked member.** The lock is held by Rust and the procedures, as
  every record flag is today; see *Risks*.
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

- **A rolled-back build finds no Turso consent for an owner.** The consent moves from the keyring
  account `owner` to `org:<id>` (requirement 14), and a build from before this effort reads only
  `owner`, so after a rollback the owner reconnects Turso once; nothing in the organization is
  lost. *Accepted by the human on 2026-10-06, from review round one.*
- **A modified client can write records while locked.** Record writes are refused by the
  frontend's procedures, as every record flag is today; a member running a changed build with the
  grant they hold could still write. Closing that needs a read-only credential while locked, which
  only the owner can mint, and is left out (*Out of Scope*). Organization acts are refused in
  Rust, and other machines verify the signed lock, so nobody can unlock themselves.
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
