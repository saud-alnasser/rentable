---
use-when: "building a ticket in effort 843, or judging how the way in, its frame, or the workspace control is drawn"
---

# Architecture

**The way in gets a surface of its own in the design package, and the failure screens keep the
one they have.** `packages/design/src/lib/block/standalone-surface.svelte` serves seven screens
today, five of them the way in and two of them the application failing (startup error, update
recovery, route error, settings failing to load share it too). This effort adds
`block/way-in-surface.svelte` beside it and moves the way in onto it; the failures stay on the
standalone surface untouched.

The way-in surface is not a card. It is the window's content area laid out as Apple lays out a
setup pane: the mark, the title and one description line centred in a column of fixed measure;
the step's controls under them in the same column; the actions at the foot of the column; back
in the column's top corner; the position, where a step has one, between the description and the
controls. The mark is on every step, the wall included, where the organization's name is the
title under it. *Decided by the human on 2026-09-30; they had taken the mark off the wall on
2026-08-20, when the wall was a card of its own and the mark stood alone on it.* It owns every one of those slots, so no step can place them differently. A step hands
in its title, description, body, actions, whether it has a back and where it is in its sequence.

**One surface, and the step is a key.** The walk (`organization/setup/component/walk.svelte`)
and the connect screen (`connect-screen.svelte`) already draw every step inside one component;
they keep doing so, and hand the way-in surface a `step` key. When the key changes, the surface
commits the change inside a same-document view transition (`document.startViewTransition`),
named so only the column's contents cross: the outgoing contents slide toward the reading
direction's start and fade, the incoming arrive from its end. Back runs it the other way. This is
the *pane swap carries its direction* row of [[rules/frontend]] *Motion*, its fallback is no
animation, and the token layer already gates `::view-transition-*` under reduced motion. The
welcome, the wall and the no-workspace screen are separate components drawn by
`startup/component/root.svelte`; moving between them and the walk is a route change, and the
surface names its view-transition group the same way in every one, so the mark and the column
hold still across the route change and only the contents cross.

**The frame gains a fourth state, `way-in`, and signed out stops meaning a rail.**
`shell/component/frame.svelte` draws `bare`, `signed-out` and `full` today, and root chooses
`signed-out` for `sign-in` and `no-workspace` and for loading after the rail latched up.
`signed-out` goes. `way-in` is the titlebar with its window controls and no sidebar trigger,
breadcrumb, search or shortcut button, around the way-in surface; root chooses it for `sign-in`,
`no-workspace`, and loading before anybody is in. The latch (`railIsUp`) keeps its meaning for
the loading after a switch, which is the one load with a person in and a rail already up.
`shell/component/sidebar.svelte`'s `signedOut` prop, `workspace/component/locked.svelte` and
`organization/session/component/account-signed-out.svelte` have no caller left and are deleted.
*Decided by the human on 2026-09-30, over keeping the disabled rail they chose on 2026-08-20.*

**Language and appearance on the way in are one quiet control at the column's foot.** A text
button reading the current language, opening a popover that holds the existing
`lib/design/block/language-choice.svelte`, the appearance choice the settings area already draws,
and a link to all settings. `/settings` still opens signed out (`OPENS_SIGNED_OUT`), now on the
`way-in` frame with the back control returning to the way in, since the rail's row that used to
lead there is gone.

**The workspace control keeps its primitive and loses its duplication.** `workspace/component/menu.svelte`
stays a `Sidebar.MenuButton` opening a `DropdownMenu`. The trigger draws the mark tile and the
name on one line. The content is the radio group of held workspaces, no heading, then a
separator, then one item, "manage workspaces", to the settings area's workspaces section. The
radio item's indicator becomes a check: `primitive/dropdown-menu/dropdown-menu-radio-item.svelte`
takes an `indicator: 'dot' | 'check'` prop, default `dot` so no other caller changes, edited by
hand ([[rules/frontend]], *Components*). A radio item rather than a checkbox item, because the
role `menuitemradio` with `aria-checked` is what makes the open one announced as current.

**A switch draws its own loading, inside the page, and moves off a record first.** Today
`startup/switch.ts` sets `loading`, the frame stays `full` because the rail latched, and the page
is replaced by the startup loading surface: the mark and the stage bar, centred where the page
was. That order is kept, because it is what stops old rows being drawn under the new name, the
failure the file's own comment and [[rules/data]] are written against. What changes is what is
drawn and where the address lands:

- the snapshot carries `switching: string | null`, the workspace being opened, set by
  `switchWorkspace` and cleared when the pass ends;
- `startup/screen.ts` answers `switching` for `loading` with `switching` set, and root draws the
  shared `block/loading.svelte` there with the page frame's skeleton and "opening {name}", rather
  than the startup bar;
