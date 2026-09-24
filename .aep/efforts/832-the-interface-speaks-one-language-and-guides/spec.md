---
status: draft
---

# Problem

The application has most of a design system and does not hold to it. A shared list shell,
record surface, form surface, record card, command palette, undo and tone vocabulary all exist,
yet about twenty acts are done two or three ways depending on the surface
([[efforts/832-the-interface-speaks-one-language-and-guides/evidence/research/how-the-app-does-each-act-today]]):
search is a debounced field with a `/` shortcut on one list and a bare input on the next; "+"
comes from two icon families; loading has six treatments; the delete dialog also confirms
terminate; complex create and edit take different form weights; the breadcrumb links to three
routes that do not exist. A reader cannot predict what a control will do from having used its
twin elsewhere.

It also does not guide. An empty directory says "no results" when nothing has ever been made and
offers no way to make one. The first onboarding card shows five statements before its only
button; 26 English strings exceed 160 characters. The two longest workflows carry detours: an
organization takes three cards, a browser consent and two loading passes; a contract is made in
one form and then found, opened and given its units on another tab, which must happen before the
first payment because units lock after it.

And it lacks layers an elegant desktop application has: no typeface (Arabic falls to the system
stack), one dark palette with no light appearance, motion with no vocabulary (per-component
durations; Svelte's own motion unused), ad hoc radii and shadows, and some 24 primitives never
used, among them the ones that fit data the app already shows (switch, toggle group, radio group,
the input group for money).

The cost: the application feels assembled rather than designed, a new user is left to find their
way, and every surface built next copies whichever variant its author happened to read.

# Goal

The application reads as one elegant, minimal, production-grade product in the manner of the
best-regarded desktop tools
([[efforts/832-the-interface-speaks-one-language-and-guides/evidence/research/what-the-best-designed-apps-do]]):

- **one language** — every recurring act has one pattern, used on every surface, tailored only
  where the data genuinely differs;
- **the right component for the data** — a choice, a toggle, a date, an amount, a status each
  meets the control made for it;
- **guidance without instructions** — defaults, next steps, focus and empty states lead the user;
  text explains only what the interface cannot show;
- **short workflows** — onboarding and contract creation lose their detours;
- **alive, never busy** — short, interruptible, responsive motion, none on the paths used many
  times a day;
- **both directions, both appearances** — Arabic and English, light and dark, judged equally.

# Scope

Every surface a person meets in the desktop application: startup and the way in, onboarding and
joining, the shell (titlebar, sidebar, breadcrumb, palette, shortcut sheet), the dashboard, every
directory and record page, every form and dialog, and settings. The design package
(`packages/design`) and the application (`apps/desktop/src`) both change. The repository's
interface, frontend and motion rules are revised where this effort's decisions differ from them,
in the same change as the surface that follows the revision.

One domain write changes: creating a contract assigns its units in the same act
(requirement 20). No other schema, domain rule, or credential path changes.

Built as one effort on one branch, phased: the language first (requirements 1 to 5), then the
catalogue of acts (6 to 15), then guidance and copy (16, 17), then the workflows (18 to 21), with
bidirectional and error language (22, 23) holding throughout.

Decided by the human on 2026-09-24, in the grill that produced this spec: one effort, phased;
light and dark following the system; units chosen in the contract form; undo in place of
confirmation except where the act cascades or cannot be undone; the first workspace made for the
owner; Western digits in both locales.

# Requirements

## The language

1. **One typeface pair**, a Latin face and an Arabic face drawn to sit together, bundled with the
   application so it renders offline, and a **named type scale** every surface draws its sizes
   and weights from. Money, counts and other compared figures use tabular numerals.
2. **Light and dark appearances**, following the operating system's setting live, with an
   override in general settings (system, light, dark). Every colour, shadow and chart colour has
   a value in both, and text and status tones meet contrast in both.
3. **One icon family** at one stroke weight, sized from a named set, matched to its text. A menu's
   items either all carry icons or none do. A directional glyph mirrors in Arabic by the one
   stated list (back and next, sequence chevrons, progress); a clock, check, search glass, logo or
   slash never does.
4. **A motion vocabulary**: named durations and easings as tokens, entering elements decelerate
   and leaving ones accelerate, every motion interruptible and gated for reduced motion, none on
   keyboard list navigation or the command menu. Motion answers cause and effect: a record created
   arrives, a record deleted leaves, an undone delete comes back in place, a reordered set moves,
   a pane swap carries its direction. Nothing starts by itself and nothing loops.
5. **Named shape and elevation**: radii and shadows come from named tokens, and a surface's
   elevation follows one ladder in both appearances.

## One way per act

6. **A catalogue of acts.** Each recurring act has exactly one pattern, recorded in
   `[[rules/interface]]`: search, filter, sort, create, edit, delete, confirm, undo, row and record
   actions, bulk selection, export and import, going back, switching sections, empty, loading,
   error, not found, and notifying. Every surface follows it; a surface that departs states why in
   the rule, as the settings directories' sheet already does.
7. **Search.** Every set a person can search (directories, embedded lists, the contract's unit
   panes, the settings directories) searches the same way. The command menu opens on Ctrl/Cmd+K
   from every screen, finds records and acts, and shows each act's shortcut.
8. **Record actions in three places.** Every record act is reachable from a visible control, the
   context menu and the command menu, with the same label, icon and order in all three, and the
   same set on a record's card as on its page (copy details and duplicate included where they
   apply).
