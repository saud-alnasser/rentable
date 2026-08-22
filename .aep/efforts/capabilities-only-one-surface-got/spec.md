---
aep: 2.7.0
owner: repository
date: 2026-08-22
kind: spec
status: accepted
---

# feat(app): three capabilities stop belonging to the one surface that got them

# Problem

Three things this application knows how to do exist on exactly one surface each, and in every
case the surface that has it is the one it was built for rather than the only one it fits.

**Acting on several records at once is a mechanism with one customer.**
`design/block/list.svelte` carries the whole thing generically: a selection mode the reader
turns on, shift-extended runs read off the order on screen, an id-keyed selection that survives
virtualization, and a bar that renders whatever `selectionActions` snippet the caller passes.
Passing that snippet is what turns selection on, and one caller passes it —
`contract/component/directory.svelte` — with one action on it, terminate. Every other list in
the application can be searched, sorted, filtered, exported and imported, and can act on
exactly one record at a time. A workspace that has just taken a file of two hundred units in
has no way to take two hundred units back out.

**And the one action that exists asks the question the wrong way round.** `terminateMany` acts
first and reports its refusals in a toast afterwards, naming the government ids of the contracts
that could not be terminated. Twenty steps away, the import dialog does the opposite and says so
in its own documentation: nothing is written until the reader has seen what would go in, what
would be turned away, and why. One application, two answers to *what happens when part of what
you asked for cannot be done*, and the destructive one has the weaker answer.

**The shell exists only once the application is ready.** `routes/+layout.svelte` renders
`LayoutFrame` with `showNavigation={startupState === 'ready'}`, so for the whole of loading,
signing in, recovering and failing to start, the reader gets a titlebar carrying window controls
and a card in the middle of an empty window. Those four states are the application, and they do
not look like it. The route file is 523 lines and almost all of it is startup: a five-value
state machine, the admission ladder, sign-in, session retry, recovery, the day-crossing
reconcile, the window-close sync, and the sign-out listener.

**Nothing catches an error that is not routed.** There is no `<svelte:boundary>` anywhere in the
tree, and `routes/+error.svelte` sees only what SvelteKit hands it. A component that throws
while rendering takes the window with it and leaves no way back except quitting the application,
in a desktop application whose window the user is expected to leave open.

**Range creation exists on the complex form only.** `complex/component/form.svelte` reads a run
off the end of what was typed — `A1-18` names `A1` through `A18`, `A 1-18` names `A 1` through
`A 18` — expands it into named units under a limit of 500, folds the names to catch a collision
with the list or with the batch, and holds every expanded name as a field the reader can still
edit or remove. `complex/component/unit-form.svelte`, which is what an existing complex opens,
is one name field and one unit per submission. The two files sit in the same directory and share
none of it. So a building of eighteen units is one line of typing on the day it is created and
eighteen rounds of typing, opening and closing a form on any day after that.

# Goal

What a surface can do is decided by what its records are, not by which surface happened to be
built first.

Every list holding records with an action that means something on several of them offers that
action on a selection, and asks about the whole selection, showing what would happen, before
anything happens. The shell is on screen from launch to close and changes with the state the
application is in, rather than arriving once the application is ready. A unit is created in runs
wherever a unit is created.

# Scope

Three scopes under one goal. They share no code; they are one effort because they are one
decision, which is that a capability belongs to its kind rather than to its first surface.

**All three can start.** ~~The shell scope is gated on a prototype~~ **the prototype ran on
2026-08-20** and requirements 6 and 7 carry its answer, so nothing here is waiting on a question
that has to be looked at before it can be built.

- **Multi-record actions**: which action each list offers on a selection, the procedures behind
  them, the plan query each one is previewed through, the confirmation that shows what would
  happen before it happens, and exporting a selection.
- **The shell**: one continuous surface from launch to close, its contents varying with
  application state, an error boundary inside it, and startup orchestration moving out of the
  route.
- **Unit runs**: range creation wherever a unit is created, from one implementation.
- **What a list costs**: the three measured causes of the application being slower on a filled
  workspace. *Added 2026-08-20 at the human's request, as a fifth scope, because the multi-record
  work lands on exactly these paths.*
- **The application's own screens**: what update recovery, a startup failure and the loading
  screen present, and whether the answer belongs to those screens or to the surface all seven of
  them share. *Added 2026-08-20 at the human's request, as a fourth scope rather than folded into
  the shell's, because it is what these screens say and the shell scope is what is drawn around
  them. It read "the failure screens" until the loading screen was added to it the same day.*

# Requirements

## Multi-record actions

1. **Every list whose records have an action that means something on several of them offers that
   action on a selection.** Named per list, from what each concept's domain already allows
   rather than from one verb applied to all five:

   | List | On a selection |
   | --- | --- |
   | contracts directory | terminate, restore, delete |
   | a tenant's contracts | terminate, restore, delete |
   | a unit's contracts | terminate, restore, delete |
   | tenants directory | delete |
   | complexes directory | delete |
   | a complex's units directory | delete |
   | a contract's payment ledger | delete |

   Renewing, duplicating and editing are not on the table: each needs input about the one record
   it is for, so a selection has nothing to say to it.

   **The bar carries every action the list declares, whatever is in the selection**, and whether
   an action applies to any of the selected records is answered by the confirmation rather than by
   the bar. *Decided here rather than asked, and cheap to reverse if it reads badly on screen.*
   The alternative is a bar that hides or disables an action nothing in the selection can take,
   and knowing that means running the plan query for all three actions on every selection change,
   which is up to three calls per checkbox. Requirement 3 already makes the bad case safe: an
   action whose plan refuses everything opens a confirmation with no destructive control on it.

2. **A multi-record action is one call over the whole selection**, never the single-record
   procedure issued N times. This is `terminateMany`'s existing property and its stated reason:
   both reconcile paths write one `UPDATE` per changed row, so N calls cost N reconcile passes
   for work one pass does.

