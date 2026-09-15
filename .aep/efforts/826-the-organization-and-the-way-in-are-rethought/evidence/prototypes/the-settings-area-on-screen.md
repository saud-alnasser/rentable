---

---

# What do the settings area's rail, a members row and the invite result look like, on this organization?

Verified against: Svelte 5 / SvelteKit 2, Tauri 2, `@rentable/design` primitives, in the running
desktop application against the human's own organization, 2026-09-13

Conclusion: **the rail is tabs above the body, the row is two lines with chips, the pending mark is the badge, the invite result is the callout panel.** Three of the four hypotheses were refuted by looking.

Consumed: [[rules/interface]], under *The visual reference* and *Form surface*;
[[rules/module-layout]], under *Prototype code*; [[skills/prototype/ui]].

Three things the spec describes in prose and nobody has looked at: requirement 14's rail of seven
sections, requirement 15's members row, and requirement 8's invite result. The effort's constraint
*Looks are settled on screen, on real data* says they are settled here rather than in tickets 09,
10 and 11, because 824's history is one slot and one row set added and withdrawn after being seen.

Four switchers, on the existing `/settings` route, inside the real shell, against the real
organization.

## Hypothesis

`plan.md` already made three calls in prose, and each is the thing this exists to test:

1. **The rail is a vertical list in the sidebar menu button style**, so the settings area's
   section control reads as the application's own rail rather than as a second navigation
   vocabulary. Vertical `Tabs` was rejected on the argument that tab semantics say *same page,
   other view* where these are seven pages sharing a frame. That is an argument about a look, and
   an argument about a look is settled by looking.
2. **Requirement 15's row carries five things and five actions**, and the expectation is that it
   still reads as a row. The organization page today carries three actions on a line and the spec
   adds two more, so the shape most likely to fail is the one closest to what exists.
3. **The invite result panel gets better as it loses things.** It carries three strings today, a
   link, a username and a generated password, each with its own copy control; requirement 8 leaves
   one. The expectation is that once there is one thing to hand over, the panel should stop being a
   list of fields and start being a sentence.

A fourth, smaller, is that the **pending mark wants to be quiet**. A pending row is a row like any
other and the mark says only that this person has not arrived yet, so the badge treatment the
organization page uses today may be louder than what it says.

## Falsifier

- **The rail.** If the vertical list reads as a second sidebar competing with the shell's own, or
  if seven items in a column look like a page of navigation rather than a control, the list is
  wrong and the tabs or the groundless variant takes it.
- **The row.** If the five actions push the identity off the line, or the workspaces with their
  access cannot be read at a glance, the single-line row is wrong however close it is to what
  exists.
- **The panel.** If the one-link panel reads as thinner rather than simpler, or if losing the
  warning callout loses the sentence that rentable cannot send it, the reduction is wrong and the
  callout panel stays.
- **The pending mark.** If the quiet treatments make a pending row indistinguishable from an
  active one at a glance, the badge is right and the argument above is wrong.

## Experiment

`apps/desktop/src/lib/prototype/settings-area/`, untracked, mounted on `/settings` under `dev` by a
temporary edit to `routes/settings/+page.svelte`. Inside the shell rather than on a route of its
own: the rail is being judged against the real sidebar beside it and the row against the real
member list, and an empty route hides exactly what a populated one exposes.

Opened with, from the worktree's `apps/desktop`:

```
node ./scripts/prototype.mjs /settings
```

which is what `pnpm prototype /settings` runs. `pnpm` itself cannot run a script from this
worktree: its task-run-state file lands past Windows' 260-character path limit at this depth and
`LongPathsEnabled` is `0` on this machine.

### What is real, and what is a stand-in

| Real, from the organization's own queries | A stand-in, because no command answers it yet |
| --- | --- |
| the organization's name, and the reader's username and role | the per-member access level on a workspace, on every row but the reader's own (`organization_members` answers `workspaceIds` and no access; `MemberFacts.workspaces` is ticket 09's) |
| every member, their username, role and workspace ids | the invitation link's new shape (ticket 03); the owner's real organization link is used as the base so the length is right, with a stand-in invitation half appended |
| every workspace and its name; the reader's own access on each | a pending row, **only where the organization holds no open invitation** |
| every invitation and its expiry | |

The screen says which of the last two are in force, on a dashed line under the title, so nothing
invented is judged as though it were real.

### The four switchers

Each mounts only while its subject is on screen, so at most three bars are ever up at once.

**`rail`**, always up:

| | The section control is |
| --- | --- |
| `sidebar rows` | the plan's: a fixed-width column of `sidebarMenuButtonVariants` rows, the current one filled with the sidebar accent, a rule between the rail and the body |
| `tabs above` | what the plan rejected in prose: seven horizontal items over a full-width body, the current one underlined |
| `no ground, accent` | the column with no background and no rule of its own, inactive items softened, the current one carried by an accent bar at its start edge and by weight. _Refactoring UI_, *Emphasize by de-emphasizing* (47), which names a sidebar competing with the content area and answers it by taking the background off, and *Add color with accent borders* (225), which names an active navigation item as one of the four things an accent bar is for |

No variant reorders the seven or drops one: the order is requirement 14's, and what is being asked
is how the control reads rather than what is in it.

**`member row`**, on the members section:

| | A row is |
| --- | --- |
| `one line` | today's shape carried forward: avatar, username, role badge, workspaces as a sentence, and every action a small outline button trailing. The control, and the one that asks whether five controls on a line is still a row |
| `two lines, chips` | avatar, then identity on the first line and the workspaces as chips carrying their own access on the second, the label folded into the value (*Labels are a last resort*, 48); the actions an icon cluster that appears on hover and on focus |
| `dense table` | header and columns, for a list scanned by role and by workspace, with the row's actions behind one control |

