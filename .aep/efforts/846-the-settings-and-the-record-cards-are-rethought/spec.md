---
status: accepted
---

# Problem

**The settings area does what it should and reads as a long column of legends, sentences and
outline buttons.** Effort 843 redesigned the way in and the workspace control after Apple; the
human said then that the settings would be amended after it. On 2026-10-02 they asked for that
rethink, and for the record lists across the application with it. Read against the code and
against how Apple and Google present the same things
([[efforts/846-the-settings-and-the-record-cards-are-rethought/evidence/research/how-apple-and-google-present-account-security-and-membership]]):

- **The area is flat.** `settings/component/area.svelte` draws a title, a row of plain underlined
  text tabs (`block/section-switch.svelte`, no icons), and each section as `Field.Set` blocks split
  by separators: a legend, one or two sentences, one outline button. Nothing groups related rows,
  nothing shows a value at a glance, and dangerous acts look like benign ones (*disconnect*,
  *forget Turso account* and *delete organization* are all outline buttons; only the last has red
  text). Four buttons carry no icon where their neighbours do (*connect*, *open Turso dashboard*,
  the mark's *remove*, ending soon's *save*).
- **Ending soon sits in general and does not belong there.** General holds application preferences
  (language, appearance, updates, diagnostics), and ending soon is a rule about contracts: the
  number of days before its end at which a contract ranks as ending soon on the dashboard, in the
  contracts filter and in the schedule. It is also the one row in general with a *save* button
  while its neighbours apply at once. The human: "the ending soon feels odd in the general tab".
  The HIG puts task options "in the screens they affect" (research, finding 5).
- **Signing out other machines is blind.** The account section offers one act, *sign out of other
  machines*, with no list: the reader cannot see which machines are signed in as them, when each
  was last seen, or end one. Google lists each device with when it was last active and signs out
  one at a time; Apple lists devices on the account page and removes one (research, finding 1).
  The backend has a `machine` table with `seen_at` and `created_at` per machine
  (`tauri/src/organization/store/session.rs`), but no machine name, and sessions end by a
  per-member epoch, so only *all others* can be ended today.
- **The Turso account block reads as two paragraphs and a button.** An owner whose machine holds
  the authority sees a sentence and *forget Turso account*; one whose machine does not sees two
  sentences and an iconless *connect*. Both vendors show a connection as an item with its state,
  and put its removal inside it, named for what ends (research, finding 2).
