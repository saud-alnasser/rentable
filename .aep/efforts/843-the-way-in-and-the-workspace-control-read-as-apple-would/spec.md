---
status: accepted
---

# Problem

**The way in works, and it does not yet feel like the application it leads to.** Efforts 824, 826,
828 and 832 settled what the screens before sign-in do: a welcome with two ways in, a two-step
first run (connect the Turso account, then name the organization with a username and password), a
join by link and code, a sign-in wall, and a no-workspace screen. What they look like was built
step by step alongside that behaviour, and on 2026-09-30 the human asked for it to be redesigned:
"make it more elegant; get inspiration from Apple style".

Read against Apple's guidance
([[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/evidence/research/what-apple-does-for-the-way-in-and-the-workspace-control]]),
the screens as they are today:

- **Every step is the same boxed card** (`StandaloneSurface`, `max-w-lg rounded-3xl`, a shadow
  and a ring) dropped in the middle of the window, and a step change swaps one card for the next
  with a zoom. Nothing on screen says this is rentable except the loading screen's mark; the
  welcome is titled "welcome" and says "no organization on this machine yet", a statement about
  the machine rather than an introduction to the application.
- **The signed-out window shows a rail it cannot use.** On the welcome, the walk, the join
  screen and the wall the sidebar is drawn with every destination disabled, the workspace row
  reads "workspace / not available", and the titlebar's search and shortcut buttons are
  `aria-disabled`. Controls that do not apply to the machine's state are on screen at the moment
  a new person is deciding what the application is.
- **Every button carries a leading icon and every field a leading glyph.** The HIG gives field
  icons no macOS source and asks for an icon on a text button only where the icon is familiar;
  the screens use them uniformly because effort 824 found them too sparse, not because each one
  helps.
- **The welcome's two ways in are a primary and an outline button, each with a line under it**,
  stacked full width. Apple presents a choice between equals as equal-sized controls with at most
  one prominent, and keeps the explanation to the length of a label.
- **The steps do not read as one sequence.** The walk says "step n of 2" in a muted line, the
  join screen has no position, the loading screen that follows has its own layout, and the
  no-workspace screen is another card. Arriving takes four or five surfaces that were each
  designed alone.

**The workspace control at the head of the rail carries more than Apple's switchers do, and
switching leaves the window.** Its trigger shows the app mark tile, the workspace name and a
second line counting members; the menu repeats the mark, name and count as a header, lists the
held workspaces as a "switch to" radio group marked by a filled circle, and ends with a
"workspaces" link to settings. Apple's nearest precedents (Xcode's scheme menu, Safari's profile
button, System Settings' sidebar head) show the current context by name and symbol with no count,
mark the chosen item with a checkmark, and put the choices at the top and the one management
command at the bottom. And choosing another workspace runs the whole startup loading screen
(`startup/switch.ts`): the rail and the titlebar stay, but the page is replaced by the startup
surface, the mark and the stage bar, as if the application were launching, for a switch between
two places the person already holds. *Corrected 2026-09-30 by the plan, which read the frame: this
said the rail and titlebar vanished too.*

*Raised by the human on 2026-09-30: "let's redesign the onboarding ui, make it more elegant; get
inspiration from Apple style; also the workspace dropdown on the shell top side; after we finish
it we will amend changes about the settings about it later on".*

# Goal

**A person meeting rentable for the first time sees one calm, confident sequence that looks like
an Apple application, and a person moving between workspaces never leaves the window they are
working in.**

The way in introduces the application, asks one thing per step, shows only what applies, and
moves from step to step as one continuous surface, in both directions and both appearances. The
workspace control names where the person is, lists where else they can go with the current one
checked, and switches in place.

# Scope

- **The way in**: the welcome and the sign-in wall (`startup/component/sign-in.svelte`), the
  first run (`organization/setup/component/{first-run,walk,connect-step,name-step,existing-step}.svelte`),
  the join (`organization/setup/component/{join,connect-screen}.svelte`), the no-workspace screen
  (`startup/component/no-workspace.svelte`), and the loading screen
  (`startup/component/loading.svelte`) where it is the step after the way in.