3. **The action asks before it acts, and what it asks with shows the outcome.** Which of the
   selection would go through, which would be refused and for what reason, counted by reason
   with a handful of records named, in the shape `directory-import-dialog.svelte` already uses.
   **Where nothing in the selection can proceed there is no destructive control on the
   confirmation at all**, the way that dialog drops its import control on a file it cannot read.
   The refusals are the ones the domain already enforces, and this effort adds none: a tenant
   still holding contracts, a complex still holding units, a unit still holding assignments, a
   contract still holding units or payments, a contract whose status cannot be terminated by
   hand. **A payment is refused for its contract being terminated**, which `payments.delete`
   enforces through `ensureContractIsNotTerminated`. *Corrected 2026-08-20 while building #650,
   which had read this as "a payment is refused for nothing" and found the source saying
   otherwise.* The ledger hides its row controls on a terminated contract, which is why nobody
   had met the rule, and a hidden control is not an absent rule: the refusal is reached when the
   contract is terminated while the confirmation is open. So the payments confirmation is a
   count with one refusal behind it rather than a count alone.

   **The outcome is asked for, not inferred from the rows on screen.** *Settled 2026-08-20, after
   the draft assumed this was presentation and the tree said otherwise.* A tenant row carries a
   contract count per status and a complex row carries `unitCount`, so those two could answer for
   themselves. **A unit row and a contract row cannot**: a unit is refused for holding any
   assignment and its row carries `status`, where `vacant` says only that no assignment is current;
   a contract is refused for holding units or payments and its row carries `paymentCount` and no
   unit count. So each multi-record action has a **plan query beside it** that takes the selected
   ids and returns which of them are refused and why, called when the confirmation opens.

   The alternatives were putting the missing figures on every list row, which buys a free preview
   with a join on every list read for a column most readers never look at, and previewing only
   where the row already knows, which would leave the application with two answers to the same
   question and is half of what this effort exists to remove.

   **The plan and the mutation read the same domain rule**, so they cannot disagree about what
   refuses a record. They can still disagree about the workspace, because another device may write
   between the two. **The mutation stays authoritative and keeps reporting what it actually
   refused**; where that differs from what the plan showed, the reader is told, and nothing is
   retried on their behalf.

   **Every action is planned the same way, including the two that look as though they need no
   query.** A contract's terminate and restore turn on its status, which is on the row, so both
   could be answered without asking. They are asked anyway, for two reasons: a status is derived
   from what the contract owes *today* and a row loaded before a UTC day crossing can be stale
   against the rule the mutation is about to apply, and an application that plans two of its
   actions from the row and the third from a query has the two answers to one question that this
   effort exists to remove.

4. **Every list that exports offers exporting the selection**, beside exporting what the list is
   showing. The columns and the file naming are the ones that list already declares. **That is
   five of the seven lists**: the two contract panes embedded in a tenant's page and a unit's page
   declare no export today and gain none here, because nothing asked for one and adding it would
   be a second change wearing this one's name.

5. **A multi-record action is one entry on the undo stack and one history entry per record it
   changed.** The stack entry names the count; each record's own account says what happened to
   it, because a selection is how the reader acted rather than something the records share. This
   is what `useTerminateManyContracts` already does and it is the shape all of them take.

   **Undoing a multi-record deletion is all or nothing.** *Settled 2026-08-20.* One call, one
   batch inside one transaction, which is what [[rules/data]] under *Multi-table writes* already
   asks of a write spanning rows. Where any record in the set cannot be put back, **none is**, and
   the reader is told which one and why. The alternative was restoring what could be restored and
   naming the rest, which leaves the workspace in a shape neither the deletion nor the undo
   describes and spends the stack entry getting there.

   **A failed restore leaves the entry on the stack**, so the reader can fix the cause and press
   undo again. That is not new behaviour and needs no mechanism: `InverseStack` already keeps an
   inverse that throws, on the stated ground that it did not move the workspace and dropping it
   would leave the user unable to try again. What this requirement adds is that a multi-record
   restore **throws rather than half-succeeding**, which is what makes that existing guarantee
   true of a set.

   **The import precedent does not govern here, and the reason is the bound.**
   `useImportRecords` declares no inverse deliberately, because the inverse of a file's worth of
   records is thousands of writes issued in an order the schema allows and is not a thing to hang
   off a toast that disappears in eight seconds. A selection is bounded by what a person picked out
   by eye, and every record that can be deleted at all is by definition one with no dependents, so
   putting it back is a plain insert carrying its original identity. The argument that excused an
   import does not reach a selection.

## The shell

6. **The shell is drawn once the application is running, and an application waiting for a person
   is running.** *Settled 2026-08-20 on screen; see
   [[efforts/capabilities-only-one-surface-got/evidence/prototypes/the-shell-before-the-application-is-ready]].*

   The draft asked for a shell in every state and that was **refuted by looking at it**: chrome
   around a card, in a state where the card is the only thing that can be acted on, is chrome
   belonging to an application that is not running. What survives is one line, and every state
   finds its own side of it.

   | State | What the application is | What is drawn |
   | --- | --- | --- |
   | loading | not known yet | the bare frame |
   | failed to start | not running | the bare frame |
   | update recovery | not running | the bare frame |
   | signing in | running, waiting for a person | the shell |
   | ready | running, with a person | the shell |

   **The table is derived from the line and is not itself the requirement**, so a state added to
   this application later has somewhere to look up its own answer rather than a list it is missing
   from.

   The bare frame is unchanged: a titlebar carrying window controls, over the shared standalone
   surface. **A caught error takes the side of the state it was caught in**, and the shell's own
   chrome throwing is the exception requirement 8 states and argues.