- **The leaving block does not say who may do what.** Everybody sees *disconnect* (this machine
  forgets the organization); an owner whose machine holds the authority also sees *delete
  organization*. Neither is told by an icon or a treatment which act is reversible, and an owner
  reading *leaving* is not shown that handing over ownership is how an owner steps away (that act
  lives only on the owner's own member card). Google gives the member *leave* and the manager
  *delete*, each with its consequence stated (research, finding 3).
- **Sync standing is a muted sentence.** "this machine and Turso" says "up to date, checked 2
  minutes ago" in muted text beside an outline *sync* button, and a problem appears as a callout
  under it. Nothing shows at a glance whether sync is healthy. Apple's iCloud pane marks state with
  a coloured status and names it (research, finding 4).
- **A workspace's file moves from beneath the directory, and only for the open workspace.**
  `organization/workspace/component/transfer.svelte` is drawn below the workspace cards, names the
  open workspace in its legend, and is not drawn when none is open; `api.transfer.get` takes no
  input and reads the open workspace. To export another workspace a person switches to it first.
  The card itself offers edit, members and delete. The HIG keeps commands with the item they act
  on (research, finding 7).
- **Record lists are one column of thin rows everywhere.** Tenants, complexes, units and contracts
  are 64 px horizontal cards in one column however wide the window is; status is an icon whose
  meaning needs a hover; a tenant row always shows six status counts, zeros included. The
  payment ledger shows a date and an amount, though a payment carries its method, reference and
  note. The list shell already lays records in columns (`recordMinWidth` on `list/component/list.svelte`)
  and no list turns it on.

# Goal

**The settings area reads like a well-made platform settings pane, and the record lists show
what a person came to see without a hover.**

Settings: each section is groups of rows, each row an icon, a name, its value or state, and its
control, with the destructive acts set apart and named for what they end. General holds only
application preferences. The reader's own account shows their machines and ends one or all. The
Turso account reads as a connection; the leaving block tells owner and member what each act
does; sync shows its state at a glance. A workspace's card exports and imports that workspace.

Records: tenants, complexes, units and contracts are cards in a grid of two or three columns,
each card carrying its key facts with icons and its status in words. The payment ledger stays a
statement read in time order, and each payment row says how it was paid.

# Scope

- **The settings area**: `settings/component/{area,page,ending-soon}.svelte`,
  `packages/design/src/lib/block/section-switch.svelte`, and every block the organization
  contributes: `organization/component/{settings-account,settings-organization,settings-workspaces,standing,mark,disconnect,disconnect-dialog,delete-organization}.svelte`,
  `organization/session/component/*`, `organization/setup/component/{forget-account,reconnect-authority}.svelte`,
  `organization/workspace/**`.
- **Machines and sessions**: the machine record and the session model in
  `tauri/src/organization/**` and `tauri/src/machine/**`, as far as listing a reader's machines,
  naming one, and ending one requires.
- **Ending soon**: its control on the dashboard (`dashboard/component/**`), and its removal from
  general.
- **Workspace transfer**: `transfer/**` and its router, as far as exporting and importing a
  workspace that is not open requires.
- **Record lists**: the list shell (`list/**`), `packages/design/src/lib/block/record-card.svelte`,
  the cells in `design/cell/**`, and the directories of tenants, complexes, units and contracts,
  wherever each is drawn (its own route, a tenant's contracts, a unit's contracts, a complex's
  units); the payment ledger (`payment/component/ledger.svelte`).
- The English and Arabic strings these read, and [[rules/interface]] where a decision here
  revises it, in the same change.

# Requirements

*The settings area*

1. **A section is groups of rows.** Each block in every section is drawn as a group of rows in the
   manner of a platform settings pane: a row carries a leading icon, a name, its current value or
   state where it has one, and its control, with at most one line of explanation, under the group
   rather than inside every row. The section switch names each section with an icon beside its
   word. The members and roles directories keep their tray and their cards; only their heading
   takes the group's treatment. *Revised 2026-10-02 after the human looked at the built cards, in
   their words: "in general settings what i mean is each card is under the next card; also for logs the open log oflder should be just hte icon; also whey there's a collapsoable on the diangostics; on the appearnce the explaintion on the button feels ood; also the same thing for the account tab each card needs to be in a sequeintal order these cards are looking good; the members grid record needs to be a gird of 3 columns or 2 like the other re cords shows more data better; the workspaces gird card needs to be more informative and better looking; also i've noticed a ting that red dangours actions title and action are in red; only the action button shoud be in red". So: a tab's cards stand one under the next in a single column,
   in every tab; in a card's ending rows only the act's button takes the error tone, the row's
   glyph and name stay neutral; the diagnostics card folds nothing and reveals its folder with an
   icon button; appearance carries no sentence of explanation under its choice; the members
   directory is a grid of member cards, two or three across, each saying more; and a workspace
   card says more and is drawn better. Then: "also for the check for updates button needs to be
   just hte icon and the unkown needs to be not their in the update version": check for updates
   is an icon button, and no *unknown* is drawn for the available version. Then: "the icon of update check needs to be rotating with anitmion while checking and the open log the folder icon needs to be look like it opend when clicked with animtion", and "the replace image button of seal; it should be the preview show if clicked it opens file system to replace it": the update check's glyph turns while a check runs and the log folder's glyph opens when
   pressed, both still under reduced motion; the seal's preview is itself the control that
   replaces it. Then: "the remove singtaure or seal section of the singtaure ore seal; needs to be integrated in into the parto f the iamge not a sapreate thing maybe a button or a thilng; also it should be named the section not "signature or seal" it should be "orgnizations stamp" or thing like that": the card is named the organization's stamp, and removing the
   stamp is a small act on the stamp's own picture, confirmed, rather than a row of its own. Then: "i like the information showen an d the icons on the members card in the org section; but the way their shown the place they are on; mabye there should be  on the card grid of tintied 4 filieds and thier icons and text on it thigns like that do your best desgin": a member card's facts sit as a grid of four tinted fields, each with its glyph, a label and its value.
   Then: "maybe i find it odd using the same icon of the sectio ntitle and descripto in the action button; espclillly on the leaving section hand over owenrhips should be named transfer ownership and the button should be transfer and in red and without icon the same for disconnect and delete without the icon; also i find it odd mutliple things change the org; the leavilng section the turso account section all feels odd and the same thing meabye tusro account section shoud'nt be there since disconnect this meachine does the same from what i understand; also i like that the roles are orderd cards but the looks of them and not using icons feels odd they should match the cards that use icons ad badges like the members card", and "the sync button should be the icon only with tooltip maybe". Asked whether the Turso account card should fold into sync, into
   leaving, or stay, the human chose "Fold it into Leaving". So: no button repeats its row's glyph; hand
   over ownership is *transfer ownership* with a red *transfer* button, and disconnect and delete are red
   text buttons; the Turso account card goes, its state, reconnect and forget joining the leaving card;
   the roles are cards in their order that match the member card; and sync is an icon button with its tooltip.* *Added 2026-10-02, at the human's word mid-run ("maybe settings in
   a section tab does not need to be sequential linear maybe they are cards and section of
   grids"):* a section is not one linear column. Its groups are cards laid out in a grid, two
   columns where the section is wide enough and one where it is not, each card holding its own
   title and its line of explanation; a group whose rows are a list that grows (machines, a
   directory) spans the full width, and so does a group holding only an act that ends something,
   which stays last.
2. **Destructive acts are set apart and look destructive.** In every section an act that deletes,
   disconnects, forgets or signs somebody out sits at the end of its group, drawn in the error
   tone, with an icon. Where it cannot be undone, or it ends something on another machine, it is
   confirmed, and the confirmation names what ends and whether anything brings it back; signing
   this machine out, which signing in undoes, is not confirmed (HIG, *Alerts*: confirm only what
   cannot be undone). A benign act never takes that treatment.
3. **General holds application preferences only**: language, appearance, updates and diagnostics.
   Ending soon is not in it.
4. **Every control in the area that applies a choice applies it at once**, as language and
   appearance do; none asks for a separate save. A choice that fails is put back and says why.
5. **Every button in the area carries an icon or none in its group does** (843, requirement 6),
   and the four iconless buttons named in the problem are resolved one way or the other.

*Ending soon*

6. **Ending soon is set from the dashboard, where it shows.** The ending-soon section of the
   landing screen carries a small icon control in its header that opens the number of days and
   changes it in place; the section and the counts that depend on it update without leaving the
   screen, and so does every other reading of the rank (the contracts filter, a contract's page,
   the schedule). The value stays a setting of this machine, as today. The command menu finds it.
7. **The setting stays reachable when nothing is ending soon.** Where no contract falls in the
   window, the ending-soon section's header is still drawn in its place, saying none end within
   the window, with the same control, so a reader can widen a window that catches nothing and see
   the section fill in place.

*The account section*

8. **The account section reads as the reader's sign-in and security**: who is signed in (the
   identity, the role and the organization), the password, and the machines, in that order, with
   sign-out of this machine last.
