---
status: draft
---

# Problem

The human asked on 2026-10-07 what happens when an organization is opened on an updated version
of rentable and older versions then try to open it, above all once the database has been
migrated, and whether the person should be required to update, offered it, and taken to a page
that does it.

Today the data moves forward on its own, and whoever is behind is stopped with no way out. The
trace is in this effort's evidence, read against the code at faafc3a5:

- **The data is upgraded by whoever happens to update first.** A workspace is migrated the first
  time a full-access member opens it on a newer build, and the organization's format the first
  time its owner signs in on one. Nobody chooses it, and nobody is told who it will stop.
- **Any upgrade stops every older build.** Each database carries one number, and a build refuses
  any number above its own (`organization/store/format.rs`, `organization/lease/mod.rs`), so even
  a migration that only adds a column, which `[[rules/migrations]]` already requires to be safe for
  older builds, takes them all off the data.
- **An organization made newer is never explained at launch.** The refusal is swallowed at resume
  (`organization/session/replica.rs`, the `notResumed` arm) and the person meets the ordinary
  sign-in wall with no reason. The sentence appears only after they type their password, and
  nothing on the wall updates the app.
- **A workspace made newer stops the whole app.** Launch, sign-in and switching all land on the
  generic "rentable could not finish starting" screen, which does not draw the reason
  (`startup/component/root.svelte`); retry reopens the same workspace and fails again, and from
  there no other workspace, no settings and no update can be reached.
- **A running app never notices.** Nothing re-reads the format or the schema after a pull; reads
  fail with generic errors, and the session's own heartbeat and sign-in paths can write into a
  replica already in a newer format.
- **Joining by link shows the sentence with no way to act on it.**
- **Updates are manual only.** The one check is a button in Settings > General, which none of
  the screens above can reach.

What it costs: one member updating can stop every other member's work without anybody having
decided it, and those stopped are told nothing they can act on.

# Goal

Anyone can update rentable to the latest version at any time and keep working with every
organization and workspace they belong to. Upgrading an organization's or a workspace's data is a
deliberate act by its owner, who is shown beforehand which machines it would stop. A machine that
is behind keeps as much of its work as it safely can, is told why in plain words, and can update
from wherever it stands.

# Scope

- Opening data that has not been upgraded: a newer build works on it as it is.
- The explicit upgrade of an organization and of a workspace, by the owner, with who is behind.
- What each machine can read and write, recorded in the organization.
- What an older build meets: full use, read-only, or the update screen, at launch, at sign-in,
  on switching, on joining, and mid-session.
- Updating the app: checks, background download, install, and the update action wherever a
  person is held.
- Existing organizations and workspaces carried into all of this with their data intact.

# Requirements

1. **A newer build opens data that has not been upgraded, as it is, and upgrades nothing on its
   own.** No organization format step and no workspace migration runs without the owner's
   upgrade (requirement 3). A capability that needs the newer data is offered with the reason it
   is unavailable, never hidden and never failing as a generic error.
2. **Every format step and migration declares the oldest version that can still read the result
   and the oldest that can still write to it, and the database records both beside its version.**
   A step that only adds, and changes the meaning of nothing an older build reads or writes,
   leaves both where they were. A build is refused writing only below the write floor and refused
   reading only below the read floor, never merely for being below the version.
3. **Upgrading is an explicit act, and the owner's alone.** The organization and each workspace
   show that an upgrade is available. The owner, and nobody else, can start it; no member, manager
   or custom role can, and no permission override grants it. Before it runs the owner sees what
   it adds or changes, and every machine seen in the last seven days that would be stopped or made
   read-only by it, by member and machine name and the version it runs, and separately the
   machines not seen within that window, with the date each was last seen. The owner can upgrade
   now or not yet.
4. **Each machine records, in the organization, the data versions it can read and write and the
   version of rentable it runs**, refreshed whenever that changes and with when it was last seen.