7. **Signed in and signed out, the shell is the same shell, and what cannot be true yet is drawn
   disabled rather than removed.** *Shape settled 2026-08-20 on screen.*

   Signed out, that means precisely:

   - **The account control is an empty user glyph**, opening a menu of two: the way in, and
     settings. It is the only thing on the rail that works.
   - **The rail does not name the provider, and the card does.** *Copy settled 2026-08-20.* The
     control reads **user** over **sign-in**, its menu row reads **sign-in**, and
     **sign-in with Google** appears once, small, on the card. Signing in with Google is how this
     application does it rather than what the reader is being offered, and a rail that said Google
     twice before anybody had signed in would be naming the mechanism three times over. All four
     strings are keys in both locales, added under `layout.accountMenu` and used through `$LL`;
     none of this is English written into a component.
   - **The row reaches the card rather than the consent screen.** *Corrected 2026-08-22 by the
     human, in #735.* It called `startup.signIn()` until then, which was coherent while the card
     was drawn over every address: the row and the card were both on screen, doing one thing.
     `/settings` opening signed out arrived later, with
     [[efforts/settings-and-the-workspace-finish-what-they-offer]], and made one address where the
     row acts with no card in front of the reader — so the surface that names the provider was
     never seen. The row now leaves for an address the card draws over.
   - **The rail folds.** The trigger is live in both states, because folding is a preference about
     the window rather than something an account grants.
   - **Everything else is disabled**: the four primary destinations, the workspace control, and
     the titlebar's search and shortcut sheet. *The last two are a reading of "other things are
     disabled" rather than a decision stated in those words, and they are the cheapest thing here
     to change on sight.*
   - **The sign-in card does not move.** It stays centred in whatever the shell leaves it, exactly
     as it is today, and nothing about the card itself changes.

   The prototype's own footer, a sign-in row carrying a label, lost to this. So did a minimal rail
   holding only the mark and the way in, and a shell with no rail whose titlebar carried both.

   **This supersedes the constraint in
   [[efforts/the-shell-says-whose-workspace-this-is/spec]] that reads "The two controls cannot be
   empty ... Neither control gets an empty state, and that is a consequence of the gate rather
   than an omission."** That constraint was true of a shell that only ever rendered behind the
   gate. It is being reversed deliberately, by the human, on 2026-08-20, and the effort that
   holds it is amended in the same change rather than left contradicting this one.

8. **A component that throws while rendering is caught and shown, inside the shell, with a way
   back.** The reader can retry the surface that failed or leave it for one that works, without
   the window going down and without quitting. What was caught is recorded through the
   diagnostics sink that already exists, and nothing new leaves the machine.

   **The shell itself is the case this requirement cannot promise, and it says so rather than
   pretending.** A boundary renders its fallback in place of the subtree that threw, so a boundary
   inside the shell cannot catch the shell: if the sidebar or the titlebar throws, drawing the
   caught-error surface inside them throws again. So there are two, and the outer one is the
   honest floor: **inside the shell for anything a route renders**, which is every screen in the
   application, and **outside it for the shell's own chrome**, which falls back to the shared
   standalone surface with no chrome around it at all. Which is exactly the state requirement 6
   otherwise forbids, and it is allowed here because the alternative is a blank window. How the
   two are arranged is `/plan`'s; that the second exists is this requirement's.

9. **Startup orchestration lives in the layout module rather than in the route, and it comes out
   testable before it comes out.** `routes/+layout.svelte` is a route file holding 523 lines of
   which almost all are startup: the state machine, the admission ladder, the sign-in path, the
   session retry, the recovery branch, the day-crossing reconcile, the window-close sync, the
   sign-out listener and the sync manager. Every one of them is the shell's.

   **The extraction is ordered, and the order is the requirement.** *Settled 2026-08-20, after
   the draft's criterion turned out to be uncheckable.* The state machine comes out first as a
   unit that can be driven with no window, the way `sync/admission.ts` already is, and the paths
   below become tests under `layout/tests/`. Only then does the rendering move. **The alternative
   was moving it as it is and walking the paths by hand**, which is cheaper and leaves the whole
   change resting on somebody remembering to launch the application in seven states, two of which
   need a failing network or a broken update. A third option was dropping this requirement
   entirely and leaving startup in the route, which keeps every other shell requirement intact;
   it was rejected because the shell cannot own its own states from inside a route file.

   **The seven paths, named here so the tests have a list and criterion 9 has something to
   fail**: first launch with no account; launch already signed in; a sign-in that fails at the
   consent screen; a sign-in that succeeds and reaches no control plane, which is the `noSession`
   wall and its retry; a pending recovery; a startup that throws and is retried; and a sign-out
   while the application is running. The window close that syncs before it closes is an eighth
   path and is covered with them.

   Tests are `node:test` under `layout/tests/`, against the shared scaffolding rather than
   hand-written partials, per [[rules/testing]] under *TypeScript*.

9a. **`/settings` works signed out.** *Arrived 2026-08-20 out of requirement 7 rather than out of
    the prototype's question: an account menu that offers settings while signed out has a broken
    row in it otherwise.*

    **Nothing on that page needs a workspace, and this was checked rather than assumed.**
    `settings/router.ts` forwards `get` and `set` straight to `ctx.host.settings`, updates go
    through `ctx.host.update`, and the diagnostics directory is a field on the host's `Settings`.
    The page reads no database at all.

    **What stopped it was one line of reasoning in `api/context.ts`**, which made identity required
    on the ground that "#571 put a sign-in in front of the whole application, so there is no
    request without a signed-in user and no procedure has to reason about one." That premise is
    what requirement 7 deletes.

    **Settled 2026-08-20: the boundary gets a signed-out path.** The alternative was to read the
    host directly, the way `+layout.svelte` does for the locale, and delete the four forwarding
    procedures. That was the smaller change and it lost: it answers this page and leaves the
    boundary saying something untrue about the application, so the next surface that needs a
    signed-out call re-opens the same question with less to go on.

    - **`Context.identity` becomes `Identity | null`**, and `null` is never filled in. Decision 03
      called a placeholder the harder of the two failures; an absence that is expressible again is
      exactly when one gets invented, so a test pins it.
    - **The refusal moves to `procedure.member`** rather than going away. Whether a call needs an
      acting user is a property of the call, not of the thing a call runs under.
    - **`member` is the default and `public` is the exception**, in that order deliberately: a
      procedure written without thinking about this should be the safe one. Forty-six of the
      fifty-one are `member`.
    - **Host-only is the test for `public`, not harmless-looking.** A public procedure reaches
      `ctx.host` and never `ctx.db`. A read of the workspace is not public however read-only it
      looks, because the workspace belongs to somebody.

    **Requirement 3's ordering survives as a property of the boundary rather than of the order the
    layout calls things in**, which is stronger than what it replaces: it was true because the
    context refused, and it is now true because everything reaching the database is a `member`.
    Recorded in [[rules/api-layer]] under *Who may call*.

    **Every group on the page is drawn signed out**, because every group is host-only. Nothing is
    hidden and nothing is disabled: this is not a reduced settings page, it is the settings page.

    > **The layout half of this was never built, and it is carried by
    > [[efforts/settings-and-the-workspace-finish-what-they-offer]] as requirement 1.** *Found
    > 2026-08-21 by the human, using the application.* The API half landed with #645 and holds:
    > `Context.identity` is nullable, five procedures are `public`, and criterion 7b-i's test
    > passes. What never landed is the route gate. `routes/+layout.svelte` draws the sign-in card
    > in place of `children` for every address while the shell is in `sign-in`, so #646 merged
    > with criterion 7b unmet and nothing failing. **Criterion 7b is the other effort's now**, and
    > it is not restated there in different words: it is inherited by name, with the test it never
    > had. This paragraph is the only record of where it went.