9. **The reader sees every machine signed in as them.** Each machine is a row with its name, when
   it was last seen, and when it was added to the organization, and the machine being used is
   marked as this machine and listed first. A machine is listed however long ago it was last seen,
   since a laptop closed for a month is the one a reader most needs to end, and last seen moves
   while a machine is running, not only when it starts.
10. **The reader can sign out one machine, or every machine but this one.** Signing out one is an
    act on that machine's row; signing out all others is one act at the foot of the list. Both are
    confirmed, name the machines they end, and leave the password unchanged. A machine that was
    signed out finds itself at the sign-in wall the next time it reaches Turso, as *sign out of
    other machines* does today. Offline, the act says it reaches the others once this machine is
    back online, as today. A machine that has not yet run this version cannot be signed out on its
    own, since it would not read the sign-out; its row says so and offers *sign out all other
    machines*, which reaches every machine. *Decided 2026-10-02 by the human, at converge: the
    one-machine sign-out moves off the row into the row's menu, so only *sign out all other
    machines* stands in the error tone, last in its group (requirement 2).*
11. **A machine has a name a person recognises.** A machine is named when it signs in, by the name
    its operating system gives it, so the list reads as the reader's own computers rather than
    identifiers.

*The organization section*

12. **Sync shows its state at a glance.** The sync group shows one named state (up to date,
    syncing, not yet reached, needs attention, needs reconnecting) with an icon and tone of its
    own, when it last reached Turso, and the *sync* control (named *sync* at the human's word of
    2026-09-17, kept on 2026-10-02). A problem keeps the explanation and the act
    it offers today, under the state rather than instead of it.