- before the open, `switchWorkspace` moves the address with a pure `addressAfterSwitch(routeId)`
  beside `wayInFrom` in `screen.ts`: a directory, the dashboard or settings stays where it is; a
  record's page goes to its concept's directory, read from `shell/navigation`'s breadcrumb trail.

## Rejected

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **A. A way-in surface beside the standalone one** (chosen by the human, 2026-09-30) | the failure screens, out of scope, do not move; each surface's comment argues for one kind of screen; the way-in slots are fixed in one place | two blocks where there was one; ADR 0015's "one shared surface" is narrowed | a later screen picks the wrong one | the interface rule's *Application surfaces* names which is which |
| **B. Restyle the standalone surface for all seven** | one block stays one block | the three toned failure screens change with no request behind it; the band variant fights an unboxed layout; failure screens move out of scope | a failure screen styled as a welcome reads as nothing wrong | one component carrying two kinds of screen, as the comment already strains to |
| **C. A SvelteKit layout for the way in's routes** | the column persists across routes for free | the welcome, the wall and the no-workspace screen are not routes, root draws them over any address; two of five screens could share it | a split between routed and drawn steps that looks the same and is built twice | two places to change the look |

**Keeping the rail while signed out** is the frame's current answer, settled on 2026-08-20 "by
looking at four alternatives", with the reason that chrome appearing on sign-in makes signing in
look like arriving somewhere else. Requirement 7 reverses it on the HIG's grounds (show only what
applies) and Apple's own sequence, where setup is a window of its own and the application appears
after. The loading after sign-in keeps the way-in layout (requirement 9), so the one change a
person sees is the rail arriving with the application, which is the arrival the old reason
worried about, now happening once and at the moment it is true.

**A Svelte `in:`/`out:` pair for the step change** was considered and lost: both nodes are in the
document at once and the column's height jumps between the two; the view transition snapshots
the old contents and animates only the pixels. It is also what the motion table already names for
a pane swap.

**Switching in place with no loading drawn**, the page keeping its rows until the new ones arrive,
lost for the reason `switch.ts` gives: the rows on screen would belong to the other workspace for
as long as the reads take.

# Components

| Part | Becomes responsible for |
| --- | --- |
| `packages/design/src/lib/block/way-in-surface.svelte` (new) | the way-in layout: mark, title, description, position, body, actions, back; the step key and its view transition; `busy` as `role="status"` |
| `packages/design/src/lib/block/way-in-position.svelte` (new) | "step n of m" in one treatment, drawn by the surface when handed a position |
| `packages/design/src/lib/primitive/dropdown-menu/dropdown-menu-radio-item.svelte` | an `indicator` prop, `check` drawing lucide `check` at the item's start |
| `shell/component/frame.svelte` | the `way-in` state; `signed-out` removed; `/settings` signed out drawn on `way-in` |
| `shell/component/sidebar.svelte` | no `signedOut` prop |
| `startup/component/root.svelte` | the chrome table with `way-in`; the `switching` screen |
| `startup/screen.ts` | `switching` in `startupScreen`; `addressAfterSwitch` |
| `startup/switch.ts`, `startup/machine.ts`, `startup/snapshot.ts` | `switching` set and cleared; the address moved before the open |
| `startup/component/{sign-in,no-workspace,loading}.svelte` | drawn on the way-in surface; the welcome's two choices as an equal pair |
| `organization/setup/component/{walk,connect-step,name-step,existing-step,connect-screen}.svelte` | drawn on the way-in surface with a step key; field addons removed; icons kept only on back, link and external-page buttons |
| `lib/design/block/way-in-preferences.svelte` (new) | the foot control and its popover (language, appearance, all settings) |
| `workspace/component/{menu,rail-row}.svelte` | the one-line trigger; the list, separator and manage item; no member count read |
| `workspace/component/locked.svelte`, `organization/session/component/account-signed-out.svelte` | deleted |
| locale files | the welcome's line, "manage workspaces", "opening {name}", the preferences control; unused strings (`workspaceMenu.members`, `switchTo`, `create`, the locked row's) removed |
| `.aep/rules/interface.md` | *Application surfaces* names the two surfaces; *Loading* says a switch draws the loading block |

# Interfaces

```ts
// packages/design/src/lib/block/way-in-surface.svelte
{
  step: string;                          // the key; a change runs the transition
  title: string;
  description?: string;                  // one line
  position?: { at: number; of: number };
  back?: { label: string; onclick: () => void };
  busy?: boolean;
  children?: Snippet;                    // the step's controls
  actions?: Snippet;                     // one prominent button, then quiet ones
  foot?: Snippet;                        // the preferences control
}

// startup/snapshot.ts
switching: string | null;               // the workspace name being opened

// startup/screen.ts
type StartupScreen = ... | 'switching';
export function addressAfterSwitch(routeId: string | null): string | null;
```