5. **An upgrade runs whole or not at all, with nobody else writing while it runs**, and keeps the
   copy, the check against a fresh database of that version, and the refusal-before-any-write that
   effort 838 established.
6. **A machine at or above the read floor but below the write floor works read-only.** It can open
   and read everything it held, every create, edit and delete is refused with the reason, and a
   standing notice says it must update to make changes, with the update action in it.
7. **A machine below the read floor meets the update screen**, in place of the organization or
   the workspace, which says in the person's language that this organization or workspace was
   upgraded by a newer rentable, carries the update action, and still lets them switch to another
   organization or workspace they hold.
8. **The reason is shown wherever a person is held**, at launch, resume, sign-in, switching
   workspace and joining by link or invitation. No refusal of an organization or workspace for its
   version is swallowed, reported only to diagnostics, or drawn as the generic startup error, and
   retrying never loops on the same refusal.
9. **A running app re-reads the floors after every pull** and moves to read-only (requirement 6)
   or the update screen (requirement 7) as soon as a pull brings a raise, before anything else is
   written. Nothing this build writes reaches data whose write floor it is below.
10. **Changes this machine has not sent when it is stopped are kept**, and sent once it has
    updated, or the person is told plainly what cannot be sent and asked before anything is
    dropped.
11. **The update action works from where the person is held.** It checks for a release, downloads
    it, installs it and restarts into it, in the same control as the Updates card in Settings, and
    says plainly when no release is reachable (offline) or none exists yet.
12. **The app checks for updates at launch and whenever it is held by a version**, downloads a
    release in the background, and offers to restart into it without interrupting work; a release
    downloaded and not yet installed is installed at the next restart or quit.
13. **Existing organizations and workspaces carry across with their data intact.** Data from
    before this effort reads as having floors equal to its current version, members keep working
    without setting anything up again, and no organization or workspace is reset (`the app has
    users`).

# Acceptance Criteria

1. A test opens a workspace one migration behind and an organization one format behind on the
   current build, as a member and as the owner: each opens read-write, its version is unchanged
   afterwards, and a capability that needs the newer data shows its unavailable reason.
2. A test per shipped step asserts the declared read and write floors, and that a step adding a
   nullable or defaulted column leaves both floors unchanged. A test opens a database with each
   build's known version below, at and above the floors and gets read-write, read-only and the
   update screen exactly where the floors say.
3. A test offers the upgrade to the owner and refuses it, through the router and the IPC command,
   to a manager, a member, a custom role and a member whose override sets every flag. A component
   test shows the upgrade sheet listing a machine seen within seven days whose recorded write
   version is below the new floor, by member name, machine name and rentable version, and an older
   machine under a separate "not seen since" heading with its date; choosing not yet changes
   nothing.
4. A test signs in on two machines of different builds and reads, from the organization, each
   machine's readable and writable versions, its rentable version and when it was last seen;
   updating one build changes its row on the next launch.
5. A test fails an upgrade partway, on a workspace and on an organization, and finds the version,
   both floors and every table as before, a copy written, and a second machine's write during the
   upgrade refused or held until it ends.
6. A test raises the write floor above a machine's version: reads succeed, every create, edit and
   delete through the routers is refused with the read-only reason, and the shell shows the
   read-only notice with the update action.
7. A test raises the read floor above a machine's version at launch, at sign-in, on switching and
   on joining: each shows the update screen with the sentence in Arabic and English and the
   update action, and switching to another organization and to another workspace from it works.
8. Route or component tests for launch, resume, sign-in, switch and join with a newer
   organization and a newer workspace find the version reason drawn on the screen the person is
   on, never the generic startup error, and a retry that meets the same refusal stays on that
   screen.
9. A test pulls a floor raise into a running session and finds the app read-only or on the update
   screen before the next heartbeat writes, and nothing written into the replica after the pull.
