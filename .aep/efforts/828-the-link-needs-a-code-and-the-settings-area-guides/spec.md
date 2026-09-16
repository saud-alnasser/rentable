---
status: accepted
---

# Problem

**The organization link reads the directory forever, and the settings area does not say
what it is for.**

Effort 826 rethought the organization and the way in, and on 2026-09-15 the human walked
the merged build and found six things. Five are about how the settings area and the rail
present what 826 built; one is about what a link is worth to whoever finds it.

- **Every link reads the organization database, and the organization's own link reads it
  forever.** A `rentable://join/` link carries a read-only credential over the organization
  database in the clear, whichever kind of link it is, and the organization's own link is
  minted with no expiry ([[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/evidence/research/what-a-link-exposes-and-what-a-code-can-bound]]).
  That link is what every member is handed to connect a second machine (826, requirement
  10), so it is in every chat history the organization has. Whoever finds one pulls a
  replica of every sealed vault and guesses passwords offline for as long as they like; the
  password floor is the only bound. The invitation code 826 added guards the invited vault's
  first opening and does not touch the credential in the same link.
- **The members section is a list of names with its acts hidden.** Every act on a person is
  a glyph drawn on hover, up to eight on one row, and the section carries no sentence saying
  what it is for. The owner could not tell that this is where accounts are made and changed,
  which is the one thing the section exists to be.
- **The workspaces section has the same shape**, and the same problem.
- **The password is a form drawn on every visit.** The you section draws three empty
  password fields under a heading, whether or not the person came to change anything, and a
  write drawn inline is off the rule that every write takes the shared form surface
  ([[rules/interface]], *Form surface*).
- **The workspace menu carries two acts that are not the workspace's.** Invite and new
  workspace sit inside the switcher, refused with a sentence for most readers, and both live
  in the settings area already, where the sections they belong to are.
- **Two rows in the account menu are lowercase where the row beside them is capitalized.**
  Sign in and sign out do not take the treatment the settings row takes.
- **An organization whose every machine is gone cannot be reached again.** *Found 2026-09-15
  by the human, mid-implement, on their own organization.* The only way onto a machine holding
  nothing is a link, and the organization's own link, the copy meant to recover it, lives inside
  the application: once no owner's or administrator's machine holds the organization, nobody can
  produce a link, and the first run refuses the owner's own Turso account because the group
  already holds an organization (826, requirement 21). The owner is locked out of what they own
  ([[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/evidence/research/what-a-consent-alone-can-recover]]).

# Goal

**A link alone opens nothing, and the settings area reads as the one place accounts,
workspaces and your own way in are kept.**

Whoever finds a link, of any kind, weeks later, reads nothing with it: what it carries is
sealed under a code somebody read out, and the credential inside it lapses on its own. A
member connects their own next machine without asking anybody, and an owner whose every
machine is gone connects again with their Turso account and their password. The members and workspaces
sections say what they are for and show every act; the you section states facts and offers
its writes on the form surface; the rail's workspace menu is the workspace and the switch,
and its account menu reads as one.

# Scope

- **What a link carries**, in Rust: the sealed credential, the second-machine link, and what
  the organization's own link is for now.
- **The connect screen and the wall**: the code asked on every link, and where a
  second-machine link lands.
- **The settings area**: the members section, the workspaces section, and the you section,
  reshaped; the second-machine act added to you; the organization link's sentence in sync.
