---
owner: repository
status: accepted
sources:
  - src/lib/design/is-below-shell-breakpoint.svelte.ts
  - src/lib/design/primitive/sidebar/
  - src/lib/layout/component/frame.svelte
  - src/lib/layout/component/sidebar.svelte
  - src/app.css
  - tauri/tauri.conf.json
  - .claude/decisions/0017-a-form-surface-is-one-component.md
---

# feat(layout): the shell presents deliberately at every supported window width

## Problem

The window floor is 640×480 and the shell changes shape at 768. Across the lower third of
the supported range the application presents differently, and none of it was decided — it
is what the sidebar primitive arrived with, written for the web, where a viewport narrower
than a tablet means a phone.

Five faults, and only the first is the one the issue asks about.

**The breakpoint is stated twice, in two languages, and neither statement knows about the
other.** One is a named constant that decides which navigation component renders; the other
is the styling framework's default medium breakpoint, which decides how the shell looks and
whether the desktop navigation is visible at all. They agree on 768 today by coincidence,
not by construction. Moving either one alone is not a small change with a small consequence
— it makes the sidebar disappear entirely between 640 and 767, because the component branch
and the visibility rule stop pointing the same way.

**The content surface silently loses its inset presentation below 768.** The shell asks for
the inset variant; below the breakpoint the margin, the corner radius, the ring and the
shadow are all gated off, so it gets a plain edge-to-edge panel instead. Nobody chose that.
It is the styling framework's medium breakpoint doing a second job nobody assigned it.

**Touch affordances fire on width in an application that has no touch input.** Below the
breakpoint the sidebar's row actions grow an invisible expanded hit area, and the actions
that are otherwise revealed on hover become permanently visible. Both are proxies for
*this is a finger*, and width is not evidence of that on a desktop window the user dragged
narrow with a mouse.

**Crossing the breakpoint strands the navigation drawer open.** The drawer's open flag is
separate from the rail's, and nothing resets it when the presentation swaps. The dialog
primitive's teardown only decrements a nested-open counter on its parent; the only path
that writes the flag false is an explicit close — escape, overlay click, or the close
button — and unmounting is none of those. So a drawer open at 700 pixels, widened past the
breakpoint and narrowed back, returns already open, without the user asking.

**The band the drawer serves is 127 pixels wide and cannot be left.** The window cannot be
sized below 640, so every one of these behaviours exists for viewports the application is
incapable of reaching. They are inherited assumptions, not decisions.

## Goal

From the window floor upward, every change the shell makes to its own shape is one somebody
chose, stated once, and checkable at the width where it happens.

## Constraints

- **The supported window range starts at 640×480 and this work does not move it.** It is
  pinned in the desktop configuration and was verified by hand in both locales; changing it
  is a separate decision with its own reasoning.
- **Both locales, and Arabic is not a second-class one.** Every width-dependent behaviour is
  checked right-to-left as well as left-to-right.
- **The sidebar primitive family was generated once and is owned now.** Changing it by hand
  is the sanctioned operation; re-adding it through the generator would discard this work
  along with everything else the repository has put into that family.
- **A resize is not a trigger, so nothing here animates on the crossing.** Dragging a window
  edge is not something the user aimed at, which is the standing rule for motion.
- **There is no server rendering**, so a value read from the rendered document at startup is
  always available.

## Architecture

The shell has one responsive axis — the width the window has — and it is named once.

**One declaration, two readers.** The breakpoint becomes a named entry in the styling
theme, forced into the emitted stylesheet rather than left to be dropped as unused. The
styling framework reads it as a variant, so every width-gated class in the sidebar family
names *the shell's breakpoint* instead of the framework's generic medium size. The
navigation state reads the same custom property from the rendered document when it
constructs its media query. Neither language holds a number of its own, so they cannot
disagree.

A probe against this repository confirmed both halves: the declaration survives into the
built stylesheet, and it generates the matching variant. Forcing emission is the part that
is not obvious, and it is the whole reason this is available at all:

```css
@theme static {
	--breakpoint-shell: 48rem;
}
```

**Two navigation presentations, and the crossing between them is owned.** Above the
breakpoint the navigation is a rail that expands and collapses in place. Below it, the
navigation is an overlay drawer. That split stays — it is the responsive behaviour, not a
defect — but the crossing becomes a transition the shell handles rather than an accident of
two components being swapped: leaving the drawer band closes the drawer, so what is open
after a crossing is never something the user did not ask for.

**The content surface's presentation is not width-gated.** The inset variant is a request
the shell makes, and it is honoured at every width. Where the inset needs less room at the
narrow end, that is a measurement, not a presence question.