**`pending mark`**, on the members section, asked separately because it is orthogonal to all three:

| | The pending row is marked by |
| --- | --- |
| `badge` | an outline chip reading `pending` and the expiry, which is what the organization page draws today |
| `muted text` | the words `invited, expires <date>` beside the username, in the supporting colour |
| `accent bar` | the muted words, plus a bar of the primary colour down the row's start edge (*Add color with accent borders*, 225) |

**`invite result`**, with the dialog. All three carry exactly the four things requirement 8 fixes:
the organization's name, one link, one copy control, and the sentence that rentable cannot send it.

| | The panel is |
| --- | --- |
| `callout panel` | today's arrangement with two thirds removed: the refusal as a warning callout at the top, then a label, the link in a code block, the copy control beneath |
| `link leads` | the organization's name as the heading, the link as the one large element, copy as the primary button, and the refusal dropped to supporting text. Hierarchy on weight and colour rather than size (*Size isn't everything*, 38) and by softening what competes with the link (*Emphasize by de-emphasizing*, 46) |
| `handover sentence` | one sentence naming the person, the link in a field with the copy control inside its trailing edge, and the expiry folded into its own value beneath. No labels at all (*Labels are a last resort*, 48) |

The panel is on `FormSurface` because the real one is: an invitation is a write
([[rules/interface]], *Form surface*). The copy controls write to the real clipboard, because the
copy control is one of the things being judged; every other action is a stub.

### What was deliberately not drawn

`sectionsFor(session, holdsTursoAuthority)`, requirement 14's gating, is ticket 09's. Every
section is drawn for every reader here, because a rail drawn short would be answering a different
question. The `sync`, `updates` and `diagnostics` bodies are placeholders; their blocks already
exist and none of them is what is being judged.

## Observation

The human opened the prototype on their own organization on 2026-09-13, cycled every bar and moved
between sections, and chose one variant of each of the four. No notes were added beyond the choice
and no capture was taken: the human ran the application at their own machine and answered from the
screen, so no judgement here turns on a capture.

| Bar | Chosen | Withdrawn |
| --- | --- | --- |
| `rail` | `tabs above` | `sidebar rows` (the plan's), `no ground, accent` |
| `member row` | `two lines, chips` | `one line` (today's shape), `dense table` |
| `pending mark` | `badge` (today's) | `muted text`, `accent bar` |
| `invite result` | `callout panel` (today's arrangement, reduced) | `link leads`, `handover sentence` |

What surprised: the two calls the plan had made in prose both lost. The rail the plan chose so that
the control would read as the application's own rail was passed over for the tabs it had rejected,
and the panel that was expected to get better as it became a sentence stayed a callout. The row went
the other way from what exists, and the pending mark stayed exactly what exists.

## Result

- **The rail: refuted.** The vertical list did not hold beside the shell's own sidebar, and the
  falsifier named the tabs as what takes it. The plan's argument that tab semantics say *same page,
  other view* was an argument about a look, and the look answered it.
- **The row: refuted.** Five actions and five things did not stay a single line; the falsifier's
  shape, identity on one line and the workspaces as chips carrying their access on the next, with
  the actions an icon cluster on hover and on focus, is the row.
- **The panel: refuted.** The reduction to a sentence lost more than it simplified; the callout panel
  stays, with the sentence that rentable cannot send it as the warning callout at the top.
- **The pending mark: refuted.** The quiet treatments were not chosen; the badge is right, and a
  pending person stays a row in the one list, as requirement 15 says.

## Conclusion

What tickets 09, 10 and 11 build, and what they do not:

**The section control (ticket 09).** A horizontal nav of anchors above a full-width body, the seven
sections in requirement 14's order, the current one underlined and `aria-current`. It is still a
`nav` of anchors carrying `?section=`, because every section is addressable and that is what the
plan's mechanism turns on; what changes is the look, which is tabs rather than the sidebar menu
button style. The plan's sentence naming `sidebarMenuButtonVariants` and rejecting tabs is
superseded by this file, and ticket 09's criterion follows it. A column of seven, with or without a
ground, is withdrawn: beside the real sidebar it read as a second one.

**The members row (ticket 10).** Two lines under the avatar: the username, the role badge and, on
a pending row, the outline badge reading `pending` with the expiry, on the first; the workspaces as
chips on the second, each chip carrying its own access (`full` or `read-only`) with the label
folded into the value. The row's actions are an icon cluster that appears on hover and on focus and
stays reachable by keyboard; a control for an act the session lacks is absent from the cluster. The
single line with five trailing buttons and the dense table are withdrawn. The pending mark is the
badge the organization page draws today; the muted words and the accent bar are withdrawn, and a
pending person is a row in this list rather than a list of their own.

**The invite result (ticket 10).** The organization's name, the sentence that rentable cannot send
the link as a warning callout at the top, a label, the link in a code block, and one copy control
beneath. The link-led heading and the handover sentence are withdrawn. The same panel is what a new
link and a copy link show.

**The workspaces rows (ticket 11)** were not drawn. A workspace row carries fewer things than a
member row (name, member count, the open mark, and its gated actions), so it takes the member row's
two-line shape where the second line has something to carry and one line where it does not, with
the same icon cluster for its actions; nothing there needs a further look.

## Disposition of the code

Deleted. `apps/desktop/src/lib/prototype/settings-area/` comes out and the temporary mount in
`apps/desktop/src/routes/settings/+page.svelte` is reverted, in the change that records the answer;
`git status` is then clean of both.

Nothing here is promoted. The variants carry no tests, hold their strings inline rather than in
either locale, gate on nothing, and stand in for two payloads that do not exist yet. What ships is
written fresh by tickets 09, 10 and 11 against what the Conclusion above settles.