9. **Create.** One create control per set, in the same place on every set, and one create key
   that creates in the set on screen. The command menu can create every concept a person can
   create.
10. **Forms.** Which weight a form takes follows one stated rule, and create and edit of one
    concept take the same weight. A submit is labelled with its verb, and icon use on submits is
    one convention. The first invalid field takes focus on submit; Enter submits.
11. **Delete and confirm.** An ordinary delete happens at once and offers undo (toast and
    Ctrl/Cmd+Z). A confirmation appears only when the act removes more than the record or cannot
    be undone, and its button names the verb. A confirmation for another act (terminate, restore,
    sign out elsewhere) is the confirm pattern named for that act, never the delete dialog.
12. **Feedback.** Loading has one treatment, shaped like the content it replaces and shown only
    after a short delay. Every toast goes through the shared handlers. A notice or callout uses
    the callout primitive and the tone vocabulary.
13. **Empty states that lead.** An empty set says what it will hold and offers its create act;
    a search or filter with no match says so and offers to clear it. The two never read the same.
14. **Navigation holds.** The breadcrumb links only to routes that exist; one back control serves
    every surface, onboarding included; record sections and settings sections switch with one
    control; a unit's page offers the acts its card offers.
15. **The right component for the data.** The catalogue maps each kind of field and value to its
    control: a small exclusive choice, a binary setting, a date, an amount of money (with its
    currency), a phone number, a status, a count. Forms and records follow the map.

## Guidance

16. **The interface guides implicitly.** A field the application can fill is filled (a payment's
    amount is what is due, its date is today); after an act the user lands where the next step is
    (a created record is opened or brought into view, focus on its first field or next act); an
    act that cannot run says why at the control, briefly, rather than in a paragraph.
17. **Short copy.** Visible text is short and plain. An explanation the interface cannot make
    obvious sits behind a disclosure or in a tooltip, and only confirmations of irreversible acts
    carry a full sentence of consequence.

## Workflows

18. **Creating an organization** is: connect the Turso account, then name the organization and
    choose a username and password, then the application. The first workspace is made for the
    owner with a name they can change later. One loading pass follows the walk, not two. The
    connect card carries one line and a disclosure in place of its five statements.
19. **Joining** follows the same principles: the link and its code, then the password, then the
    application, with one loading pass; refusals say what to do next in one line.
20. **A contract is created with its units.** The contract form chooses the tenant and the units;
    one submission creates both. The units tab stays for changes later.
21. **A contract starts from where the user is.** A tenant's page and a unit's page each start a
    contract with that tenant or unit already chosen.

## Both directions

22. **Arabic and English hold on every surface.** Every surface is checked in both directions
    and both appearances; mirroring follows requirement 3's list; Arabic runs carry no letter
    spacing and a line height suited to Arabic; figures use Western digits in both locales, and a
    number (amount, phone, national id) is never reordered.