**Input modality is not width.** The affordances that exist for fingers are either removed
or asked for directly, and are never inferred from how wide the window is.

### On ADR 0017

The triage note on this issue said the sidebar performs the component swap that
[ADR 0017](../decisions/0017-a-form-surface-is-one-component.md) rejected for forms. The
shape matches and the binding does not, and the difference is the reason 0017 gives for its
own availability: a form's two presentations were already the same primitive underneath, so
there was never a second component to swap to — only a second set of classes. That is not
true here. A static rail is not already an overlay with a focus trap, an escape route and a
scrim. Rebuilding those semantics onto one always-mounted subtree is the most expensive
option available and buys the least, because the state a sidebar loses on a crossing is
navigation links, not a half-typed form.

So 0017 does not bind here, by its own stated condition. The Decision this spec produces
records that, because the next reader will otherwise reach for 0017 and either apply it
wrongly or file the divergence as drift.

## Approach

The single-declaration breakpoint goes first within the change, because every other part of
the work touches classes that have to name it.

This is **one ticket, not four.** The four faults live in one primitive family plus the
theme, fit inside a single context window, and share the files they edit — cutting them as
siblings would produce a spray of tickets all editing the same handful of files for one
coherent outcome, and would serialize on each other for no reason a reader could see. The
drawer leak in particular cannot be sensibly split from the crossing work: fixing the
crossing is where the leak stops existing.

**Rejected, and worth remembering:**

- **Retire the drawer and let the rail serve the whole range.** The band it serves cannot be
  left, so deleting it removes the crossing rather than surviving it, and with it three of
  the five faults at once. Rejected on direction: the shell should adapt across the range it
  supports rather than commit to one shape, and at the narrow end a rail leaves the content
  a width the lists are not comfortable in.
- **One navigation presenting two ways in styling alone**, the literal 0017 construction.
  Rejected for the reason above — its enabling condition is absent here.
- **Raise the window floor to 768 so the band cannot exist.** Cheap, and it contradicts an
  accepted range that was verified by hand. Reopening that is its own decision.
- **Move the named constant and leave the framework breakpoint alone.** This is the obvious
  fix and it is a trap: the two statements stop agreeing and the navigation vanishes across
  the band. Recorded because it is what the next reader will try first.

## Acceptance criteria

- At any window width from the floor upward, in both locales, the content area presents with
  the inset treatment the shell asks for — margin, rounded corners and ring — with no width
  at which it flattens to the window edge.
- At every width there is a visible, reachable way to open navigation, and no width at which
  navigation is absent altogether.
- Opening the navigation drawer at a narrow width, widening the window past the breakpoint
  and narrowing it back leaves the drawer closed.
- Widening past the breakpoint with the drawer open, and narrowing back, leaves the rail in
  the state it was in before — expanded or collapsed — rather than adopting the drawer's.
- No style in the sidebar family varies with window width except the navigation's own
  presentation and the content surface's inset — in particular nothing changes hit-area size
  or hover-reveal behaviour on width alone. **This one is checkable by inspection rather than
  on screen**: the two components carrying those affordances are exported by the family and
  rendered nowhere in the application, so the correction is preventive and has no observable
  symptom to point at. Said plainly because a criterion that reads as behavioural and cannot
  be observed is worse than one that admits what it is.
- The breakpoint appears as a literal number in exactly one place in the repository, and
  changing that one number moves both the component swap and every width-gated style
  together.
- Nothing animates as a consequence of the window being resized across the breakpoint.

## Risks

- **The two languages fall out of step during the change itself**, producing the vanishing
  navigation described above. Detected by checking the band at its two edges and its middle
  — 640, 700 and 767 — before the change is considered done, in both locales.
- **The theme variable is dropped from the stylesheet by unused-value elimination**, which
  would leave the runtime read returning nothing and the media query silently wrong. The
  probe above confirms the forcing directive prevents it; the check is that the built
  stylesheet still contains the declaration, and it is cheap enough to keep.
- **A runtime read of a style value happens before the stylesheet applies**, giving a wrong
  first answer for one frame. Detected by loading directly at a narrow width rather than by
  resizing into one, which is the case a resize-driven test never exercises.
- **The generator discards the work** on a future re-add of this primitive family. Already a
  known hazard for this directory and already documented as one; no new detection needed.

## Out of scope

- **The window floor.** Not moved, not re-argued.
- **What the lists do with the width they are given** at the narrow end. This spec governs
  the shell around them.
- **The two open-state flags becoming one.** The crossing is made correct; collapsing the
  rail's state and the drawer's into a single flag is a larger change to the primitive's
  contract and has no observable outcome of its own.
- **The settings, startup and error surfaces**, which have their own draft spec and their own
  criterion for holding at the floor.