9b. **`layout.workspaceMenu.locked` reads "not available", in both locales.** It read "not
    available yet" and "غير متاح بعد". *Asked for 2026-08-20, and **already applied in the working
    tree**: the prototype was moved onto real translation keys on the same day, so the i18n files
    were being edited anyway and the argument for deferring it went with that.*

    **The i18n edits are keepers, not scaffolding.** `en/index.ts`, `ar/index.ts` and the
    generated `i18n-types.ts` carry work this effort needs whichever way the rest goes, and they
    are not on the list of files to revert when the prototype comes out.

## Unit runs

10. **A unit created on an existing complex is created the way it is at complex creation.** A run
    expands into named units, every expanded name stays an editable and removable field before
    anything is submitted, and the limit and the duplicate rule are the ones already enforced:
    500 per run, and a case-folded comparison against both the list being joined and the batch
    itself. **The duplicate check on an existing complex runs against the units that complex
    already holds as well as against the batch**, which is the one thing the create-a-complex case
    has nothing to compare with.

    **A run is one write and one entry on the undo stack**, the same shape everything else in this
    effort takes. Eighteen units named in one line are eighteen rows written in one batch inside
    one transaction ([[rules/data]], under *Multi-table writes*), and one undo puts the complex
    back to eighteen units fewer. Named here rather than left for `/plan` to discover, because
    eighteen calls and eighteen undo entries is a different product from one and one.

    *Corrected 2026-08-21, building #654. This paragraph said **this is a procedure the
    application does not have**, on the grounds that creating a complex writes its units as part
    of `complex.create` and an existing complex has only `complex.units.create`, which writes
    one. That was true when this was written and stopped being true with #649, which added
    `complex.units.createMany` as the inverse of a bulk deletion: one call, one batch, all of
    them or none. A run of units goes through it rather than through a second procedure beside
    it, and what #654 owed the effort was a caller rather than a write.*

11. **The run notation is one implementation read from one place.** Both forms parse the same
    way, so `A 1-18` cannot come to mean two different things depending on which form the reader
    opened.

## The failure screens

*These three hold whichever presentation wins, which is why they are written as obligations
rather than as a design. Which presentation it is, is the open question at the foot of this spec,
and it is being answered by looking.*

13. **The update-recovery screen states no figure twice.** It states the version three ways today:
    its description names the version being started, a boxed figure under that restates the
    previous version, and a paragraph after that explains the same situation again.
    [[efforts/surfaces-the-overhaul-left-behind]] closed on exactly this rule for a different
    surface, and this one was never held to it.

14. **The startup-failure screen offers the diagnostics file.** It exists, `settings.diagnosticsDir`
    names it, and a person who has just been told the application will not start has no other
    move. Today the screen hands over a raw message in muted twelve-point text and one button.

15. **The shared block learns a tone, and every one of the seven screens declares which tone it
    is.** *Settled 2026-08-20 by looking. Two presentations that kept the fix inside these two
    screens lost to one that puts it in the block.*

    [[rules/interface]] under *Application surfaces* converges starting, signing in, failing,
    recovering and reporting an unanticipated error onto one block, on the ground that what these
    screens have in common is the whole of what they are. That still holds. What it never decided
    is whether they should therefore look **identical**, and today they do: the same card at the
    same weight whether the application is loading normally or cannot open its database.

    So the block gains a tone, and **the requirement is that the declaration is exhaustive rather
    than that the appearance is uniform**. Every screen on the block says which it is, and most of
    them say neutral. A startup failure and an update recovery are the two that do not, and they
    do not say the same thing as each other either: an update that needs finishing is not a
    database that would not open, and today they wear the same face.

    **The line is the application, not the screen.** Those two stop everything. A settings page
    that will not load and a crashed route are contained, and the shell around them is still
    working, so both stay neutral. *The screens on the block are five, not seven: choosing a
    workspace went with Google Drive sync, and starting left when requirement 16 was answered.*

    *This replaces a version of this requirement written on the same day that forbade "two of seven
    wearing a treatment the other five do not". That would have forbidden the answer: a tone only
    failure states use is correct, and what would actually be wrong is a screen that never
    declares. The requirement was written before the answer existed and it was written too
    tightly.*

    **The two screens are not the same shape underneath the tone, and that is the second half of
    this.** *Settled 2026-08-20 after looking at a version where they were.* A version number is a
    fact somebody reads off the screen and repeats, so **update recovery keeps its figures as
    plates**, the previous version first and the version being upgraded to second.

    **A startup failure has no such figure and gets one description and no body at all.** It took
    two passes to get there: a version with labelled plates was called over the top, and a version
    with three paragraphs was still too much. What is left says what could not be opened, that
    nothing in it is at risk, and what to try. **The reported error left the screen with the
    body**, and is reached through the log control instead, which is the one place it was ever
    going to be useful.

    **Nothing writes that error down today, and taking it off the screen is where it is lost.**
    `routes/+layout.svelte` formats it for display and holds it in a variable; the diagnostics
    directory the log control opens does not receive it. So the screen refuses the prop rather than
    accepting and ignoring it — a prop a screen does not read is a claim it handles something it
    does not — and **this requirement owes a startup failure written to the diagnostics before the
    log control's promise is true**.

    **Both put their actions in the band as glyphs with tooltips, and the glyphs carry weight** —
    the way past filled, the other outlined on the card's own ground, both a size up from a
    record's. *Settled 2026-08-20 after a version that borrowed `RecordActionControl` was called
    not eye-catching enough, which it was.* **That control is a record's and this is not a record**:
    it rests deliberately quiet, and its own documentation gives the reason, which is that a glyph
    at rest would be the only chroma on a surface holding a page of other things. A card that has
    stopped the entire application holds nothing else at all, so resting quiet buys a reader who
    cannot find the way out. Whether the application surface's control ends up shared, renamed, or
    a sibling of the record one is `/plan`'s.

    **The two glyphs are one box, and must read as one box.** *Corrected 2026-08-20 after a build
    where the filled one looked larger.* They already measured the same, and the button's own base
    gives every variant a transparent border so none is a pixel wider than another. What made the
    filled one read bigger is that a solid fill states its bounds and a translucent one does not,
    **so the second chip gets real edges rather than the first getting shrunk**. Worth writing down
    because the obvious fix was the wrong one.

    **The way past the screen is not one flat colour, and this application has no other gradient.**
    *Asked for 2026-08-20, after a build whose hover moved the same fill to 90 percent of itself
    and read as nothing happening.* A search of the tree finds no `bg-linear-*` or `bg-gradient-*`
    anywhere, so **this is a declared departure rather than a house style being followed**, and it
    is named here so that it is argued once rather than copied silently onto the next control that
    wants attention. What it buys: a lit top edge and a shaded bottom, which reads as raised and
    therefore as pressable, and a hover with somewhere to go rather than a fill that dims.

    **The retry glyph turns under the pointer**, which previews what pressing it does, and the
    other glyph does not, because a link that spins is decoration and decoration on a screen that
    has stopped the application is the wrong kind of confidence. Both are behind `motion-safe`.