Callers of `ShellFrame`'s `shell` prop pass `way-in` where they passed `signed-out`; there are two,
root and the settings route's bare case. `onWayIn` goes with the account row that called it.

# Technical Approach

The order, and the reason for each step's place:

1. **The look, judged on screen** (the spec's constraint). The way-in surface, the welcome, the
   name step and the workspace menu are built on `src/lib/prototype/switcher.svelte` against the
   developer database, in both locales and both appearances, and the human judges them. Nothing
   is cut into build tickets until they have.
2. **The design package**: the way-in surface, the position, the radio item's check. First,
   because every later step draws through them.
3. **The frame and the chrome table**: `way-in`, and removing `signed-out`. Before the screens,
   because a screen moved onto the new surface while the rail is still drawn beside it would be
   judged in a window it will not ship in.
4. **The screens**, one ticket each: the welcome and the wall; the first run; the join; the
   no-workspace screen and the loading after the way in; the preferences control.
5. **The workspace control**: the trigger and the menu, then the switch (snapshot, screen,
   address), in that order because the menu can land alone and the switch is the one behaviour
   change.
6. **The rules**: *Application surfaces* and *Loading* in [[rules/interface]], in the same change
   as the surface that follows each revision, and the frame's and standalone surface's comments.

# Integration

- `packages/design` is shared with nothing outside this repository, and the new blocks follow its
  existing export shape.
- `lib/design/block/language-choice.svelte` and the settings area's appearance control are reused
  as they are; the settings area itself is not changed.
- The `rentable://` link still lands on `/organization/join` through root, now inside the way-in
  frame.

# Migration

Nothing at rest changes. The removed strings are removed from both locale files together, and
`i18n/tests` catches a string left in one.

# Testing Strategy

| Criterion | Checked by |
| --- | --- |
| 1 | a component test that the surface keeps its mark and title nodes across a step change and calls `startViewTransition` when present and not otherwise; the screenshot walk for direction and reduced motion |
| 2 | component test on the welcome's two buttons sharing one size variant; screenshot at the default width |
| 3 | component test per step counting prominent buttons (variant `default`) as exactly one |
| 4 | component test that the walk and the connect screen render `way-in-position` and the other three do not |
| 5 | component test that each step with somewhere to go renders one `back-control`; screenshots in both directions |
| 6 | a test over the way-in components that no `InputGroup.Addon` is rendered, and a review of button glyphs at ticket review |
| 7 | `node:test` on root's chrome table (moved to a plain module, as `screen.ts` was) that no signed-out state yields a rail; component test that the preferences control changes the locale |
| 8 | component tests: focus on the first field after mount and after a step change; Enter submits; no password field carries a value on mount |
| 9 | screenshot of the step before and the loading after a first run, a join and a sign-in |
| 10, 11 | component tests on the menu: trigger text is the name only; items are the held workspaces with `aria-checked` on the open one, a separator, the manage item; one workspace held |
| 12 | `node:test` on `addressAfterSwitch` over the route table; `node:test` on `switchWorkspace` that `switching` is set before the open and cleared after, and that the screen is `switching` meanwhile |
| 13 | component test driving the trigger with Enter, arrows and Escape, asserting focus return |
| 14 | the screenshot walk, in four combinations and two sizes, at the close; contrast read off the tokens |

# Operational Considerations

The screenshot walk is a person's check at the close ([[rules/testing]]); the tickets carry their
component and `node:test` checks and do not wait on it. The dev launch and screenshot how-to is
the one effort 832 used.

# Technical Risks

- **A view transition across a route change** (the welcome to the walk) runs through SvelteKit's
  navigation; `onNavigate` is where it is started, and a navigation that resolves before the
  snapshot is taken shows no transition. It would first show as the step jumping on that one
  crossing; the fallback is that it jumps, which is correct, only plain.
- **The walk's async state under a transition**: a consent poll started, then back pressed while
  the old contents are still animating. The transition is on pixels only; the state changes at
  once, so the poll is abandoned when back is pressed, as 824 requirement 2 requires. A test holds
  it.
- **Removing `signed-out` touches every caller of the frame's prop** and the settings route's
  signed-out case; a caller missed draws the full rail signed out, which the chrome-table test
  catches.
- **The check indicator's default** stays `dot`; a later caller copying the workspace menu gets
  the check by asking for it, and no other menu changes.
