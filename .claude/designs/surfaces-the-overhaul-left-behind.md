---
owner: repository
status: accepted
sources:
  - src/routes/settings/
  - src/lib/settings/
  - src/lib/layout/component/
  - src/lib/sync/component/
  - src/routes/+error.svelte
---

# feat: rebuild the surfaces the overhaul left behind

## Problem

The interface overhaul cut twelve tickets for the five lists, the shell and the data layer,
and one more for the dashboard. Four surfaces carry no ticket at all, and they are not
leftovers — they are the application talking about itself rather than doing its job:
settings, the four states the window shows before the application is usable, the conflict
question, and the route error boundary. When the card grid dies they are what is left
wearing the old surface.

Three faults, none of them cosmetic.

**Six surfaces are one surface, written six times.** Startup loading, startup error, startup
recovery, the workspace choice, and settings' own loading and error branches are each a
centred card with a title, a description, a body and one or two actions. All six open with
the same centring wrapper and then disagree on width — one narrow, three wide, chosen
independently. The route error boundary is the seventh instance and has none of it: an
unstyled heading printing a status code and a message, with no retry, no way back, and no
locale. It is the surface a user meets when something has gone wrong in a way nothing
anticipated, and it is the least finished thing in the application.

**Settings is a card grid** — the shape being deleted everywhere else. Four tiles across the
top, then a two-column grid of five cards whose sizes are not comparable: one is forty
lines, another is six hundred and fifty.

**The same facts are stated three times.** The tile strip carries the version, the workspace,
the latest snapshot and the locale; every one of those is stated again by the section below
it that owns it. Inside the sync card the Drive usage figures appear in an inset tile and
again in the column beside it, sixty lines apart. Nothing is telling the user anything the
second or third time.

## Goal

Every surface the application shows about itself reads as one thing: settings as a column of
plain rows, and everything the application shows when it cannot yet show the application as a
single shared surface — including the one error boundary that currently shows nothing at all.

## Constraints

- **[ADR 0013](../decisions/0013-list-presentation-is-per-concept.md) does not reach here.**
  It says a list takes the shape its data has. These surfaces have no data of their own, so
  the reasoning that made five lists diverge does not apply to them, and this spec takes the
  opposite direction deliberately — [ADR 0015](../decisions/0015-the-applications-own-surfaces-converge.md).
- **The generated primitives stay a permanent fork** ([ADR 0007](../decisions/0007-rhea-geometry-is-hand-ported.md)).
  Everything below is built from families already installed; nothing is generated, so the
  operation ADR 0007 forbids is not approached.
- **Arabic is first-class.** Three of these surfaces become new layouts rather than restyled
  ones, so direction is checked per ticket and inherited from nothing.
- Supported window range 640×480 upward, and the column-collapse machinery that used to serve
  the narrow end has been deleted. Every row has to hold at 640px on its own.
- **The pending conflict keeps its single owner.** Three sources raise it and every screen
  that can present one presents the same one — a boundary in the remote-sync Context, and
  nothing here moves it.

## Architecture

**One shared standalone surface, in the design system.** It takes a title, a description, a
body snippet and its actions, and it owns the centring, the one width, and the geometry. The
four startup states, settings' own load failure and the route error boundary all render
through it. The seam is the body snippet: everything around it is identical for all six, and
what crosses it is whatever that particular surface has to say.

**Settings is rows, not cards.** The `field` family is a label, a description and a control,
which is what four of the five settings are; the `item` family is a media slot, content and
trailing actions, which is what the workspace is. `separator` divides the groups. All three
are installed and none is used for this today. Four groups in order — general, workspace,
updates, diagnostics — with the version moving into updates where it is already stated, and
the tile strip deleted rather than restyled.

**The conflict panel decides its kind once.** Four kinds are currently resolved by six
parallel ladders inside the panel, and two of them are resolved a seventh time by a nested
ternary in the startup host's header. One table keyed by kind replaces all of it, and the
host reads the same table rather than its own copy.

Where a conflict is presented does not move, and the rule is worth stating because it looks
arbitrary otherwise: at startup it fills the standalone surface, because the application is
not usable until it is answered; in settings it stays inline, because the application is.

## Approach

The shared surface first, because settings' own failure branch consumes it and because it is
the ticket that makes the route error boundary stop being a stub. Then settings' four plain
groups, which are mechanical once the row vocabulary exists. The workspace and sync section
goes last and alone: it is six hundred and fifty lines, it hosts the conflict, and it is the
one section that is not a row.

The risk that killed the uniform list table is the risk here too, so it is handled the same
way — each ticket puts its surface on screen against real state before it is committed,
rather than being judged from a description.

Rejected, so they are not proposed again:

- **Restyling the seven surfaces in place.** Smallest diff, and it keeps three independently
  chosen widths that already disagree, leaves the route boundary unstyled or gives it an
  eighth copy, and re-creates the drift by construction.
- **Converging only the four startup states.** Leaves the two surfaces a confused user is
  likeliest to reach — settings failed to load, and an unhandled route error — off the
  pattern, which reads as an inconsistency rather than a scope line.
- **A settings navigation with a detail pane.** The conventional desktop shape, and it puts a
  third navigation level inside a shell that already has a sidebar and a palette; at 640px it
  needs exactly the collapse machinery this overhaul deleted.
- **Splitting settings into sidebar destinations.** Removes the second navigation level at the
  price of promoting things touched monthly into the list of things touched hourly.
- **One ticket for all of settings.** Twelve hundred lines with the whole Drive surface inside
  it, and a rejected sync section would hold back four finished groups.

### The tickets

| # | Ticket | Blocked by | Carries |
| --- | --- | --- | --- |
| 01 | feat: build the standalone surface | — | the block; four startup states; the route error boundary; the conflict panel's kind table |
| 02 | feat: rebuild settings as one column of rows | 01 | the tile strip deleted; general, updates and diagnostics; settings' own load failure onto the block |
| 03 | feat: reshape the workspace and sync section | 02 | the workspace as an item; the duplicated figures removed; the conflict inline |

## Acceptance criteria

- Startup loading, startup error, startup recovery, the workspace choice, a settings load
  failure and an unhandled route error all present as the same surface, at the same width.
- An unhandled route error is readable in the user's language and offers a way back.
- No card and no tile strip remains in settings, and no figure is stated twice on the page.
- Every conflict kind shows the same title, description and actions whichever screen raises
  it.
- Every surface holds from 640×480 upward with no horizontal scrollbar, in English and in
  Arabic.
- The version, the workspace name, the latest snapshot and the locale each appear once.

## Risks

- **The single column fails by eye once the workspace section is in it.** The same failure the
  uniform list table had, detected the same way: ticket 03 ends with the page on screen against
  a linked workspace before it is committed. If it fails, the fix is a second column at wide
  widths, not a second navigation level.
- **The shared surface grows a prop per caller.** Six callers with one snippet between them is
  the claim; a fifth or sixth prop appearing to serve one caller is the signal the seam was
  wrong, and it goes back to design rather than into a flag.
- **The workspace choice may not fit behind a body snippet.** It is the largest of the six and
  the only one that is interactive rather than informational. It is built first, inside ticket
  01, so this is found out while the block can still change shape.

## Out of scope

- **The Drive flows themselves.** Linking, unlinking, resolving and the queue behind them are
  untouched; only how they are presented moves. This is the overhaul's own boundary, unchanged.
- **The forms.** The contract form's internal layout stays on the map's *Not yet specified*.
- **The domain model**, and the three open triage issues about the shell.