16. **The loading screen is designed rather than inherited, and it reports real progress.**
    *Added 2026-08-20 at the human's request; settled the same day after two rounds of looking.*
    It was `StandaloneSurface` with `busy` and four words, and it looked that way because six other
    screens needed a shared block and this one came along. Seven presentations were put up and the
    human chose the fourth:
    [[efforts/capabilities-only-one-surface-got/evidence/prototypes/what-the-loading-screen-should-be]].

    **No card, the mark holding still, and a bar that fills over the named stage it is on.** The
    argument the choice settles: every other presentation says only *something is happening*, and
    an indefinite spinner looks identical at half a second and at forty, so a person watching one
    eventually cannot tell working from hung. A bar that has moved since they last looked can only
    mean one thing.

    **What is fixed regardless**: it draws on the bare frame, per requirement 6, and it carries no
    product name, per [[efforts/the-shell-says-whose-workspace-this-is]] requirement 5.

    **The stages are the real ones, and this is the work requirement 9 grows.** *The human asked for
    this explicitly rather than accepting a faked cycle.* The startup path exposes no stage today,
    so one has to be reported out of it. The five are the awaits `routes/+layout.svelte` already
    performs, in that order: the shell's settings and the locales, the session and admission, the
    bootstrap, the sync, the reconcile. Nothing may be invented to fill the bar out and nothing real
    may be folded away, because a bar that names a step the application does not take is a
    decoration wearing a report's clothes.

    **The bar has to be weighted, not merely stepped.** Five equal fifths over five stages that cost
    wildly unequal time gives a bar that walks to four fifths and then waits, which reads as stuck
    at exactly the moment it promised not to. Weights come from measuring a cold launch and a warm
    one, not from a guess, and that measurement is part of this requirement rather than a nicety.

    **The first stage cannot currently be drawn, and that is a defect this requirement inherits.**
    Nothing in the tree renders until the locales have loaded, which is the end of stage one, so the
    application's true first frame is an empty div rather than the loading screen. A loading screen
    that is absent for the first stage of loading fails its own purpose. Either that first stretch
    draws in the base locale, or it is deliberately blank and the bar starts at stage two and says
    so; what it may not do is stay an accident.

17. **The application has one tone vocabulary, and it is a consolidation rather than a new idea.**
    *Asked for 2026-08-20, after the tone requirement 15 gave the two failure screens was looked at
    and wanted everywhere.* The word arrived here as though the application had no tone. It had
    six, and no two of them agreed:

    | | Said | Where |
    | --- | --- | --- |
    | callout | error, info, success, warning | 17 call sites, 7 files |
    | standalone surface | neutral, notice, failure | 5 screens |
    | record action control | neutral, destructive | 6 call sites, already called it *tone* |
    | badge | destructive | 1 call site, a sync status |
    | toaster | its own four, uncoloured | every mutation in the application |
    | alert | a fifth set | **no call sites at all** |

    **The callout's names win**, because seventeen call sites already speak them and every other
    set was two or three. The vocabulary is `neutral | info | success | warning | error`, stated
    once in `$lib/design/tone`.

    **`neutral` is a tone, not the absence of one.** A surface that declares nothing reads
    identically to one whose author never considered the question, and those two should not look
    the same in the source either.

    **Two of the six colours did not answer to this application's palette.** The callout's `info`
    was raw `blue-300` and its `warning` raw `amber-300`, written inside the primitive where
    nothing connected them to `app.css` — so two of the four things a callout could say could not
    be changed from the place every other colour is changed from. `app.css` already records this
    exact defect about the greens, in those words. The values are unchanged so nothing on screen
    moves; what changes is that they are reachable.

    **The line is what a thing *reports*, not how loud a control is.** A callout, a surface's band,
    a status badge, a toast and a record action all report a kind of event, and they take a tone.
    A button's `destructive` and a menu item's `destructive` are emphasis on a control — shadcn's
    vocabulary, on files the CLI writes whole — and they stay. `--destructive` also stays as the
    token name under `error`: the vocabulary is what got a shared word, not every colour beneath it.

    **The dead `alert` primitive goes.** A sixth set of names with no callers is the next surface's
    invitation to adopt a vocabulary nobody uses.

    **Nothing gains a tone it has no caller for.** The record action control takes two of the five
    and not all five, because no record action has ever been a success or a warning — a control
    that succeeds is not an action, it is the result of one.


## What a list costs