10. A test holds unsent changes on a machine whose floors are then raised, updates it, and finds
    the changes sent; where a change cannot be sent, the person is asked before it is dropped.
11. A component test drives the update action on the update screen and on the read-only notice
    through check, download, install and restart against a mocked updater, and through no release
    and offline, each with its own sentence.
12. A test starts the app with a release available: it checks at launch with no press, downloads
    in the background, offers the restart, and installs at the next restart or quit when the
    offer is ignored.
13. A test seeds an organization and a workspace at every version shipped since 0.14.0
    (`[[rules/migrations]]`), opens each on the new build as the owner and as a member, and finds
    every row intact, both floors equal to the version, and no setup step asked for.

# Constraints

- **Add before you remove** (`[[rules/migrations]]`) still binds; the floors make it pay off
  rather than replace it. A step that removes or renames anything an older build uses raises the
  floors, and ships no earlier than the rule allows.
- **A shipped migration or format step is never edited**, so floors for steps already shipped
  are declared beside them, not written into them.
- **The owner alone upgrades**, because an upgrade can stop other people's work, and the human
  ruled on 2026-10-07 that an ordinary member must never be able to do that.
- **Nothing an older build writes may reach data it cannot write correctly**; read-only is
  enforced where writes cross into the engine, not only in the interface.
- **The organization's format walk needs the owner's keys** (effort 838), so its upgrade runs on
  the owner's machine.
- **Every sentence a held person reads exists in Arabic and English.**
- **No organization or workspace is reset and nobody sets up again** to reach this effort's state.

# Out of Scope

- **A minimum version or deadline published in the release manifest** (the research's option E).
  Useful for retiring very old builds on the developer's schedule; not needed to stop members
  locking each other out.
- **Holding an upgrade automatically until every machine can read it** (the research's design 3).
  The human chose a deliberate act.
- **Downgrading data**, or translating newer data back for an older build. An older build is
  read-only or updates.
- **Restoring a copy taken before an upgrade.** The copies keep being written; putting one back
  over a replicated database is its own effort.
- **Carrying data more than one version behind read-write if the plan finds the cost too high.**
  How far back a build supports is the plan's call (Open Questions); beyond it the owner upgrades.
- **Changing what each role may do otherwise.** No other permission moves.
- **Making the workspace migration runner atomic**, gap 1 of the 838 research, except where this
  effort's own whole-or-nothing requirement 5 needs it.

# Assumptions

- Each build can tell, from the numbers alone, whether it may read or write; no capability list
  per feature is needed. The research found capability lists (Git, Mercurial) buy finer gating at
  a cost this app does not yet need.
- Inserts an older build makes against a newer additive schema succeed when every added column is
  nullable or defaulted. Not yet tested against a seeded workspace (the research's Not checked).
- Seven days is the right window for "seen recently", taken from the existing machine presence
  window rather than chosen afresh.
- The Tauri updater can download without installing and install at quit on Windows; the research
  found no documentation of install-on-quit and did not try it.

# Open Questions

- **How many data versions back a build supports read-write**, and what that costs per release:
  the research estimates one to three days per additive release for one version back, from a grep
  rather than a prototype. The plan decides, with a prototype if a seeded workspace one version
  back does not settle it.
- **What exactly the owner sees as "what it adds or changes"** for each step, and where that text
  is written.

# Risks

- **A step judged additive that changes meaning** lets an older build write wrong data without
  any refusal; the research found two recent steps (`direction`, `workspace_override`) of this
  kind. It would show up as wrong figures on an older machine after an upgrade.
- **Read-only is new behaviour on every write surface**; a surface that misses it shows as an
  older machine that can still edit, or one that fails with a generic error.
- **Machines that never ran a recording build show as unknown**, and an owner may upgrade past
  them; they then meet the update screen, which this effort makes clear rather than silent.
- **An offline machine below the read floor cannot fetch the update**; it stays on the update
  screen until it is online, with the reason shown.