- **The rail's two menus**: the workspace menu narrowed, the account menu's rows cased.
- **The way in, on a machine holding nothing** (*added 2026-09-15 at the human's word, mid-run*):
  the first screen's two ways worded as the account or the link and its code; the first-run walk
  connecting to an organization the group already holds; a registry of connected machines in the
  organization database; the organization's own link retired; the connect screen as one form of
  link and code; and the owner deleting the organization from the settings area.
- **The directories** (*added 2026-09-16 at the human's word, mid-run, on seeing the members
  section*): the members and workspaces sections as directories of record cards; an account
  made before any link; one link act that admits a machine to an account; ownership transferred
  by the owner.
- The English and Arabic strings all of the above read, the tests that hold the shape, and
  the changeset.
- [[contexts/desktop/organization]], [[rules/credentials]] and effort 826's spec, corrected
  where this changes what they say.

# Requirements

*The link* (*decided 2026-09-15 with the human, two picker rounds*)

1. **A link carries no legible credential.** The organization database credential a link
   carries is sealed under the link's own secret and a six-character code together, the way
   the invited vault's password is sealed today (826, requirement 23), and it rides in the
   link's text because nothing reads a row before the credential is out. Opening any link,
   invitation, reset or second-machine, asks for the code before the organization is reached;
   a wrong code, a lapsed code or no code reaches nothing, and the refusal names which. The
   code is a key half and never a check: a modified client holding the link is no better off
   than an honest one. *Chosen over a code the client checks, which is a speed bump and not a
   lock, and over leaving the link as it is with the risk recorded.* **One code per link,
   living as long as the link.** *Corrected 2026-09-15 at the plan: the seal has to ride in the
   link's own text, since nothing reads a row before the credential is out, so a fresh code
   would be a fresh link text to re-send. The human chose one code for the link's life over
   ninety seconds with a fresh code being a fresh link. The clock never bounded an attacker; the
   derivation does, as 826's requirement 23 said. 826's ninety-second code and its fresh-code
   control are superseded.*
2. **The credential inside a link lapses on its own.** What a link seals is a credential that
   expires: for an invitation and a reset, the issuer's own grant on the organization
   database, which is minted for four weeks and renewed on the owner's machine; for a
   second-machine link, the member's own. A link whose code was guessed is dead within four
   weeks regardless. *The code bounds a leaked link to thirty-two to the sixth guesses at
   Argon2id, the bound the invitation already accepts; the lapse is what makes the bound
   finite in time.*
3. **A member connects their own next machine.** From the you section a signed-in member
   makes a link and a code for another machine. Opening the link on a machine holding no
   organization, with the code, connects the machine and lands on the wall, where the same
   username and password sign them in; the password does not change. The link admits one
   machine, once, and lapses after seven days like an invitation, or sooner where the
   credential it carries lapses first; the code is the link's own and lives as long as it,
   and a person who lost the pair makes another from the same place. Nobody but the member
   makes one: an administrator who needs to get a member back in issues a reset, which already
   exists. *Chosen over a holder of `resetPassword` making it from the member's row, which
   makes a person setting up a laptop call somebody, and over both.* *Superseded 2026-09-16 by
   requirement 20: a link is made by the owner or an administrator from the account's card, for
   an account with no machine signed in; the member's own act in the you section goes. The
   second-machine link of ticket 04 is the shape requirement 20 reuses.*
4. **The organization's own link is handed to nobody.** It stays in the sync section for the
   owner alone, named as the copy that recovers the organization when every machine is gone,
   with a sentence saying so and saying that a member connects another machine from their
   own you section. The connect screen still accepts it, without a code, because when every
   machine is gone nobody can make one. What it is still worth to whoever finds it is said
   beside it and recorded under Risks.
5. **What a link is worth is stated once.** [[rules/credentials]] and
   [[contexts/desktop/organization]] say what each kind of link carries, what stands between
   a found link and the directory, and that the organization's own link is the one credential
   that never lapses. 826's requirements 10 and 23 and its *Link* entry are corrected rather
   than contradicted.

*The settings area*

6. **The members section says what it is for, and every act is visible.** Under its legend
   one sentence says who is listed and that the owner and administrators make and change
   accounts here. The invite control leads the section rather than trailing the list. Every
   act on a person is reachable from a control a reader can see without hovering, and the
   acts read in four groups: what the person is called (rename); what they may do (role and
   permissions, workspaces and access); their way in (new link and sign out everywhere, and
   on a pending row copy link, fresh code and revoke); and leaving (remove, and for the owner
   lock out). The acts themselves, and what each is gated on, are unchanged from 826's
   requirement 15. The shape that does this is judged on the real organization, not on mock
   rows. *Superseded 2026-09-16 by requirement 19: the section is a directory of record cards,
   not a list of rows; ticket 07's rows were built and never looked at.*
7. **The workspaces section says what it is for, and every act is visible.** One sentence
   under the legend; new workspace leads the section for the owner holding the authority,
   and the refusal sentence stands in its place for an owner whose machine lost it; a row
   still says the name, whether it is the open one, the access this reader holds and how many
   people hold it; rename, members and delete are reachable without hovering. Export and
   import stay beneath, under the legend naming the open workspace. Otherwise 826's
   requirement 16 holds. *Superseded 2026-09-16 by requirement 21: a directory of cards.*
8. **The you section states facts and offers its writes on the form surface.** The identity
   block stays. The password is a row saying what it is, with a change-password control that
   opens the shared form surface carrying the current form's three fields and its floor
   sentence; nothing about the password is drawn until the person asks to change it. The
   other-machines act stays as it is. The second-machine act of requirement 3 joins them,
   under its own heading, and the link and code it produces are shown the way an invitation's
   are: the link with one copy control, the code large and with none, and the date the pair
   lapses. *Corrected 2026-09-16 by requirement 20: the second-machine act leaves the you
   section; the identity block, the password row and the other-machines act stay.*

*The rail*

9. **The workspace menu is the workspace and the switch.** It keeps its header, the list of
   workspaces the member holds with the open one marked, and one row to the workspaces
   section. Invite and new workspace leave it, with their refusal sentences; both remain in
   the settings area, in the sections they belong to. 826's requirement 17 is corrected.
10. **The two rail menus' rows take one casing.** Sign in and sign out are drawn with the
    treatment the settings row already takes. The strings stay lowercase in both locales;
    the treatment is the row's.

*Everything in scope*

11. **Links made before this effort are refused as links, and nothing migrates.** Nothing is
    published, so a link in the old shape is refused with the sentence a link that is not one
    already gets, and a pending invitation at upgrade is reissued.
12. **Both locales, and the tests that hold the shape.** Every section and menu this effort
    reshapes has a component test asserting what it renders and what each act is gated on;
    the Rust tests cover the sealed credential on every kind of link, the code refused by
    name, the second-machine link's single use and lapse, and that the organization link
    still connects without one; the Arabic strings are written, not copied. A changeset
    describes the user-visible change. *Corrected 2026-09-15 by requirement 16: no organization
    link connects any more, and the Rust test for it goes with it.*

*The way in, on a machine holding nothing* (*decided 2026-09-15 with the human, mid-implement,
in three rounds: the fix rides in this effort rather than a follow-on; the walk connects to an
organization the group already holds, gated on a registry of connected machines; the
organization's own link retires; the owner can delete the organization*)

13. **The first screen offers two ways in, and says what each needs.** A machine holding no
    organization offers the Turso account and the link with its code, worded as what the person
    holds: the account is for whoever owns the organization, made or already there; the link and
    the code are what an administrator or a member handed over. Nothing on that screen names a
    group, a database or a consent. The wall's disclosure for a machine already holding an
    organization is unchanged (826, requirement 11).
14. **The Turso account connects to the organization the group already holds.** After the
    consent, a group holding nothing runs the walk as today and creates. A group already holding
    an organization is said to hold one, in one sentence, and the walk asks for the owner's
    username and password and connects this machine to it, signed in, instead of refusing. Only
    the owner can: the owner's password is what re-derives the organization's key, so an
    administrator's or a member's password is refused by name and the machine is left holding
    nothing. **The way is open if and only if no owner's or administrator's machine is
    connected** (requirement 15 says what connected means): while one is, the walk refuses with a
    sentence saying that machine can hand out a link, and the consent is let go as today. One
    organization to a group still holds (826, requirement 21): the walk never creates in a group
    that holds one. *Chosen over a follow-on effort, and over a password-only way in, which can
    reach no database; the consent is what the owner holds outside any machine.*
15. **Every connected machine is registered in the organization, with whom it belongs to.** The
    organization database records each machine that holds it: the machine, the member signed in
    on it where one is, and when it was last seen. A machine registers when it connects, names
    its member at sign-in, drops the member at sign-out, refreshes itself on every launch, and
    leaves the registry on disconnect. **A machine counts as connected while it was seen within
    the last seven days**, so a machine that died without disconnecting stops standing in the
    owner's way after a week. The rows are unsigned, like the session epoch and the machine link,
    and the registry gates requirement 14 alone; nothing else reads it. *Corrected 2026-09-16:
    the members directory reads it too, for the standing line and the link act's gate
    (requirements 19 and 20); nothing lists machines and nothing acts on one.*
16. **The organization's own link retires.** With requirement 14 the copy that recovered the
    organization is the owner's account, so the organization link, the one credential that
    never lapses, is no longer minted, stored, shown or accepted. The sync section's link block
    goes; every link the application makes is an invitation, a reset or a second-machine link,
    each sealed under its code (requirement 1). Requirement 4 is superseded, and 826's
    requirement 10 and the *Link* entries are corrected again. *Chosen by the human over keeping
    it beside recovery.*
17. **The link way is one form: the link and its code together.** The connect screen asks for
    the link and the six-character code on one form, since every link now needs one. On
    continuing, an invitation link asks the person to choose their password and then joins; a
    second-machine link connects at once and lands at the wall. An unreadable link and a wrong
    code are each refused on their own field; a lapsed, opened, revoked or replaced link is
    refused by name as requirement 1 has it.
18. **The owner deletes the organization from the settings area.** Under the sync section's
    authority block, beside forgetting the account, the owner can delete the organization: a
    confirmation on the form surface names what goes (every workspace's records and every
    member's way in) and takes the owner's password; then every workspace database and the
    organization database are deleted on the owner's Turso account, this machine forgets the
    organization, and every other machine, finding the organization gone at its next launch,
    forgets it too and lands on the first screen. Nobody but the owner sees the control.

*The directories* (*decided 2026-09-16 with the human, mid-implement, on seeing the members
section of ticket 07 in the running build; two picker rounds and one elaboration*)

19. **The members section is a directory of accounts.** For the owner and administrators
    alone, as today; a member meets no members section. Each account is a record card, the
    way domain records are shown, naming the username, the role, the workspaces held and the
    account's standing: password not yet set, no machine signed in, or a machine signed in
    (requirement 15's register). The card's own menu carries the acts: edit (rename, role and
    permissions, workspaces and access), make a link (requirement 20), reset the password, sign
    out everywhere, remove; each gated as 826's requirement 15 gates it, in plain words. **The
    owner's account is removed by nobody and edited by nobody**, and nobody edits their own
    role, permissions or workspaces: the owner's card offers the transfer (requirement 22) and
    nothing else, and a reader's own card offers nothing. **An account is made from a tray
    above the cards**, the shape the contracts view has, by the owner or an administrator
    holding `inviteMember`: username, role, permissions and workspaces, on the form surface; it
    holds no password until its first link is opened. *Chosen by the human over the row list
    with one control per row, which was built as ticket 07 and never looked at. Corrected
    2026-09-16 on the human's look at the first build: the primary sat at the foot and the
    owner's own card offered their workspaces; both wrong.*
20. **A link is the one way a machine joins an account, and it is what an invitation is.** The
    owner or an administrator makes it from the account's card: a link and a six-character
    code, shown the way ticket 06's handover block shows them, offered while the account's
    password is not yet set or no machine is signed in on the account, and absent otherwise,
    with the card saying which. Opened with the code on a machine holding nothing: an account
    whose password is not yet set is asked to choose one and is signed in; an account with a
    password lands at the wall. A link admits one machine once and lapses after seven days or
    when the credential inside it does. Resetting the password, an act on the card for a holder
    of `resetPassword`, unsets it, so the next link asks for a new one; it is what a reset is.
    A member who wants another machine signs out of the one they have and is given a link. The
    you section keeps its identity block, its password row and its sign-out-everywhere act and
    no link act. *In the human's words: create the account, then click invite link if they have
    zero machines logged in or the account is new, give them the link and the code, and on the
    onboarding they are presented with the set-password form the first time.*
21. **The workspaces section is a directory of workspaces.** Record cards the same way: the
    name, one quiet mark on the open one, and how many people hold it; *corrected 2026-09-16 on
    the human's look: this reader's access left the card, since the members surface behind the
    card's menu is where who holds what is seen, and the open one is marked once rather than
    badged;* the card's menu carries rename, members and delete, gated as 826's requirement 16 gates
    them, in plain words; new workspace in a tray above the cards, as the contracts view has
    it, for the owner holding the authority, with the authority refusal standing in its place
    for an owner who lost it; export and import beneath, under the legend naming the open
    workspace. *Corrected 2026-09-16 with requirement 19: the tray, not the foot.*
22. **Ownership is handed over in two acts, and the new owner's password becomes the key.**
    *Reopened 2026-09-16 at the review: the first shape sealed the founder's key into the new
    owner's row and left it there as the anchor of their way back, which is a value read out of
    the database it judges; the human chose to redesign rather than record the limit.* The owner
    offers ownership from the account's card, with their own password, to an account whose
    password is set; an unset account is refused by name, and the owner can withdraw the offer
    from the same card. The offered member accepts from their you section, on a machine they are
    signed in on, with their password: the organization key becomes the one their own vault
    derives, the way the founder's did; every certificate is re-issued and every row the old
    owner signed is re-signed under it; a succession record, signed by the old key over the new,
    lets every other machine check the change against the key it already holds and pin the new
    one; the roles swap, the old owner becoming an administrator. The way back with the account
    (requirement 14) is then the same for a founder and for a transferee, their password and
    nothing read from the database, and the old owner is refused as an administrator. **The
    Turso authority follows the account that consented, not the ownership**: until the new owner
    reconnects the authority from the sync section, with a Turso account that holds the group,
    the acts that mint run on the founder's machine or not at all, and the sync section says so.

*A member's role, permissions and workspaces* (*decided 2026-09-16 with the human, at review
round one, as a sidenote: "we need to redesign the ui around permissions setting and roles"; two
picker rounds over
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/evidence/research/how-products-present-roles-and-permissions]]*)

23. **A member's role, what they may also do, and their workspaces are one surface, and every
    role and act is described in a sentence.** Opening a member's card, or edit on its menu,
    opens one sheet of three sections. *Role*: a chooser of the three roles, each with one
    sentence about who it is for, the administrator's saying the Turso account stays the
    owner's. *Also allowed*: for a member only, since an administrator holds every act, an
    additive list of the acts they were widened by, each a plain sentence about what the person
    will be able to do, grouped by people and by workspaces, added one at a time from a chooser
    and removed from the list; no toggle wall. *Workspaces*: one row per workspace with a
    named access level and its sentence. What each role may do is a read-only table opened
    from the members tray, never edited there. The acts, the roles, the widening rules and who
    may change what are 826's requirement 6 unchanged; the owner's card and a reader's own card
    still offer no edit. The menu's change-role and workspaces entries leave, edit taking their
    place. *Chosen over the role inline on the card with two acts on the menu, and over dropping
    the per-act surface, which the permission package's own reasoning refuses. The roles stay
    three: the human chose to describe them rather than change them.*

*The settings area's sections* (*decided 2026-09-16 with the human, at review round one, as a
sidenote: "the settings tabs structure is not that good; some needs to be merged into single tab
and named"; one picker round*)

24. **The settings area has four sections, named for what they hold.** *General*: what the
    general section holds today, updates and diagnostics. *Account*: what the you section holds
    today. *Organization*: the members directory, the Turso account (the authority block with
    forgetting it and reconnecting it) and deleting the organization. *Workspaces*: the
    workspaces directory with export and import beneath. Nothing a section held is lost and
    nothing moves between the four beyond this list; every address that named a retired section
    (`?section=you`, `members`, `sync`, `updates`, `diagnostics`) opens the section that
    now holds it, and every link into the area, the rail's row to workspaces among them, names
    the new one. The gates stay: a member meets no organization section beyond what they met
    before (the members directory is the owner's and administrators'; the account block is the
    owner's), so the organization section draws for a member what the sync section drew for
    them. *Chosen over seven sections, which put related things apart and named two of them
    for a mechanism rather than for what a person is looking for.*

*The sync block* (*decided 2026-09-16 with the human, on their look at the four sections:
"the sync section feels odd synced (sync) redesign this section"; one picker round*)

25. **The sync block states a fact about the organization and this machine, in a sentence.**
    At the top of the organization section, one block says where this machine stands with the
    organization on Turso: up to date, with when it last reached Turso ("up to date, checked
    two minutes ago"); or reached Turso once and not since, with that moment; or one of the
    standings that need something, said as what needs doing (the Turso account needs attention,
    this machine's access needs attention, this machine needs reconnecting), each with the
    sentence and the control that already exist for it. One quiet control asks Turso at once;
    no badge and no status word standing alone. *Corrected 2026-09-17 on the human's look: the
    control is named "sync", so the word lives on the control and nowhere else on the block;
    this said "check now" and the word nowhere.* The moment of the last replication that went through is recorded on this
    machine so the block can say it. The block speaks of the organization, not of a workspace.
    *Chosen over moving it under general as a fact about this machine, and over leaving it for
    the next effort.*

# Acceptance Criteria

1. A Rust test decodes each kind of link and finds no field that a Turso client accepts as a
   token; a test opens each kind with the right code and reaches the organization, and with a
   wrong, a lapsed and a missing code reaches nothing, each refusal naming its cause. The
   connect screen's test shows the code field on every link that carries a sealed credential.
2. A Rust test reads the credential a fresh link seals and finds its expiry within four weeks
   of now, on an invitation, a reset and a second-machine link alike.
3. A signed-in member's you section offers a control that produces a link and a code; a Rust
   test opens the link with the code on a second store, lands connected with no member, signs
   in with the unchanged password, and finds the link refused on a second opening and after
   seven days; a wrong code is refused by name.
   *Superseded 2026-09-16 by criterion 20 with requirement 3: the link is made from the account's
   card by the owner or an administrator, and the you section offers none; ticket 04's tests
   still pin the machine kind's single use, lapse and wrong code.*
4. The sync section, for the owner, still shows the organization link under a sentence that
   names it as the recovery copy and points a member to their you section; for anybody else
   the block is absent. A Rust test connects a machine with it and no code.
   *Superseded 2026-09-16 by criterion 16: the link retires, the sync section shows no link
   block, and no Rust test connects with one. Ticket 06 met this criterion on 2026-09-15 and
   ticket 12 removed what it showed.*
5. [[rules/credentials]] and [[contexts/desktop/organization]] each carry one paragraph on
   what a link carries and what it is worth, and 826's requirement 10 and *Link* entry carry a
   dated correction pointing here.
6. The members section's test finds the sentence under the legend, the invite control before
   the first row, and every act of 826's requirement 15 reachable on a row without a hover,
   gated as before; the same test with a member session finds the section absent as before.
   *Superseded 2026-09-16 by criterion 19 with requirement 6: cards in a directory, not rows.*
7. The workspaces section's test finds the sentence, the create control before the first row
   for an owner holding the authority and the refusal for one who does not, every act
   reachable without a hover, and the transfer beneath under the open workspace's name.
   *Superseded 2026-09-16 by criterion 21 with requirement 7.*
8. The you section's test finds no password field until the change control is pressed, then
   the shared form surface with the three fields and the floor sentence; and finds the
   second-machine control, which on press shows a link with one copy control and a code with
   none. *The second clause superseded 2026-09-16 by criterion 20 with requirement 8: the you
   section offers no link act; the password half stands and is met.*
9. The workspace menu's test finds the header, the switch rows with the open one marked, and
   one row to the workspaces section, and finds no invite row, no create row and no refusal
   sentence.
10. The account menu's tests, signed in and signed out, find the sign-in and sign-out rows
    carrying the same class as the settings row; the locale tests find both strings lowercase.
11. A Rust test decodes a link in the previous shape and gets the refusal a non-link gets.
12. The component and Rust tests above exist and pass in the integration gate; the Arabic
    locale test finds no English string under an Arabic key; a changeset is on the branch.
13. The first screen's test, with no organization held, finds two controls, one leading to the
    account walk and one to the link form, and the sentence under each saying what it needs;
    neither names a group, a database or a consent.
14. A Rust test consents over a group holding an organization, connects with the owner's
    username and password on a machine holding nothing, and finds the machine holding the
    organization with the owner signed in and every grant renewed; the same with an
    administrator's password is refused by name and leaves the machine holding nothing; the
    same while an owner's or an administrator's machine was seen within seven days is refused by
    name; a group holding nothing still creates. The walk's test drives the consent to the
    connect-existing step on a held group and to the name step on an empty one.
15. A Rust test connects, signs in, signs out and disconnects a machine and reads the registry
    after each: a row with no member, the member, no member, no row; a row seen eight days ago
    does not count as connected and one seen six days ago does; the rows are read and written
    with no signature.
16. No Rust source mints, stores or reads a never-expiring credential, `link_credential_sealed`
    is not a column, `JoinLink` has no clear credential and no link decodes without a half; the
    sync section's test finds no link block for the owner; the connect screen's test finds no
    code-free path; 826's requirement 10 and the *Link* entries carry a second dated correction.
17. The connect screen's test finds the link field and the code field on one form before any
    link is read; an invitation link then shows the two password fields; a machine link connects
    with no further field; an unreadable link marks the link field and a wrong code marks the
    code field.
18. A Rust test deletes an organization as the owner with the password: every workspace database
    and the organization database are deleted on the platform with the deletion intent naming
    the owner's act, and the machine holds nothing after; an administrator is refused. A second
    machine holding the deleted organization forgets it at its next launch. The sync section's
    test finds the delete control for the owner and not for an administrator, and the
    confirmation on the form surface naming what goes.
19. The members section's test, with an administrator session, finds one record card per
    account with its standing, the add control in the tray above the cards, and every act of
    requirement 19 lists present or absent on the card's menu by the same gates (*corrected
    2026-09-16 at converge: this said every act of 826's requirement 15, which names revoke and
    copy link; requirement 19's menu leaves both out, a fresh link superseding a stale one and a
    reset resealing the vault, and the human accepted the menu on 2026-09-16*); the owner's
    card offers an administrator nothing and the owner the transfer alone; a reader's own card
    offers nothing; a member session finds no section. A Rust test makes an account with no
    password and finds it refused at the wall until its first link is opened.
20. A Rust test makes a link for an account whose password is not yet set, opens it with the
    code on a second store, chooses a password and lands signed in; makes one for an account
    with a password and no machine signed in, opens it and lands at the wall where the
    password admits; is refused making one for an account with a password and a machine signed
    in, and offered one for an account whose password is not set even while a machine is signed
    in; resets a password and finds the next link asking for a new one; and finds a link refused on a second
    opening and after seven days. The connect screen's test shows the choose-password fields
    for the first kind and the wall for the second. The you section's test finds no link act.
21. The workspaces section's test finds one card per workspace with its facts, the create
    control in the tray for an owner holding the authority and the refusal for one who does
    not, rename, members and delete on the card's menu by their gates, and the transfer
    beneath under the open workspace's name.
22. A Rust test offers ownership to an administrator whose password is set and is refused for
    one whose is not and for a non-owner; the offered member accepts on a second store with their
    password and every row and certificate verifies under the new key, the organization row
    carries it, and the roles are swapped; a third store holding the old key follows the
    succession and verifies every row; the new owner connects a fresh machine with the account by
    their password alone; the founder is refused as an administrator; a seal planted on the row
    opens nothing on acceptance. The members section's test finds the offer and its withdrawal on
    the owner's card; the you section's test finds the acceptance for the offered member and the
    authority sentence for a new owner holding none. *Rewritten 2026-09-16 at the review with
    requirement 22.*
23. The members section's test opens a member's card and finds one surface with three
    sections: the role chooser with a sentence per role; the also-allowed list for a member
    with a sentence per act and a chooser that adds one, absent for an administrator; the
    workspaces rows with a named level and its sentence; a save that writes the role, the
    widening and the grants through the acts 826 built and refuses what they refuse; the
    menu without change-role and workspaces entries; the tray's control opening the read-only
    role table. The owner's card and the reader's own still open no edit. Both locales carry
    every sentence, the Arabic written.
24. The settings area's test finds four sections named general, account, organization and
    workspaces, each holding the blocks the requirement lists and none of the others; an
    address naming a retired section opens the section that holds it; a member session finds
    the organization section with no members directory and no account block; the rail's
    workspaces row leads to the workspaces section; both locales carry the four names.
25. The organization section's test finds the sync block stating one sentence for each
    standing (up to date with a relative moment, reached once with its moment, and the three
    that need something, each with its control), one control named "sync", no badge and the
    word "sync" on no element but the control; a Rust test finds the moment of the last replication that
    went through recorded on the machine and answered in the state, and absent before any went.

# Constraints

- **The password and the keys never cross the IPC boundary** ([[rules/credentials]], *Client
  boundary*). The code is typed on one side and the unsealing happens in Rust; what crosses
  is the link's text, the code and facts.
- **A code is a key half, never a check.** 826's requirement 23 argued why once, and a
  second code that merely gates a screen would put a lock on the door and leave the wall
  down.
- **Only the owner's machine mints.** A member's link carries what their vault already holds;
  nothing here seals the Turso authority into anybody's vault (826, requirement 5). Connecting
  to an existing organization mints on the owner's own consent, which is the same rule.
- **Only the owner's password re-derives the organization's key**, and that key is the trust
  anchor a machine connected by the account verifies against; the key a row carries is compared
  and never trusted (826, requirement 6).
- **A delete on the platform is one of a fixed set of reasons** ([[references/turso]], *Never
  run*): the owner deleting the organization in the interface joins the two that exist, as a
  variant of the same type.
- **A write takes the shared form surface** ([[rules/interface]], *Form surface*), which is
  what requirement 8 restores rather than introduces.
- **The look is judged on the real organization.** Every reshaped section is checked against
  real rows before it is accepted, never against mock data.
- **No architecture here.** How the sealed credential is laid out in the link, what the
  second-machine row is, and what shape the members row takes are the plan's.

# Out of Scope

- **An administrator connecting to an existing organization with the account.** Only the owner
  holds the consent and only the owner's password re-derives the key; an administrator whose
  every machine is gone asks the owner for a reset. *This entry replaced, 2026-09-15, the one
  that put restoring from the consent out of scope; the human brought it in when they found
  their own organization unreachable.*
- **A registry that lists machines or acts on one**: no list of machines in the settings area,
  no signing a machine out by name. *Corrected 2026-09-16: this said nothing but the
  connect-existing gate reads it; the members directory reads it for an account's standing.*
- **A clock-based code**, in the style of an authenticator: the joining machine would have
  to hold the secret the code is derived from, which is the thing being protected.
- **An administrator making or viewing a second-machine code for a member.** A reset exists
  for a member who lost every machine, and a member with a machine makes their own.
  *Withdrawn 2026-09-16 by requirement 20: the owner or an administrator makes every link from
  the account's card, and a member makes none.*
- **Sessions that expire on their own**, as 826 left them.
- **New acts, new roles or new access levels.** Every act a section offers is one 826 built.
  *Corrected 2026-09-16: requirement 22 adds one act, the transfer of ownership, and
  requirement 19 one, making an account before its link; both at the human's word.*
- **Moving the Turso account.** A transfer of ownership moves the organization's key and not
  the account the databases live on; who holds the Turso account is settled outside the
  application.
- **Casing anywhere but the two rail menus.** Buttons and legends across the application are
  lowercase by convention and are not touched.

# Assumptions

- Nothing is published, so a link in the previous shape has no holder to migrate
  (requirement 11); 826's requirement 19 assumed the same.
- The Argon2id cost the invited vault is sealed at makes thirty-two to the sixth guesses
  slow enough; 826 accepted the figure and nothing here re-argues it.
- "Capitalize" means the CSS treatment the settings row already carries, not a change to the
  strings.

# Risks

- **The organization's own link is still a never-expiring credential**, now in one person's
  hands rather than in every member's chat. *Superseded 2026-09-15 by requirement 16: the link
  retires and no never-expiring credential is minted. Corrected the same day by
  [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/evidence/research/what-a-consent-alone-can-recover]]:
  this said a lock-out rotates the organization database; nothing in the repository rotates it,
  a lock-out rotates workspace databases alone.*
- **The registry of connected machines is unsigned and time-bounded.** A rewritten row could
  hold the owner's way in shut for seven days, or open it while a machine is connected; either
  way the password and the consent still stand between anybody and the organization, so the
  registry gates convenience and never authority. A machine that died holding the organization
  blocks the owner for a week.
- **A transferred ownership without the authority.** Until the new owner reconnects the
  authority, renewal and minting run on the founder's machine or not at all; grants lapse in
  four weeks. The sync section says so on the new owner's machine.
- **A holder of `resetPassword` without `inviteMember` can take a password away and cannot
  hand out the link that restores it.** *Found 2026-09-16 at converge.* Owners and
  administrators hold both by role, so the default roles are unaffected; a plain member widened
  with one and not the other is. Recorded, not changed: whether the link act should also follow
  `resetPassword` is the human's call. *Struck 2026-09-16: the human's call is that it does. The
  link act is held to `inviteMember` or `resetPassword`, in `invite::make_link` and in the router,
  so whoever may take a password away may hand back the link that gives one. No default role
  moves, and there is no longer a widening that locks somebody out with no way to let them in.*
- **Deleting the organization is irreversible on the platform.** The confirmation says so and
  takes the password; delete protection is lifted per database as the platform port already
  does for a workspace.
- **A second-machine link near the end of a four-week grant** connects a machine whose first
  read may lapse before the owner's machine renews; the sign-in that follows opens the vault,
  which holds the renewed one, so the window is the connect itself. The plan says how it is
  handled.
- **The row that spends a second-machine link is unsigned**, like the session epoch, because
  a plain member signs nothing. *Added 2026-09-15 at the plan.* A rewritten row reopens a
  spent link on one more machine, which lands at the wall where the password still admits;
  it gates availability and never authority.
- **Reshaping three sections at once** is where a look drifts; judging each on real rows is
  the guard, and a section can land on its own commit.