18. **A list stays fast as the workspace fills, and the three things making it slow were measured
    rather than guessed.** *Added 2026-08-20 at the human's request, after the application was
    reported slower and the cost was taken against a real workspace of 5000 tenants, 1138 contracts
    and 647 payments.* The numbers below are from the engine this application ships, on a release
    build; the shipped debug build is worse.

    **This scope arrives here rather than in an effort of its own because the multi-record work
    above lands on exactly these paths.** Requirement 3 puts a plan query beside every action and
    requirement 4 exports a selection, and both read the same contract list; criterion 2 already
    asserts a cost property, one call and one reconcile pass. An effort that makes those paths do
    more without knowing what they cost is guessing.

    Three findings, each with its own criterion:

    | | Measured | Against |
    | --- | --- | --- |
    | the contract list's `paymentCount` | 60.7ms | 3.4ms without it |
    | a one-column folded search | 38.5ms | 1.8ms unfolded |
    | a three-column folded search | 110.7ms | 1.8ms unfolded |

    **The payment count is a correlated subquery over an unindexed column.** `contract/router.ts`
    counts payments per contract with `select count(*) from payment where contract_id = ...`, and
    nothing indexes `payment.contract_id` — the only indexes on these tables are primary keys and
    unique constraints. It is a scan of every payment for every contract, so it grows as the product
    of the two, and it runs on every read of the contract list.

    **The index is the control plane's to add and it is not a client change.** The workspace schema
    is `packages/workspace-migrations/`, and it is applied at the token mint; a client issuing its
    own DDL would have it captured as change data and replicated to every other replica. So this is
    a migration and a schema-version bump, which is why it is its own task. *The package was named
    `apps/control-plane/migrations/` here until 2026-08-21, which is the control plane's own
    database — accounts and workspaces — and not a workspace's ledger at all.*

    **Settled 2026-08-21 by `0004_ordinary_nightshade.sql`, and the figures are recorded in the
    migration's own notes.** Measured the same way as the row above and on the same replica:
    **62.0ms with `paymentCount` against 3.8ms without it before the index, and 4.9ms against 3.7ms
    after it** — sixteen times the query's own cost, down to one-and-a-third. **The other unindexed
    foreign keys were left alone**: nothing has measured `unit.complex_id`, `contract.tenant_id` or
    either of `contract_unit`'s costing anything, and an index is a write cost and a page cost on a
    database that replicates.

    **A rank-filtered list reads the whole table and narrows in the client.** A contract's rank is
    derived from what it owes *today*, so it cannot be a plain `where` — and the answer taken was to
    read every contract, serialize each across the boundary, compute the rank in JavaScript and
    discard the rest. The cost therefore scales with how many contracts exist rather than with how
    many are shown, which is the client-side narrowing [[rules/data]] refuses elsewhere. **What
    replaces it is not decided here**: expressing the rank in SQL and paging the result are both
    open, and the second is available even if the first is not.

    **Folding is paid on every search whether or not it can change the answer.** `matchesSearch`
    wraps each column in thirty-one nested `replace()` calls, so a search is a full scan with
    thirty-one string operations per row per column and no index can be used. The stored side is
    already skipped where folding provably cannot change it; **the missing half is the term.** A term
    holding no character any folding rule touches cannot match differently folded or unfolded, and
    that is most Latin-script searches. *The rule that both sides fold or neither does is not being
    weakened: where the term cannot fold, folded and unfolded are the same term, which is the same
    argument `storedSideCanFold` already makes for the column.*


# Acceptance Criteria

1. On each of the seven lists in requirement 1, turning selection on and choosing several records
   offers exactly the actions named for that list, and no others. *(R1)*
2. Performing a multi-record action on N records issues one procedure call, asserted in a router
   test. Where the action touches derived state, that test also asserts one reconcile pass the way
   `terminateMany`'s does: contracts, units and payments have derived state, and tenants and
   complexes have none, so their tests assert the single call and nothing about reconcile. *(R2)*
3. Selecting a set in which some records are refusable and asking for the action shows, before
   anything is written, how many would go through and how many would not with the reason for
   each; a handful of the refused records are named. Selecting a set in which none can proceed
   shows no destructive control. Dismissing the confirmation leaves every record unchanged. *(R3)*
3a. The confirmation's figures come from a plan call over the selected ids, not from the rows: a
    unit whose only assignment is a future contract is shown as refused, and a contract holding
    units and no payments is shown as refused. Where the workspace changes between the plan and
    the action, what the action actually refused is what the reader is told afterwards. *(R3)*
4. Every list offering an export offers exporting the selection, and the file written holds
   exactly the selected records. *(R4)*
5. After a multi-record action, one undo takes the whole action back, and each record it changed
   shows the change on its own history after a restart. *(R5)*
5a. Deleting several records and then making one of them unrestorable leaves, after undo, every
    record still deleted, a notice naming the one that blocked it, and the entry still on the undo
    stack so a second press can succeed. *(R5)*
6. Loading, a startup failure and an update recovery each draw on the bare frame, with no rail and
   no titlebar controls beyond the window's. Signing in and ready each draw inside the shell.
   *(R6)*
7. With no account on the machine, the rail is on screen: the account control is an empty user
   glyph whose menu holds the way in and settings and nothing else, the fold trigger works, and
   the four destinations, the workspace control, the search and the shortcut sheet are all present
   and refuse to act. The sign-in card is centred and is pixel-identical to the one that ships
   today. *(R7)*
7a. Signing in from that menu lands in `ready` without the rail disappearing and coming back.
    *(R7, and it is falsifier 3 from the prototype, which the run could not reach)* —
    **superseded 2026-08-22 by the human, in #735.** The menu row signs nobody in any more; it
    reaches the card, and the card's button starts the flow. What this criterion was written
    for survives it and is carried there: the rail does not disappear and come back across a
    sign-in, whichever control began it.
7b. With no account on the machine, `/settings` opens from the account menu and every group on it
    renders and works: language, notices, updates and diagnostics. *(R9a)* — **unmet, and carried
    by [[efforts/settings-and-the-workspace-finish-what-they-offer]] as its criterion 1.** See the
    note under requirement 9a for what landed and what did not.
7b-i. A test drives the whole router under a context with `identity: null` and asserts both halves:
    every public procedure answers, and a procedure that reaches the workspace refuses with
    `UNAUTHORIZED` — a read as firmly as a write, and the bootstrap among them. A search of the
    routers finds no `procedure.public` whose body names `ctx.db`. *(R9a)*
