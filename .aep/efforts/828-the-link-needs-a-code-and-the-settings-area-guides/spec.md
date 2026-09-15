---
status: draft
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

# Goal

**A link alone opens nothing, and the settings area reads as the one place accounts,
workspaces and your own way in are kept.**

Whoever finds a link, of any kind, weeks later, reads nothing with it: what it carries is
sealed under a code somebody read out, and the credential inside it lapses on its own. A
member connects their own next machine without asking anybody. The members and workspaces
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
   makes a person setting up a laptop call somebody, and over both.*
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
   rows.
7. **The workspaces section says what it is for, and every act is visible.** One sentence
   under the legend; new workspace leads the section for the owner holding the authority,
   and the refusal sentence stands in its place for an owner whose machine lost it; a row
   still says the name, whether it is the open one, the access this reader holds and how many
   people hold it; rename, members and delete are reachable without hovering. Export and
   import stay beneath, under the legend naming the open workspace. Otherwise 826's
   requirement 16 holds.
8. **The you section states facts and offers its writes on the form surface.** The identity
   block stays. The password is a row saying what it is, with a change-password control that
   opens the shared form surface carrying the current form's three fields and its floor
   sentence; nothing about the password is drawn until the person asks to change it. The
   other-machines act stays as it is. The second-machine act of requirement 3 joins them,
   under its own heading, and the link and code it produces are shown the way an invitation's
   are: the link with one copy control, the code large and with none, and the date the pair
   lapses.

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
    describes the user-visible change.

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
4. The sync section, for the owner, still shows the organization link under a sentence that
   names it as the recovery copy and points a member to their you section; for anybody else
   the block is absent. A Rust test connects a machine with it and no code.
5. [[rules/credentials]] and [[contexts/desktop/organization]] each carry one paragraph on
   what a link carries and what it is worth, and 826's requirement 10 and *Link* entry carry a
   dated correction pointing here.
6. The members section's test finds the sentence under the legend, the invite control before
   the first row, and every act of 826's requirement 15 reachable on a row without a hover,
   gated as before; the same test with a member session finds the section absent as before.
7. The workspaces section's test finds the sentence, the create control before the first row
   for an owner holding the authority and the refusal for one who does not, every act
   reachable without a hover, and the transfer beneath under the open workspace's name.
8. The you section's test finds no password field until the change control is pressed, then
   the shared form surface with the three fields and the floor sentence; and finds the
   second-machine control, which on press shows a link with one copy control and a code with
   none.
9. The workspace menu's test finds the header, the switch rows with the open one marked, and
   one row to the workspaces section, and finds no invite row, no create row and no refusal
   sentence.
10. The account menu's tests, signed in and signed out, find the sign-in and sign-out rows
    carrying the same class as the settings row; the locale tests find both strings lowercase.
11. A Rust test decodes a link in the previous shape and gets the refusal a non-link gets.
12. The component and Rust tests above exist and pass in the integration gate; the Arabic
    locale test finds no English string under an Arabic key; a changeset is on the branch.

# Constraints

- **The password and the keys never cross the IPC boundary** ([[rules/credentials]], *Client
  boundary*). The code is typed on one side and the unsealing happens in Rust; what crosses
  is the link's text, the code and facts.
- **A code is a key half, never a check.** 826's requirement 23 argued why once, and a
  second code that merely gates a screen would put a lock on the door and leave the wall
  down.
- **Only the owner's machine mints.** A member's link carries what their vault already holds;
  nothing here seals the Turso authority into anybody's vault (826, requirement 5).
- **A write takes the shared form surface** ([[rules/interface]], *Form surface*), which is
  what requirement 8 restores rather than introduces.
- **The look is judged on the real organization.** Every reshaped section is checked against
  real rows before it is accepted, never against mock data.
- **No architecture here.** How the sealed credential is laid out in the link, what the
  second-machine row is, and what shape the members row takes are the plan's.

# Out of Scope

- **Retiring the organization's own link and restoring the organization from the Turso
  consent alone.** It would close the last never-expiring credential, and it is the next step
  if the owner's one copy is judged a risk worth the work; it needs the first run to
  recognise an organization already in the group and rebuild the machine from the consent.
  Recorded here so it is not re-argued from scratch.
- **A clock-based code**, in the style of an authenticator: the joining machine would have
  to hold the secret the code is derived from, which is the thing being protected.
- **An administrator making or viewing a second-machine code for a member.** A reset exists
  for a member who lost every machine, and a member with a machine makes their own.
- **Sessions that expire on their own**, as 826 left them.
- **New acts, new roles or new access levels.** Every act a section offers is one 826 built.
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
  hands rather than in every member's chat. A leak of that copy exposes the directory as
  before, until a lock-out rotates the database. The sentence beside it says so.
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