13. **The Turso account reads as a connection.** The Turso group is one row naming the
    connection and its state on this machine: connected, or not held here with the act that
    reconnects it. Forgetting it is the group's destructive act (requirement 2), and its
    confirmation says the token is not revoked and where to revoke it, as today.
14. **Leaving tells owner and member apart.** A member sees *disconnect this machine*, with an icon,
    and one line saying the organization stays on Turso and a new link brings them back. An owner
    sees the way to hand over ownership first (the act their member card already carries, shown
    refused with its reason where nobody can take it yet), then *disconnect this machine*, then
    *delete organization* last, set apart as the one act nothing undoes. Each act states its
    consequence in a line, and none of them looks like another.

*The workspaces section*

15. **A workspace's file moves from its card.** Every workspace card the reader may export from
    offers *export* and *import* among its acts, on that workspace, whether or not it is open on
    this machine. The transfer block below the directory is gone. An act the reader may not take
    on that workspace, by their access in that workspace, is shown refused with the reason, as
    every act is ([[rules/interface]], *Record card actions*). A workspace that is not open is
    read from and written to Turso directly, so its transfer needs Turso reachable: unreachable,
    the act says so when pressed, and nothing is written. A workspace not yet brought up to this
    version refuses with the sentence that opening it once on this machine brings it up to date.
    The open workspace's transfer works offline, as today.
16. **A workspace card says more than its name.** It shows that it is open on this machine in words
    as well as the mark, how many members hold it, and the reader's own access to it.
17. **The earlier records keep a way in.** The callout that brings in the records of 0.12.0 or
    0.13.0 stays reachable from the workspaces section, and brings them into the workspace it
    names.

*Record lists*

18. **Tenants, complexes, units and contracts are a grid of cards.** Wherever one of these is listed,
    its records are cards laid in two columns, or three where the window is wide enough, and one
    where it is narrow. Search, filter, sort, selection, keyboard movement, the transfer menu, the
    empty and loading states and virtualization work as they do in one column. *Narrowed
    2026-10-02, at the human's word on the prototype ("i liked all cards views except the units
    view feels odd since they are accessed via contract or complex also they feel too much space
    they occupy for no reason"):* units are not a grid. A unit is reached through its complex or its
    contract, so the units list keeps its compact rows; only tenants, complexes and contracts are
    grids.
19. **A card shows its record's key facts without a hover.** Each concept's card carries its name,
    the facts a reader scans for, each with an icon, and its status as an icon with its word. A
    count of zero is not drawn. What each card holds is decided per concept, the way
    [[rules/interface]] already gives each concept its own presentation. A contract card names the
    units it holds.
20. **The payment ledger stays a statement, and says how each payment was made.** Payments stay one
    column in time order, grouped by month with the month's total. Each row shows the date, the
    amount, the method with its icon where one was recorded, and the reference and note where
    there are any.

*Across all of it*

21. **Both directions, both appearances, the keyboard and reduced motion.** Every surface above
    mirrors in Arabic, reads in light and dark, is reachable and operable by keyboard, and has no
    motion under reduced motion.