- **The frame they sit in**: how much of the shell (`shell/component/frame.svelte`, `sidebar.svelte`,
  `startup/component/root.svelte`'s chrome choice) is drawn while signed out.
- **The workspace control**: `workspace/component/{rail-row,menu,locked}.svelte`, and switching
  (`startup/switch.ts`) as far as it decides what the window shows during a switch.
- **The design package's shared surface** (`packages/design/src/lib/block/standalone-surface.svelte`)
  and any block the way in shares, where the new look belongs there rather than in the
  application.
- The English and Arabic strings these read, and the rules that fix how they look
  ([[rules/interface]], [[rules/frontend]]) where a decision here revises them, in the same change.

# Requirements

*The way in*

1. **The way in is one surface that changes step, not a sequence of cards.** The welcome, both
   first-run steps, the join's steps, the password choice, the wall and the no-workspace screen
   share one layout: the application's mark, one title, at most one line under it, the step's own
   controls, and its actions. The mark is on every step, the wall included (*the human, 2026-09-30,
   having taken it off the wall on 2026-08-20*). Moving between steps keeps that layout on screen and changes its
   contents with a short directional transition, mirrored in Arabic and absent under reduced
   motion.
2. **The welcome introduces rentable.** It shows the mark and the application's name and one line
   saying what the application is for, then the two ways in as a pair of equal-sized choices, at
   most one of them prominent, each named by what the person has ("a Turso account", "a link and
   a code") in no more than a label and one short line.
3. **Each step has one forward action**, placed where the reading order ends, carrying its verb.
   Secondary ways out (the consent's "before you connect", the wall's "trouble signing in?",
   forgetting the account) are quiet: a disclosure or a plain text control, never a second
   prominent button.
4. **A step with a position says it once, the same way on every multi-step path.** The first run
   and the join both show where the person is in the sequence, in one treatment shared by both.
   The welcome, the wall and the no-workspace screen show none.
5. **Back is one standard control in one place**, on every step that has somewhere to go (as 824
   requirement 1 decided), drawn as the platform's back symbol, pointing the reading direction's
   way.
6. **Icons appear where they carry meaning, and consistently where they do.** A button carries a
   glyph only when the glyph is recognisable on its own (back, a link, an external page). Fields
   carry no leading glyph; a label names each one. Within one group of controls, all carry an icon
   or none do. *Decided by the human on 2026-09-30, over keeping the glyphs effort 824 added at their
   request: Apple gives field glyphs no macOS source.*
7. **Nothing on the way in is a control that does not apply.** While no one is signed in the
   window shows the way in and the window's own controls; the rail, the workspace control, the
   breadcrumb, search and the shortcut sheet are not drawn. What the signed-out rail reached that
   still applies (the settings a machine has before sign-in: language and appearance) stays
   reachable from the way in through one quiet control. *Decided by the human on 2026-09-30, over
   the disabled rail they chose on 2026-08-20 so that signing in would not look like arriving
   somewhere else.*
8. **The first field of a step is focused on arrival, Enter submits the step, and a field's
   error appears at the field.** No password field is ever filled for the person; a link and a
   code can be pasted.
9. **The loading that follows the way in belongs to it.** After a first run, a join or a sign-in,
   the loading screen keeps the way in's layout and mark, so arriving reads as the last step of
   the same sequence rather than a new screen.

*The workspace control*

10. **The trigger names the open workspace**: its symbol and its name, and nothing that repeats
    what the menu holds. The member count leaves the trigger.
11. **The menu lists the held workspaces first with the open one checked, then one command to
    manage workspaces**, separated from the list. The header that repeats the trigger goes. A
    member who holds one workspace sees it checked and the command; the menu never shows a
    "switch to" group of one without saying it is the only one.
12. **Switching keeps the window.** Choosing another workspace keeps the rail and the titlebar on
    screen, shows progress where the page is as a page loads rather than as the application
    starts, and lands on the same destination in the other
    workspace, or its home where that destination does not exist there. *Decided by the human on
    2026-09-30, over keeping the full loading screen for a switch.*
13. **The control is keyboard-reachable and speaks its state**: it opens from the keyboard, arrow
    keys move through the workspaces, the checked one is announced as current, and focus returns
    to the trigger when the menu closes.

*Both directions, both appearances*

14. **Every screen this effort touches is judged in English and Arabic, light and dark**, on the
    smallest window (640x480) and the default one, with contrast holding for text and focus rings
    in all four.

# Acceptance Criteria

1. From the welcome, through each first-run step, each join step and the wall, the mark, title,
   description line and action row stay in the same place; stepping forward and back changes
   their contents with a transition that runs the reading direction's way in both locales, and no
   transition runs with reduced motion on.
2. The welcome shows the mark, "rentable", one line saying what it is for, and two equal-sized
   choices; no line on it runs past one line at the default window width.
3. Every step has exactly one prominent button; every other way on or out is a disclosure or a
   text control.
4. The first run and the join show their position in the same component; the welcome, the wall
   and the no-workspace screen show none.
5. Every step with somewhere to go has the one back control, in the same place, pointing left in
   English and right in Arabic; steps with nowhere to go have none.
6. No field on the way in carries a leading glyph; a review finds no group of controls where some
   carry an icon and others do not, and no button whose glyph is decoration.
7. With no one signed in, the window draws no rail, workspace control, breadcrumb, search or
   shortcut button; language and appearance can be changed from the way in, and the change shows
   at once.
8. Arriving on each step puts focus in its first field; Enter submits; a wrong or missing value is
   named under its field; no password field is ever pre-filled.
9. After a first run, a join and a sign-in, the loading screen shows the same mark and layout as
   the step before it.
10. The trigger shows the workspace's symbol and name only.
11. The menu shows the held workspaces with a checkmark on the open one, a separator, then the
    manage command; with one workspace held, it shows that one checked and the command.
12. Switching from a contracts page in one workspace to another keeps the rail and titlebar
    drawn, shows progress in the content area, and lands on contracts in the other workspace; a
    destination the other workspace lacks lands on its home.
13. The control opens with Enter or Space from focus, arrow keys move through the workspaces,
    a screen reader announces the open one as current, and Escape returns focus to the trigger.
14. A screenshot walk of every touched screen in the four combinations, at 640x480 and the
    default size, shows no clipped text, no reversed number or link, and contrast of at least
    4.5:1 for text and 3:1 for focus rings.

# Constraints

- **Behaviour of the way in does not change.** What each step asks, what it does with the
  consent, the vault, the link, the code and the organization database, and the order of steps
  stay as 826 and 828 left them. *Why: those were settled over three efforts at the human's word;
  this effort is the look.*
- **The look is judged on screen before it is built across the way in**
  ([[rules/module-layout]], *Prototype code*): the shared layout, the welcome, one step with
  fields, and the workspace menu are prototyped against the developer database and judged by the
  human before build tickets are cut. *Why: a mock chooses the wrong winner.*
- **Apple's guidance first where a behaviour or look is decided**, with the page cited in the rule
  or commit; where it conflicts with what Windows expects (button order, capitalisation) and the
  application runs on both, the plan names the conflict and the choice. *Why: the human's
  standing direction; the research found the two places they disagree.*
- **Custom window chrome stays as it is.** The titlebar and window controls are the application's
  own (decorations off); this effort draws less inside the window, not a different frame. *Why:
  Windows asks apps not to invent window UI, and the frame is shared with every signed-in page.*
- **Offline-first, no new dependency.** Every asset ships with the application; motion uses what
  [[rules/frontend]] already allows. *Why: the way in runs before any network is known to exist.*
- **Accessibility for the person in the worst position.** Every step is keyboard-complete with a
  visible focus ring; colour never carries meaning alone; someone at the wall without a username
  and password can still take the machine out of the organization from it.
- **Primitives are changed by hand, never regenerated** ([[rules/frontend]], *Components*).

# Out of Scope

- **The settings area**, including its workspaces section and whatever the workspace control's
  manage command opens. *The human will amend settings in a later effort, after this one.*
- **The application's casing.** Locale strings stay lower case with headings raised to sentence
  case ([[rules/frontend]], *i18n*). Apple title-cases buttons and menu items and Microsoft asks
  for sentence case; changing it touches every surface and is its own decision.
- **The way in's behaviour**: steps, their order, what they ask, consent, links, codes,
  passwords, disconnect, recovery.
- **Signed-in surfaces other than the workspace control**: the account menu at the foot of the
  rail, the titlebar, the breadcrumb, the dashboard and every record surface.
- **The failure screens before a locale exists** (`error`, `recovery`, `unreadable`) and the
  updater's own dialogs.
- **A language or appearance step in the first run.** Both stay settings reached through the one
  quiet control of requirement 7.
- **A keyboard shortcut to switch workspaces.** Apple has no standard one to follow.
- **The OS-drawn Turso consent page and the installer.**

# Assumptions

- The rail's signed-out settings entry exists only to reach language and appearance before
  sign-in; nothing else a signed-out person needs lives behind it.
- A workspace's symbol can be the application's mark until workspaces carry one of their own; no
  workspace symbol or colour is added here.
- Landing on "the same destination" in another workspace is decidable from the route alone; a
  record page lands on its directory, not on a record of the same id.
- The Arabic plural of the member count stops mattering here once the count leaves the trigger;
  it is still wrong where else it is read.

# Open Questions

None remain. Settled by the human on 2026-09-30, at the opening:

- *Field glyphs*: dropped (requirement 6).
- *Switching*: keeps the window (requirement 12).

# Risks

- **Hiding the rail while signed out removes the account row's "sign in" and "settings" entries**;
  a person who navigated to settings signed out needs a way back to the wall. Requirement 7 keeps
  settings reachable; the plan must keep the way back.
- **A switch in place can show one workspace's cached data under the other's name** for a frame,
  if the cache is dropped after the new page draws. Today's full reload hides that order.
- **A transition between steps can fight a step's own async state** (a consent poll, a link
  being read); a back pressed mid-transition must still abandon the poll as 824 requirement 2
  says.
- **Four combinations double the look to judge**; a screen judged only in English dark ships
  broken in Arabic light.