23. **Errors speak the reader's language.** No message reaching the interface is English in the
    Arabic locale, including those a router raises and those Turso returns.

# Acceptance Criteria

1. (a) The typeface files are in the repository and load with the network off, in both locales.
   (b) No text size or weight in application or package code sits outside the named scale (no
   arbitrary `text-[...]`). (c) Money and count cells render `tabular-nums`.
2. (a) Changing the OS appearance changes the application's without relaunch. (b) The override
   persists across launches. (c) A test asserts every colour token has a light and a dark value,
   and that foreground and each tone meet WCAG AA against the surfaces they sit on, in both.
3. (a) `@tabler/icons-svelte` is no longer a dependency and nothing imports it. (b) No menu mixes
   items with and without icons. (c) The mirror list is written in `[[rules/frontend]]` and every
   glyph on it mirrors in Arabic.
4. (a) No `duration-*` or easing value appears outside the motion tokens. (b) With reduced motion
   on, no element translates, scales or fades (a component test). (c) Creating, deleting and
   undoing a delete on a directory each animate the record in place; arrow keys and the command
   menu do not animate. (d) The motion section of `[[rules/frontend]]` states the vocabulary and
   no longer calls moving an element unavailable.
5. No arbitrary `shadow-[...]` or `rounded-[...]`, and no radius or shadow outside the named set.
6. `[[rules/interface]]` holds a section per act in requirement 6, and every [DIFF] in the
   evidence inventory is resolved or recorded there as a stated exception.
7. (a) The contract's unit panes and the settings directories search with the list shell's
   field, debounce and `/`. (b) Ctrl/Cmd+K opens the command menu on every route, including
   settings and record pages, and each act listed shows its shortcut where one exists.
8. For every concept, the card menu, context menu, record page and command menu list the same
   acts in the same order with the same labels and icons (a test over the shared action lists).
9. (a) The create control sits in the same position on every set. (b) One key creates in the set
   on screen. (c) The command menu creates tenants, complexes, units, contracts and payments.
10. (a) Complex create and edit take one weight, and the weight rule is written in the catalogue.
    (b) Submitting an invalid form focuses its first invalid field.
11. (a) Deleting a tenant, unit, payment, or a contract without payments removes it at once with an
    undo offer; undo restores it. (b) Deleting a complex with contracts, or the organization,
    asks first. (c) Terminate and restore no longer use the delete dialog.
12. (a) One loading component serves lists, records, settings and the dashboard. (b) No direct
    `toast` call remains outside the shared handlers. (c) The contract units lock notice is a
    callout.
13. An empty directory shows its create act; a search with no match shows a clear act; their
    words differ.
14. (a) No breadcrumb crumb links to a non-route. (b) Onboarding uses the shared back control.
    (c) Settings sections and record sections switch with one component. (d) A unit's page offers
    edit and delete.
15. The catalogue maps each field kind to its control, and no form uses a select for a choice of
    four or fewer options or a checkbox for a setting that takes effect at once.
16. (a) The payment form opens with today and the amount due filled. (b) After creating a
    contract, its record opens. (c) A disabled act carries a one-line reason on hover and focus.
17. No visible English string exceeds 120 characters except a confirmation of an irreversible act;
    the first onboarding card shows at most one line before its button.
18. (a) The organization walk has two cards before the application. (b) A workspace exists when
    the walk ends. (c) One loading pass separates the walk from the dashboard.
19. Joining reaches the application with one loading pass after the password.
20. (a) One contract form submission creates the contract and assigns its chosen units, in one
    write. (b) `[[rules/interface]]` *Contract unit transfer* is revised to say so.
21. A tenant's page and a unit's page each open the contract form with that tenant or unit
    chosen.
22. (a) A walk of every route in Arabic and English, light and dark, is attached to the pull
    request. (b) A test asserts that money, counts and dates format with Western digits under
    `ar`. (c) The two suspects in the inventory (sidebar rail offset, record header reversal) are
    resolved. (d) No `tracking-*` applies to Arabic text.