7c. Neither locale's workspace menu says "yet". *(R9b)*
8. A component made to throw while rendering shows a caught-error surface inside the shell rather
   than an empty window, the reader can get back to a working surface without quitting, and the
   failure is in the diagnostics file afterwards. *(R8)*
8a. The shell's own chrome made to throw shows the shared standalone surface rather than a blank
    window, and is also in the diagnostics file. *(R8)*
9. The eight paths named in requirement 9 are asserted by tests that drive the startup unit with
   no window, and those tests pass before any rendering moves. Afterwards
   `routes/+layout.svelte` holds none of the state machine, the admission ladder or the sign-in
   path. *(R9)*
10. On an existing complex, creating units accepts a run, expands it into named fields that can
    each be edited and removed before submitting, refuses a run over 500, and names the first
    colliding unit rather than reporting that two of them match, whether the collision is inside
    the run or against a unit the complex already holds. *(R10)*
10a. A run of eighteen units on an existing complex issues one call, writes eighteen rows in one
     batch, and one undo removes all eighteen. *(R10)*
11. A search of the tree finds one parser for the run notation, and both forms call it. *(R11)*
12. Every surface this effort adds or changes holds from 640x480 upward with no horizontal
    scrollbar, in English and in Arabic. *(the standing window range rather than a new bound, and
    it applies to every requirement above that draws anything)*
13. On the update-recovery screen, each of the version being started, the previous version and the
    reason appears exactly once. *(R13)*
14. From the startup-failure screen, the diagnostics folder can be opened without first getting
    the application to start. *(R14)*
15. Every screen rendering through the standalone surface declares a tone, and a search of the
    tree finds no call site that omits it. Update recovery and a startup failure are the two that
    declare something other than neutral, and they do not declare the same thing as each other.
    The two glyphs in a band measure the same and read as measuring the same. *(R15)*
16. The loading screen renders on the bare frame, carries no product name, draws no card, and shows
    a filling bar over the name of the stage the startup path is actually on. Every stage it names
    is an await that path performs, asserted by a test that walks a startup and records the stages
    reported: the sequence it sees matches the awaits in order, with none invented and none folded
    away. The first frame the application draws is either the loading screen or a blank stretch that
    is documented as one. *(R16)*

17. A search of the tree finds one tone vocabulary. No component declares its own set of kind-names,
    no `bg-`, `text-` or `border-` in `design/` names a raw Tailwind palette colour for a tone, and
    every tone colour resolves through a token in `app.css`. A callout, a badge, a toast and a
    surface band reporting the same kind of event draw the same token. The `alert` primitive is
    gone. *(R17)*

18. On a workspace of at least a thousand contracts and five hundred payments, the contract list's
    measured cost is within a small multiple of the same query with `paymentCount` removed, and the
    figure is recorded rather than asserted. *(R18)*
18a. A contracts list narrowed to one attention rank returns a number of rows proportional to what
     it shows rather than to the table, asserted by a test that counts what crosses the API for a
     rank holding a handful of contracts in a workspace holding a thousand. *(R18)*
18b. A search term containing no character any folding rule touches runs the unfolded comparison,
     and a term that does contain one still runs the folded comparison against the folded column.
     Both are asserted by tests, and a search for an Arabic name typed with a different alef still
     finds it. *(R18)*


# Constraints

- **The application's own surfaces stay on the shared standalone surface.**
  [[rules/interface]], under *Application surfaces*, binds starting, failing, recovering and
  reporting an unanticipated error to it, and the caught-error surface this effort adds is one
  more of exactly that kind. What changes is what is around those surfaces, not what they are.
- **A mutation is declared once, on the caller side, carrying its inverse.** [[rules/data]],
  under *Mutation declaration* and under *Undo*. A multi-record action that declares no inverse
  is outside undo, and requirement 5 says it is not.
- **An inverse naming a row that no longer exists fails visibly and does not recreate it.**
  [[rules/data]], under *Undo*. Undoing a multi-record deletion restores each record as itself by
  its own identity; a record another device deleted meanwhile is the measured exception, and it
  now applies to a set rather than to one row.
- **A write spanning tables is one batch, and the batch is the transaction.** [[rules/data]],
  under *Multi-table writes*.
- **Reconcile is scoped by trigger.** [[rules/data]], under *Reconcile scope*. A multi-record
  mutation reconciles the union of what it touched, once.
- **A row opens its record and does nothing else.** [[rules/interface]], under *Row activation*.
  Selection is a control on the row, which the shared list already honours.
- **Nothing writes unit status directly.** [[contexts/desktop/property]]. Deleting units in a set
  changes occupancy only through reconciliation.
- **`design/primitive/` is a permanent fork.** An existing primitive is changed by hand; the
  flags that regenerate in place discard the i18n and `dir` wiring in more than thirty files.
- **The sidebar primitive family is owned rather than generated**, which
  [[efforts/shell-presentation-spec]] set and the shell effort held.
- **Both locales, and Arabic is not accommodated after the fact.** Every surface here is checked
  right-to-left as it is built.
- **What signing in does is not reopened.** The admission ladder, the session window, the three
  situations and the retry path landed in #628 and #635. This effort changes where they live and
  what is drawn around them, and changes none of their behaviour.
- **The application's mark is beside the sign-in card again, and that is a reversal.**
  [[efforts/the-shell-says-whose-workspace-this-is/spec]], requirement 10, settled that the card
  carries no mark and no product name, and settled it by building two versions that carried the
  mark and removing both on sight. **The card is untouched here**, so that requirement holds
  literally: the mark is in the rail beside it, arriving because requirement 6 puts the shell in
  this state rather than because anybody put it back on the card. Recorded rather than absorbed,
  because it was reached the same way the original was, by looking, and a reader who finds the
  mark on that screen should be able to see that somebody meant it.

# Out of Scope

- **The contract's units transfer pane.** It already acts on many units at once, through a
  mechanism [[rules/interface]] fixes under *Contract unit transfer*: the tab holds both panes and
  performs the transfer itself. Adding a selection mode there would be two ways to do one thing on
  one surface, which is the failure this effort exists to remove rather than to spread.