22. **The rules say what was built.** [[rules/interface]] is revised in the same change where this
    effort departs from it: *Export and import* (a workspace's file moves from its card),
    *Landing screen* (a section may carry the control for the setting that defines it, and its
    header stands with no rows), *List presentation* (the four directories are grids), and *Status
    presentation* (a status on a grid card carries its word).

# Acceptance Criteria

1. Each settings section, opened signed in as the owner, shows its blocks as grouped rows with a
   leading icon, a name and a value or control; the section switch shows an icon beside each
   section's name. At a width that fits two columns, a section's groups sit as cards in two
   columns, the growing lists and the ending groups spanning both and the ending groups last; at
   a narrow width every group is one column.
2. Every disconnect, forget, delete and sign-out act in the area is the last item in its group,
   drawn in the error tone with an icon; every one of them that cannot be undone or reaches another
   machine is confirmed, stating what ends and whether it can be undone; no other act uses that
   tone. *By the human's decision of 2026-10-02 (requirement 10): one machine's sign-out is an
   entry in that machine's row menu, confirmed and naming it, in the menu's default tone; it is the
   one ending act that is neither last in its group nor in the error tone.*
3. General shows language, appearance, updates and diagnostics, and no ending-soon control.
4. No control in the settings area has a separate save step; a failed change reverts and shows the
   reason (checked by forcing the settings write to fail).
5. Within each group of buttons in the area, either every button has an icon or none does.
6. On the dashboard, the ending-soon section's header has an icon control; changing the days there
   updates the section's contracts, the band's counts and the contracts list's ending-soon filter
   without a reload or a navigation, and the value survives a restart of the application. Typing
   *ending soon* in the command menu opens the control.
7. With no contract inside the window, the dashboard draws the ending-soon header saying none end
   within it, with the control, and widening the window until a contract falls inside it fills the
   section in place.
8. The account section shows, in order: identity with role and organization, password, machines,
   sign out of this machine.
9. Signed in as one member on two machines, each machine's account section lists both, with name,
   last seen and added, and marks itself as this machine, first; a machine last seen 30 days ago is
   still listed; another member's machines are not.
10. From machine A, signing out machine B by its row leaves A signed in, sends B to the sign-in wall
    on its next contact with Turso, and leaves the password unchanged; *sign out all other
    machines* does the same for every machine but A. Both confirm first, naming the machines.
    Offline, the act reports that it reaches the others once back online. B, closed when it was
    ended, lands at the wall at its next launch. Signing B in again with the same password keeps it
    signed in. A machine that has not run this version shows its single sign-out refused, with
    *sign out all other machines* offered.
11. A machine signing in after this lands appears in the list under its operating-system name; one
    that signed in before and has no name yet appears with a stated fallback, never a raw id.
12. The sync group shows each of the five states with a distinct icon and tone (checked by driving
    each state through the sync host), the last time Turso was reached, and *sync*; a problem
    shows its explanation and act beneath the state.
13. An owner whose machine holds the authority sees the Turso row as connected, with *forget* as
    the group's destructive act and its confirmation naming where to revoke the token; one whose
    machine does not sees it as not held, with an icon-bearing reconnect act.
14. A member's leaving group shows only *disconnect this machine* with its consequence line; an
    owner's shows *hand over ownership* (opening the existing offer form), then disconnect, then
    *delete organization* last and destructive.
15. A workspace card that is not open on this machine offers *export* and *import*; exporting it
    writes that workspace's records (checked against a workspace with known records while another
    is open), and importing writes into it and not into the open one. No transfer block is drawn
    below the directory, and no file for that workspace is left on the machine. A reader lacking
    the flags in that workspace sees both refused with the reason while the open card's are
    offered. With Turso unreachable, exporting a workspace that is not open says so and writes
    nothing.
16. Each workspace card shows *open on this machine* in words where it is, the member count, and the
    reader's access to it.
17. With 0.12.0 or 0.13.0 records left on the machine, the workspaces section still offers the
    callout, and bringing them in writes into the workspace it names.
18. With a wide window, the tenants, complexes and contracts lists show three columns; narrowed,
    two; narrower, one; a complex's units list keeps its rows (narrowed 2026-10-02, requirement 18). In each, `/` searches, the filter and sort work, arrow
    keys move across and down, selection selects, and a list of a thousand records scrolls without
    drawing all of them.