23. No router or Rust message reaches the interface untranslated; a test covers the payment
    router's refusals in Arabic.

# Constraints

- **Offline-first.** Fonts and every asset ship with the application; nothing loads from a
  network at render. *Why: from the second run on, the application works with no network
  ([[contexts/repository]], Constraints).*
- **Look is judged on real data before it is built across the app.** The language (type pair,
  both palettes, motion, the catalogue's key surfaces) is prototyped on the switcher against the
  developer database and judged by the human before build tickets are cut
  (`[[rules/module-layout]]`, *Prototype code*). *Why: a mock chooses the wrong winner.*
- **Primitives are changed by hand, never regenerated** (`[[rules/frontend]]`, *Components*).
  *Why: regenerating silently drops the strings and direction contract.*
- **No new motion dependency.** CSS, `tw-animate-css`, Svelte's `svelte/motion` and
  `svelte/animate`, and the platform's view transitions with a no-animation fallback. *Why: the
  frontend rule keeps motion off third-party libraries, and the webviews differ (View Transitions
  are certain on Windows, macOS 15 and current Linux only).* A dependency beyond these is the
  human's call.
- **Accessibility for the person in the worst position.** Every act is keyboard-reachable with a
  visible focus ring; colour never carries meaning alone; contrast holds in both appearances.
- **Every repository rule stands until revised by name**, in the same change as the surface that
  needs the revision. Known revisions: the frontend *Motion* table, *Contract unit transfer*, the
  token layer's "one palette, no modes", and the digits formerly read as the reader's (effort 810).
- **The organization and credential model does not change.** Onboarding is reshaped; what it
  does with the consent, the vault and the organization database is not.

# Out of Scope

- **New features or concepts.** No new records, reports, charts, or domain rules beyond the one
  contract write in requirement 20.
- **Restoring the last place on launch** (route, selection, scroll). The research lists it; it
  was not asked for.
- **A user-chosen accent colour or theme beyond light, dark and system.**
- **Touch, mobile, and window sizes below the current 640x480 minimum.**
- **Locales beyond English and Arabic.**
- **Cold-launch time**, beyond removing the second loading pass after onboarding.
- **The settings directories' card opening a sheet** stays the accepted deviation it is.
- **The installer, the updater's own dialogs and the OS-drawn consent page.**

# Assumptions

- The icon family kept is lucide: it carries four times the imports and is the design package's
  only family. The plan may show otherwise.
- The first workspace's default name is derivable (for example from the organization's name);
  the plan picks it.
- The typeface pair is an open-licence family that covers Latin and Arabic; which one is decided
  by prototype.
- A macOS machine older than 15 may lack View Transitions; the fallback serves it, and it is not a
  bug.
- Undo lasts while the application is open, as today. Removing the confirmation relies on that.

# Open Questions

- Which typeface pair — settled by prototype on the switcher, before build tickets
  ([[efforts/832-the-interface-speaks-one-language-and-guides/plan]], *Prototypes*).
- The create key (Ctrl/Cmd+N or another) and whether WebView2 keeps it for itself — settled by
  the same prototype run.

*Settled 2026-09-24 by the plan:* the form-weight rule — a concept's weight is decided by its
create form (heavy when it chooses other records or writes several) and holds for edit.

# Risks

- **One very large branch.** Every surface changes; review is commit by commit, and a late
  ticket can conflict with an early one. Mitigated by the phasing: the language lands first and
  every later ticket builds on it.
- **Deleting without confirmation loses a record if the application closes before undo.** Undo
  does not survive a relaunch. The cascading and irreversible cases keep their confirmation.
- **Two appearances double the look to judge.** A surface judged only in dark will ship broken in
  light; the per-route walk in both is the check.
- **Western digits reverse effort 810's reading.** Arabic readers used to Arabic-Indic digits in
  this app will see the change; it is the human's decision of 2026-09-24.
- **Motion on the virtualised list** is unproven: rows entering or leaving the window are adds
  and removes, not moves, and the row wrapper blocks `animate:` as written. A prototype settles it
  before the ticket that relies on it.