- **Changing what any deletion is refused for.** Every rule stands exactly as it is. This makes
  the existing refusals reportable over a set instead of discoverable one record at a time.
- **Editing several records at once.** Only actions needing no input about the individual record
  are on a selection, which requirement 1 states positively and this states as the boundary.
- **Persisting a selection across a search, sort or filter change.** The shared list clears it
  deliberately, because the read then returns a set the reader was not looking at.
- **Retention or pruning of history entries**, which a multi-record action now writes several of
  at a time. [[efforts/work-the-surfaces-cannot-do]] left retention unsettled and this does not
  settle it.
- **A crash report that leaves the machine.** The boundary records through the diagnostics sink
  that already exists, bounded and redacted the way everything else in it is.
- **Range creation for anything but units.** Nothing else in this application is named in runs.
- **Creating a second workspace, switching between workspaces, inviting or removing anybody.**
  All still [[efforts/a-workspace-follows-its-user]]'s, and all still inert.
- **The four primary destinations.** They do not move, change icon, or gain a fifth, whatever the
  shell does around them.

# Assumptions

- **[[efforts/the-shell-says-whose-workspace-this-is]] is finished.** Its status reads `accepted`
  rather than `implemented`, and five commits carrying its work landed as #636 through #640 with
  no issue left open on the tracker. Taken as done. If work remains, the shell scope here waits
  on it rather than building over it.
- **Every list named in requirement 1 renders through the shared list block**, so the selection
  mechanism reaches all seven without a second implementation. Checked in the tree for all seven.
- **A payment deletion is refused for nothing.** `payment/router.ts` returns the missing row
  rather than throwing and enforces no blocking rule, so the payment confirmation is a count.
  Checked in the tree.
- **The reader who asked for this wants the import dialog's presentation rather than its
  machinery.** What is being taken is *show the outcome, then ask*, not the planning and
  resolution an import performs.

# Open Questions

~~**What the shell shows in each pre-ready state.**~~ **Answered 2026-08-20 by building it**, and
the answer is requirements 6 and 7 above.
[[efforts/capabilities-only-one-surface-got/evidence/prototypes/the-shell-before-the-application-is-ready]]
carries what was tested, what lost, and the falsifier that fired.

~~**Whether the sign-in card keeps its login-page presentation once the shell is around it.**~~
**Answered in the same run.** It does, unchanged, and what moved is what is around it.

Still open:

- **What the loading screen should be.** Three presentations are on screen as of 2026-08-20 and
  [[efforts/capabilities-only-one-surface-got/evidence/prototypes/what-the-loading-screen-should-be]]
  carries what each is betting. One of them would add work to requirement 9 and the file says so.
- ~~**What the recovery and startup-failure screens present, and whether the answer belongs to them
  or to the shared block.**~~ **Answered 2026-08-20**: the shared block, which is requirement 15.
  Four presentations were on screen and
  [[efforts/capabilities-only-one-surface-got/evidence/prototypes/where-the-failure-screens-are-wrong]]
  carries what each is betting. **The size of this scope depends on the answer**: one of the four
  puts the fix in the shared block, and requirement 15 is what then pulls the other five screens
  in with it.
- **Whether one confirmation surface serves all four kinds of multi-record action or each gets
  its own.** The delete dialog and the import dialog are two shapes today and this needs a third
  answer; which of the three it is belongs to `/plan`.
- **How `/settings` reads its settings with no identity on the request.** Requirement 9a names the
  two candidates and refuses one wrong answer; which of the two it is belongs to `/plan` and to
  [[rules/api-layer]].
- **Falsifier 3 was never reached**: whether arriving at `ready` reads as the rail filling or as a
  second application starting. It needs a real sign-in against a running control plane. The
  decision makes it cheaper rather than moot, because the rail is now on screen before the
  sign-in, and criterion 7a is where it gets checked.

# Risks

- **The shell's signed-out state reads as a broken application rather than as its front door.**
  The window shows navigation to places the reader cannot go, next to a card telling them to sign
  in. It shows up on the first screenshot, which is why the prototype comes before the build
  rather than after it, and the fallback is that requirement 7 changes shape rather than the code
  acquiring a workaround.
- **Multi-record delete is the most destructive control this application will have**, and one
  mis-read confirmation is many records rather than one. Requirement 3 is the mitigation and it
  is the requirement to hold hardest: the confirmation shows the outcome before the outcome.
- **A constraint that landed two days ago is being reversed.** The risk is not the reversal, which
  is the human's and is recorded; it is that the effort holding it is left standing with text
  contradicting this spec, which is what requirement 7 amends in the same change.
- **For three of the five concepts, delete will refuse the ordinary case, and this is now measured
  rather than argued.** The development database was purged and seeded once on 2026-08-20, and
  the seed's own distribution says:

  | Concept | Seeded | Deletable |
  | --- | --- | --- |
  | unit | 56 | **0** |
  | contract | 870 | **0** |
  | complex | 10 | 2 |
  | tenant | 5000 | 4194 |
  | payment | 527 | all |

  **Every unit and every contract in a realistic workspace is refused.** So on two of the five
  lists the delete control's ordinary outcome is a confirmation saying nothing can be deleted, and
  on a third it is eight times out of ten.

  **This is not new** and is exactly as true of the single-record delete those lists already
  offer; what is new is that it sits on a bar the reader summoned deliberately, which raises the
  expectation that it will do something. Requirement 3 is what keeps it honest rather than broken:
  the confirmation names which records are held and by what, before offering anything at all.

  **What this changes is the testing rather than the design.** Requirement 3's refusal path is
  trivial to exercise against this data and its success path is not: a task that verifies a
  multi-record delete of units or contracts has to make its own deletable records first. If it
  still reads as a dead control on screen, the answer is to take delete off those lists, not to
  loosen what refuses it.
- **The seven lists drift into seven confirmations.** The mechanism is shared and the presentation
  is per concept ([[rules/interface]], under *List presentation*), and the boundary between the two
  is where the copies will appear if this is built list by list.
- **Undoing a multi-record delete restores rows one identity at a time**, and a partial restore is
  a state the reader did not ask for. The exception [[rules/data]] measures under *Undo* is written
  for a single row and now has to answer for a set.