19. On each of the four concepts' cards, status reads as an icon and a word, every fact carries an
    icon, and no count of zero is drawn; a contract card names its units.
20. The ledger is one column grouped by month with totals; a payment recorded with a method,
    reference and note shows all three, and one recorded without them shows date and amount alone.
21. Every surface in criteria 1 to 20 is checked in Arabic and English, light and dark, by keyboard
    alone, and with reduced motion on.
22. [[rules/interface]]'s *Export and import*, *Landing screen*, *List presentation* and *Status
    presentation* sections describe what was built, and the index validates.

# Constraints

- **Apple's HIG first, Google second**, for every look and behaviour decided here; a decision that
  leans on one names it. *Why: the human's standing direction since effort 843.*
- **Credentials stay in Rust** ([[rules/credentials]], *Client boundary*). Listing machines and
  ending one hands TypeScript machine names and times, never a token or a session secret.
- **Ending one machine must hold against a machine that is offline when it is ended**: the machine
  learns it on its next contact, as the epoch does today. *Why: the application is offline first,
  and a sign-out that only works while the target is online is no sign-out.*
- **Ending soon stays a per-machine setting.** *Why: the human chose the dashboard control over
  making it organization-wide on 2026-10-02.*
- **Exporting a workspace that is not open must not switch the window to it**, and must not leave
  that workspace's replica on a machine that did not already hold it.
- **Earlier decisions this reverses, at the human's choice of 2026-10-02**: effort 843 took the
  *open* word and the access line off the workspace card, and effort 828 (requirement 25) retired a
  coloured sync status word. Both come back here.
- **The record card keeps its two routes and one declaration** ([[rules/interface]], *Record card
  actions*): the grid changes how a card is laid out, not where its acts come from.
- **Strings follow the application's voice** (lower case, short), in English and Arabic.
- **No em dashes** in commits, pull requests or source comments ([[policies/reporting]]).

# Out of Scope

- **A setting that is organization-wide.** Ending soon stays per machine; nothing here moves a
  setting into the organization.
- **A non-owner leaving the organization on Turso.** A member still has only *disconnect this
  machine*; being removed is done by somebody above them, as today.
- **Changing what ownership handover does.** The leaving group opens the existing offer; its
  behaviour is unchanged.
- **Renaming a workspace that is not open**, or any workspace act other than export and import
  gaining reach over a workspace that is not open.
- **Per-workspace sync standing** for workspaces that are not open. Sync describes this machine's
  open workspace and the organization, as today.
- **Payments as a card grid**, and the history list. The ledger is revisited only as far as
  requirement 20 says.
- **The member and role directories as grids.** They stay one column of cards; a dozen people read
  better as a list.
- **The contract's unit transfer panes.**
- **The way in, the wall and the workspace control**, which effort 843 settled.

# Assumptions

- A machine's operating-system name is readable from the shell on Windows and macOS without a new
  permission.
- Machines that signed in before this lands can be shown with a fallback name until they next sign
  in, and the fallback is acceptable to the human.
- The machine table can hold a name and a per-machine session marker without a workspace
  migration, since it lives in the organization's store rather than a workspace.
- A workspace that is not open can be read and written over Turso's pipeline with the credential
  the member's vault already unsealed for it; no token is minted (the plan, *Architecture*).
- The list shell's existing column support (`recordMinWidth`, `listRows`, keyboard movement across
  columns) is sound, and the missing column gap is its only visible defect.

# Risks

- **Per-machine sign-out touches the credential path.** A mistake signs out the wrong machine or
  none, and shows up only across two machines, so it needs a two-machine check before merge.
- **A transfer of a workspace that is not open misses this machine's own writes to it that never
  reached Turso** (written offline, then switched away); they reach Turso when it is next opened.
- **Offline cannot be known before the press**, so a transfer of a workspace that is not open is
  offered and refused when pressed rather than shown refused in advance.
- **A grid with fixed row heights clips or overlaps a card whose content runs long**, worst in
  Arabic and at large text sizes; each concept's card height has to be checked in both languages.
- **Moving ending soon off settings hides it from a reader who looked for it there.** The command
  menu should still find it.
