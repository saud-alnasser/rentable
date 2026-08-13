# rentable

## 0.12.0

### Minor Changes

- [#363](https://github.com/saud-alnasser/rentable/pull/363) [`1551d72`](https://github.com/saud-alnasser/rentable/commit/1551d729142ca17979e920538fbe026efe6141b6) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - enter a complex and its units together — the whole thing is created in one go, or not at all

- [#437](https://github.com/saud-alnasser/rentable/pull/437) [`c81d174`](https://github.com/saud-alnasser/rentable/commit/c81d1740f79b228fe41f9f778ac96dacac4c98fa) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - creating a complex now opens an edge sheet, and its units are described in one line rather than
  one at a time: "a 1-18" adds eighteen named units, each of which stays editable and removable on
  its own afterwards. editing an existing complex is unchanged

- [#434](https://github.com/saud-alnasser/rentable/pull/434) [`7b4608b`](https://github.com/saud-alnasser/rentable/commit/7b4608b9ea18ebb1046bd17f213ff8b7e84cf20e) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a complex's record now states how many units it holds, how many are occupied, how many are
  vacant, and how many contracts run against those units today — where it used to state only the
  unit total

- [#401](https://github.com/saud-alnasser/rentable/pull/401) [`2867c5d`](https://github.com/saud-alnasser/rentable/commit/2867c5d4d91f9206adc591d593d057946d44092a) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - deleting a record, and terminating a contract, no longer wear a warning colour while you are just
  reading the record — they take it when you reach for them, and the confirmation each opens still
  asks in red

- [#366](https://github.com/saud-alnasser/rentable/pull/366) [`9d0af5e`](https://github.com/saud-alnasser/rentable/commit/9d0af5eee941d9f263324f6e6d21b6d4263363eb) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - export a directory to a spreadsheet file — exactly the rows on screen, under the search and order they are shown in

- [#431](https://github.com/saud-alnasser/rentable/pull/431) [`69eede5`](https://github.com/saud-alnasser/rentable/commit/69eede516b028f2433951c3263855991f87c580d) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the tenants and complexes lists now colour a count when what it counts is live — a tenant
  holding a running contract, a complex with units let — instead of rendering every figure in the
  same grey. a complex row also says how many of its units are occupied, not only how many there
  are and how many are free, and the unit total is drawn as a grid of spaces rather than as a door

- [#432](https://github.com/saud-alnasser/rentable/pull/432) [`65215b3`](https://github.com/saud-alnasser/rentable/commit/65215b376f4be1ae19f34edc9c51a7b78e6daeb3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a tenant's phone number has moved out from under their name and into the field list, labelled,
  directly beneath the national identity number. the two are both digit strings, and reading one
  of them off a screen holding the other was a matter of guessing from the format

- [#436](https://github.com/saud-alnasser/rentable/pull/436) [`de64759`](https://github.com/saud-alnasser/rentable/commit/de647591981d23b17376d423552c531074bfc152) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a diverged workspace's two copies are now the choice itself: select the copy to keep, and one
  control in the corner of the question acts on it. each copy states what it is and when it was
  last written without needing a pointer, and leaving the question unanswered moves out to the
  corner of the card that raised it

- [#350](https://github.com/saud-alnasser/rentable/pull/350) [`5274956`](https://github.com/saud-alnasser/rentable/commit/52749564e1e1a581d5a296b9f5306fdb175c6bf5) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - assigning units to a contract now opens the shared form surface, instead of a panel sitting inside the contract's units tab, and that tab becomes a directory whose rows open a unit's page. when a contract is terminated or already has a payment recorded, the assign and remove controls are absent and a notice says which rule applies — rather than letting you try and then refusing.

- [#367](https://github.com/saud-alnasser/rentable/pull/367) [`1a5d0ad`](https://github.com/saud-alnasser/rentable/commit/1a5d0adc3b5954c4902494b10cfcad201c070fb1) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - back on a record now returns to the screen you opened it from, not to a fixed directory

- [#263](https://github.com/saud-alnasser/rentable/pull/263) [`5539a72`](https://github.com/saud-alnasser/rentable/commit/5539a728151eec392ec6f7e0bd3540b3c7d52e0c) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the interface is black and high-contrast now. the frosted-glass panels, the coloured glow behind the window and the tinted gradient under everything are gone, and surfaces separate by their own weight instead — each panel a step lighter than what holds it, over a hairline edge. blue no longer tints the furniture: it marks the tab you are on, the row you picked and the field you are typing in, and nothing else. controls are a step shorter throughout, so a form or a menu shows more at once.

- [#264](https://github.com/saud-alnasser/rentable/pull/264) [`13b6870`](https://github.com/saud-alnasser/rentable/commit/13b6870635a70efaf0c566e349a26df3558faa15) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - navigation moved into a collapsible sidebar down the side of the window, replacing the row of icons in the title bar. it collapses to icons and back with the button beside the breadcrumbs or ctrl+b, it remembers which way you left it, and it sits on the right in arabic. the title bar now carries the breadcrumb trail for where you are, and dragging the window and the minimise, maximise and close buttons follow the reading direction with it. the window can no longer be resized smaller than 640×480, which is the narrowest the layout is built to hold. creating and editing a tenant opens in a panel that slides in from the side instead of a box in the middle of the screen — the rest of the forms follow as their lists are rebuilt.

- [#285](https://github.com/saud-alnasser/rentable/pull/285) [`74969c8`](https://github.com/saud-alnasser/rentable/commit/74969c8ff2f37507629f47b062d0db269404fbee) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the complex and payment forms open on the shared form surface. both are still a panel in the middle of the window, but they now use the full width of a narrow window instead of a fixed column, they keep everything you have typed if you resize while one is open, and they carry the same header, footer and scrolling as every other form. an amount with more than two decimal places is now refused in your own language, in the form, where the rest of the errors already appear — the browser used to refuse it in english with a bubble of its own.

- [#349](https://github.com/saud-alnasser/rentable/pull/349) [`1c73468`](https://github.com/saud-alnasser/rentable/commit/1c73468fe1982595ab59abf5544053624cffafa9) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a complex lists its units as a directory, the same shape every other record uses, and a row opens that unit's page. where a tile said occupied or vacant through its border, a row says it in words — the tenant's name, or vacant.

- [#286](https://github.com/saud-alnasser/rentable/pull/286) [`73aae04`](https://github.com/saud-alnasser/rentable/commit/73aae04ea97299f45c1c089acaed23fbd394bab8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the contract and unit forms open on the shared form surface, which is now the only way a form opens anywhere in the application. the contract form arrives from the side of the window instead of sitting in a box in the middle, and the unit form is a panel like the complex and payment ones. a cost with more than two decimal places is refused in your own language, in the form, where the rest of the errors already appear — the browser used to refuse it in english with a bubble of its own.

  the contract form is also rebuilt inside. it opens with a summary of the contract you are making — the tenant, the total, and the period — which stays in view as you scroll and fills in as you type, so you can see what you are about to create without reading it back off the fields. the fields themselves sit in one column, cut into the panel rather than stacked as boxes on top of it, and the tenant picker opens showing your tenants instead of asking you to start typing first.

  every form now tells you where a problem is. a field that needs fixing turns red and carries a mark, and hovering or tabbing to it shows what is wrong — replacing the list of messages that used to collect at the bottom of the panel, which told you what was wrong but never which box to fix.

- [#346](https://github.com/saud-alnasser/rentable/pull/346) [`ec54915`](https://github.com/saud-alnasser/rentable/commit/ec54915685b6a2180dc2691bbebfb6627debdf42) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a contract row shows how far through paying it is, as a ring with the percentage at its centre, in place of the cost per interval. the amounts and the cost with its interval move into the tooltip. the ring fills once when the row's figures arrive, and stays still if you have asked for reduced motion. cost is still what you can sort and search by.

- [#300](https://github.com/saud-alnasser/rentable/pull/300) [`7f004b2`](https://github.com/saud-alnasser/rentable/commit/7f004b2525a3049427e8b2bdbd9163ac0e5a680c) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the contracts list reads as a directory rather than a triage queue. the status headings are gone and every contract sits in one list, so scheduled and expired contracts no longer take a heading of their own. a row leads with the tenant, carries the contract number and the period it runs over beneath, and ends with the status and the cost — the cost shown with the interval it is charged over, so the figure is not mistaken for what the whole contract is worth.

  the list can be ordered by tenant, by contract number, by start, by end, by cost, or by status, and the order is the database's rather than the screen's. ordering by status follows what needs you first — defaulted, active, scheduled, then fulfilled, expired and terminated — rather than the alphabet. contracts tied on the chosen order fall back to tenant name and then to when the contract runs.

  searching still runs in the database and still finds a contract by phone or tenant even though a row does not show them.

- [#274](https://github.com/saud-alnasser/rentable/pull/274) [`1050eea`](https://github.com/saud-alnasser/rentable/commit/1050eeacb894961948f27a0ab87249809ef20068) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the contracts list opens as a queue rather than a grid of cards. contracts are grouped by what needs you first — defaulted, then active, then scheduled, with fulfilled, expired and terminated below them — and inside each group the soonest end date leads. a row carries the tenant, how much of the contract has been paid, and when it ends, and opens the contract.

  searching runs in the database now instead of over everything already loaded. it still finds a contract by government id, phone, cost or interval even though a row no longer shows those, and a search containing % or _ looks for those characters rather than treating them as wildcards. the whole list arrives at once, so there is no more loading as you scroll.

  progress bars fill from the right in arabic, where they used to fill from the left.

- [#345](https://github.com/saud-alnasser/rentable/pull/345) [`ebde6da`](https://github.com/saud-alnasser/rentable/commit/ebde6da805ab5d45f0a26050b58d7ca363473cba) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the counts on a row — a tenant's contracts, a complex's units — now say what they are counting when you hover them, instead of only telling a screen reader. a contract row also shows how many payments have been recorded against it.

- [#351](https://github.com/saud-alnasser/rentable/pull/351) [`0ead2ad`](https://github.com/saud-alnasser/rentable/commit/0ead2ad923424b953911059650b717ff0499c3cd) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - all five forms now read the same way, with their controls cut into the surface rather than sitting in a bordered box. the tenant form pins a read-out of the identity being entered, and the payment form one showing what the contract still owes beside what it would owe once the payment lands.

- [#265](https://github.com/saud-alnasser/rentable/pull/265) [`694673b`](https://github.com/saud-alnasser/rentable/commit/694673b31879cfac00a0aad7b200bef55035f480) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a command palette opens over the app with ctrl+k, or from the search button beside the breadcrumbs. type a few letters to jump to the dashboard, tenants, complexes, contracts or settings, or to start a new tenant, complex or contract — starting one takes you to its list and opens the form there. it searches whatever language the app is in, and reads right to left in arabic.

- [#299](https://github.com/saud-alnasser/rentable/pull/299) [`6d0c9ec`](https://github.com/saud-alnasser/rentable/commit/6d0c9ec4616542897642ad333bab63a1552903ef) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - make the landing screen the day's work: the contracts needing action open as a queue grouped
  overdue, owing, then ending soon, each heading stating its contract count and its money total.
  a contract joins a money group when it owes anything today rather than when a payment fell due
  this calendar month, so a contract behind by cycles from earlier months is no longer hidden.
  clicking a money row opens the payment form with the contract already chosen; the fifteen
  portfolio figures are replaced by two — this month's collected against due, and occupied
  against total units.

- [#400](https://github.com/saud-alnasser/rentable/pull/400) [`d109cd5`](https://github.com/saud-alnasser/rentable/commit/d109cd5754b43f697c1c7b702808955bd69fae49) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - every screen now occupies the same width with the same padding, so the application stops changing
  shape as you move through it, and a border comes out wherever a background step was already doing
  the separating

- [#353](https://github.com/saud-alnasser/rentable/pull/353) [`2f23eed`](https://github.com/saud-alnasser/rentable/commit/2f23eede06642762e10f0a276bb165b08da47ab8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a payment has its own page — what it was, when, and the contract and tenant it belongs to, with a link back to the contract. a ledger line opens it, in place of a row menu. editing and deleting are still there, and are still refused on a terminated contract.

- [#298](https://github.com/saud-alnasser/rentable/pull/298) [`a701777`](https://github.com/saud-alnasser/rentable/commit/a70177767c0276fbc1ab99e0b8e02e24e5559a10) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a contract's payments read as a ledger rather than a grid of cards. rows are grouped by the month they were made in, newest first, each row carrying its date with the amount trailing it, and each month carrying what its payments add up to.

  the foot of the ledger states what the contract still owes against what it is worth in total, taken from the figures the contract already keeps rather than added up from the rows on screen — so a search never changes the balance.

  searching the ledger is answered by the database in one query, over the amount and the day a payment was made, and the whole ledger arrives at once instead of loading as you scroll. adding, editing and deleting a payment still work from it, and a terminated or fully paid contract still says why it will not take one.

- [#297](https://github.com/saud-alnasser/rentable/pull/297) [`72ef95f`](https://github.com/saud-alnasser/rentable/commit/72ef95f3da0fc4235b5952c628770c690fdf411a) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the complexes list reads as a directory rather than a grid of cards. a row leads with the name, carries the location beneath it, and shows how many units the complex holds and how many of those stand vacant — so a screen shows the buildings you were scrolling past. the list can be ordered by name, by location, by unit count or by vacant count, and the order is the database's rather than the screen's.

  the units inside a complex read as an occupancy board: a tile per unit, laid out across the window and reflowing as it resizes. a let unit is a solid tile naming the tenant living in it; a free one is a dashed tile that says vacant. searching the board reaches the tenant's name as well as the unit's.

  both lists arrive at once, so there is no more loading as you scroll, and the unit and vacant counts come from the same query as the rows rather than from a count per building.

- [#354](https://github.com/saud-alnasser/rentable/pull/354) [`c4b2711`](https://github.com/saud-alnasser/rentable/commit/c4b27110a8cca52b5dffee88d7f223433fea49c9) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a row on the landing screen now opens its contract, the way every other row in the app opens its record, rather than opening the payment form with the contract already chosen. recording a payment from there is two clicks instead of one. the groups, their ordering, and the selectable phone number are unchanged.

- [#365](https://github.com/saud-alnasser/rentable/pull/365) [`9af422e`](https://github.com/saud-alnasser/rentable/commit/9af422ec72e5ec8e79d058328aa0912264524323) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - copy a record's details to the clipboard from its own page, and start a new record from an existing one

- [#357](https://github.com/saud-alnasser/rentable/pull/357) [`1697819`](https://github.com/saud-alnasser/rentable/commit/169781997cf4439cdc4ae9bdf3fbd0ffa089df15) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the workspace and sync section reads as rows like the rest of settings, and the Drive usage figures appear once instead of twice. a pending conflict is worded the same way wherever it is raised.

- [#356](https://github.com/saud-alnasser/rentable/pull/356) [`54c5493`](https://github.com/saud-alnasser/rentable/commit/54c5493b746484fff57103ae0fd3a6131531e339) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - settings is one column in four groups — general, workspace, updates, diagnostics — instead of a strip of tiles above a grid of cards. the tiles are gone rather than restyled: every figure on them was already stated by the section that owns it, and the version now lives in updates and nowhere else.

- [#355](https://github.com/saud-alnasser/rentable/pull/355) [`a29f687`](https://github.com/saud-alnasser/rentable/commit/a29f687841b528acd306510c49dfdde4c91181f1) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the screens the app shows about itself — starting up, failing to start, recovering, choosing a workspace, and the one you meet when something breaks unexpectedly — now share one surface and one width, instead of six that each picked their own. the error screen gains a sentence in your language and a way back, where it used to print a status code and nothing else.

- [#344](https://github.com/saud-alnasser/rentable/pull/344) [`f256ba4`](https://github.com/saud-alnasser/rentable/commit/f256ba4cde791eb5e01884b3e7097c601c408b1b) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a status is now an icon rather than a word in a badge, everywhere one is shown — a contract's, a unit's, a payment's. hover it, or reach it with a screen reader, and it names itself and says what it means. the icons are a set rather than nine separate pictures: being paid in full reads as a check, and what still owes carries a clock or an alert.

- [#284](https://github.com/saud-alnasser/rentable/pull/284) [`c6cfcaf`](https://github.com/saud-alnasser/rentable/commit/c6cfcafe05966d905142a609d0d826ac64ec8ef4) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the tenant form opens on the shared form surface. it is still the panel that slides in from the side, and it still reads from the right in arabic, but it now uses the whole width of a narrow window instead of sitting in a fixed column with empty space beside it, and it keeps everything you have typed if you resize the window while it is open.

- [#347](https://github.com/saud-alnasser/rentable/pull/347) [`6f1edc5`](https://github.com/saud-alnasser/rentable/commit/6f1edc53a10b636886b2902f128ef144a7264458) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a tenant's profile now has tabs, and the contracts tab lists what that tenant rents — searched and sorted the same way the contracts directory is, minus the tenant column, which holds the same name on every row there.

- [#290](https://github.com/saud-alnasser/rentable/pull/290) [`b02fa15`](https://github.com/saud-alnasser/rentable/commit/b02fa1524577e627b9b9c6ac8e17a25defbcb4b3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the tenants list reads as a directory rather than a grid of cards. a row leads with the name, carries the national id and phone beneath it, and shows how many contracts that tenant currently holds — so a screen now shows the people you were scrolling past.

  the list can be ordered by name, by national id, or by how many contracts a tenant holds, and the order is the database's rather than the screen's. a contract counts as held while its period covers today and nobody has ended it by hand; a contract that is paid up still counts, one that has expired does not.

  the whole list arrives at once, so there is no more loading as you scroll.

- [#397](https://github.com/saud-alnasser/rentable/pull/397) [`a421986`](https://github.com/saud-alnasser/rentable/commit/a42198666424e7e7d40827ae7d033e25831acb19) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a complex and a unit read on the shared record surface: no panel, no field tiles, their units
  and contracts under their own heading with no tab to press, and a way back from a record that
  cannot be found

- [#438](https://github.com/saud-alnasser/rentable/pull/438) [`493203b`](https://github.com/saud-alnasser/rentable/commit/493203bfd0fcda8b25eb4932bc302c4f190bbfd5) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the dialog that asks before something is destroyed is rebuilt: the action names it, the record
  leads the sentence below, and the destructive control is the primary one inside it. where
  something depends on the record there is no destructive control at all — only what blocks it,
  and a way out

- [#399](https://github.com/saud-alnasser/rentable/pull/399) [`17054c3`](https://github.com/saud-alnasser/rentable/commit/17054c382cc4505f2965ef9ec861db19bd0f4f02) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a contract reads on the shared record surface: its tenant, period and status lead, its six fields
  read as aligned rows rather than bordered tiles, opening it lands on its payments with its units
  one quiet choice away, and neither terminating nor deleting is the loudest thing on the screen

- [#389](https://github.com/saud-alnasser/rentable/pull/389) [`dbd17b1`](https://github.com/saud-alnasser/rentable/commit/dbd17b1fe74193fa2321654dd93e3451a889fbc3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the contracts list can be narrowed to the contracts that are overdue, behind, or ending soon — the same three ranks the landing screen files them under — and the filter sits in the list's toolbar beside its search and its order

- [#368](https://github.com/saud-alnasser/rentable/pull/368) [`dc717ee`](https://github.com/saud-alnasser/rentable/commit/dc717eea3f044ba4786f8d6f232b8ae38d516e1b) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the delete confirmation names the record and, where something depends on it, says what — and offers nothing destructive

- [#389](https://github.com/saud-alnasser/rentable/pull/389) [`dbd17b1`](https://github.com/saud-alnasser/rentable/commit/dbd17b1fe74193fa2321654dd93e3451a889fbc3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the landing screen is a band of figures over sections of records. collection this month and occupancy are rings carrying their own percentage, outstanding sits beside them, and each one opens the page holding its detail. below them is one card per attention rank — overdue, owing, ending soon — stating what the rank holds, what it owes, and a few of its contracts, with a way through to the rest that opens the contracts list narrowed to that rank. the band stays put while the cards are worked, a rank holding nothing shows no card, and a morning with nothing to do says so.

- [#364](https://github.com/saud-alnasser/rentable/pull/364) [`cdd2518`](https://github.com/saud-alnasser/rentable/commit/cdd2518187a6164b1671aa9bc7fd636a3e43af64) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - find any tenant, complex, unit, contract or payment from the command palette, wherever you are, and open it

- [#398](https://github.com/saud-alnasser/rentable/pull/398) [`9c4c9ff`](https://github.com/saud-alnasser/rentable/commit/9c4c9ffb1046dd881567e40384fdab3921133269) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a payment reads on the shared record surface: its amount and date lead without labels, the rest
  reads as aligned rows rather than bordered tiles, and nothing offers a section to choose because
  a payment has none

- [#396](https://github.com/saud-alnasser/rentable/pull/396) [`3ac93a3`](https://github.com/saud-alnasser/rentable/commit/3ac93a34e72ef0d202e0cdacacd996cb04feca2c) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a tenant's record reads on the shared record surface: no panel behind it, its name and phone
  leading without labels, its national id as an aligned specification row rather than a bordered
  tile, its contracts under their own heading with no tab to press, and a way back from a record
  that cannot be found

- [#389](https://github.com/saud-alnasser/rentable/pull/389) [`dbd17b1`](https://github.com/saud-alnasser/rentable/commit/dbd17b1fe74193fa2321654dd93e3451a889fbc3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a contract's units are added and removed on the tab that lists them: what it holds sits beside what it could hold, a row still opens its unit, and each move is saved as it happens — the assignment dialog and the `+` that promised to add a single unit are both gone

- [#362](https://github.com/saud-alnasser/rentable/pull/362) [`becd400`](https://github.com/saud-alnasser/rentable/commit/becd40006d2174e64f6c999ca19362c74bf79040) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - take back a change to which units a contract holds, and take back terminating one

- [#360](https://github.com/saud-alnasser/rentable/pull/360) [`21a1db2`](https://github.com/saud-alnasser/rentable/commit/21a1db2d09f208795b9e85374fd2ebfeb03cff02) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - take back a record you just created, edited or deleted — and apply it again — from the shell or with ctrl+z, for as long as the session lasts

- [#348](https://github.com/saud-alnasser/rentable/pull/348) [`48fcc24`](https://github.com/saud-alnasser/rentable/commit/48fcc24624f42c6b792b1587b6e5da9b465bd345) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a unit has its own page: what it is, which complex holds it, and the contracts that have mentioned it. it is reached from its complex's units, and each contract listed on it opens that contract's page. the unit route no longer bounces you back to the complex.

- [#361](https://github.com/saud-alnasser/rentable/pull/361) [`b2cd239`](https://github.com/saud-alnasser/rentable/commit/b2cd2391485ad81d70eeacda9f2085366438a4f8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - choose a contract's units on one surface — what is available on one side, what it holds on the other, across complexes, searchable, saved once

### Patch Changes

- [#441](https://github.com/saud-alnasser/rentable/pull/441) [`efbdd6f`](https://github.com/saud-alnasser/rentable/commit/efbdd6f5959144252e9371c9cf3179fe18c58893) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - buttons show a pointer cursor on hover. every button in the application showed the ordinary arrow
  instead, which reads as something you cannot press

- [#486](https://github.com/saud-alnasser/rentable/pull/486) [`0bdfff8`](https://github.com/saud-alnasser/rentable/commit/0bdfff8d804e382c5be65db48dfe1ff7223f9aff) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - right-clicking a record card and pressing the control on it now open the same-looking menu. The
  context menu had kept the corner, border and shadow it was generated with, so a card's two ways
  into one list of actions looked like two different components

- [#389](https://github.com/saud-alnasser/rentable/pull/389) [`dbd17b1`](https://github.com/saud-alnasser/rentable/commit/dbd17b1fe74193fa2321654dd93e3451a889fbc3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a confirmation offers its confirming control unless something is known to block the operation — terminating a contract, restoring a terminated one, and deleting a payment all work again, and a refused deletion can be attempted again without dismissing the dialog

- [#485](https://github.com/saud-alnasser/rentable/pull/485) [`45a2bf5`](https://github.com/saud-alnasser/rentable/commit/45a2bf505e2b7e2075ec6de7b1624494eb50278a) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a contract listed on a tenant's page offers the same actions a contract in the directory offers,
  from the control on the card and from a right-click — so all three places a contract can be met
  now agree about what may be done to it and what it is refused for

- [#484](https://github.com/saud-alnasser/rentable/pull/484) [`0fbadd0`](https://github.com/saud-alnasser/rentable/commit/0fbadd0a8ad4e3f1ac54bba1bcdd58ad4dd0f6bf) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a contract listed on a unit's page offers what a contract in the directory offers — duplicating,
  editing, terminating or restoring it where its status allows, and deleting it — from the control
  on the card and from a right-click, each behind the same confirmation and refused for the same
  reasons. Acting on one updates the page without a reload, and deleting a contract anywhere no
  longer leaves back pointing at the record that is gone

- [#455](https://github.com/saud-alnasser/rentable/pull/455) [`36c0b4e`](https://github.com/saud-alnasser/rentable/commit/36c0b4e44826fe83c9de571d53e7e1cbde61165b) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the figures on a directory row line up in straight columns down the list, whatever they count and
  however many digits they hold. the complexes row's three counts and the tenant row's six used to
  leave a ragged trailing edge, because each figure was only as wide as its own digits

- [#444](https://github.com/saud-alnasser/rentable/pull/444) [`6ff38fa`](https://github.com/saud-alnasser/rentable/commit/6ff38fa881a2d3fb538e6a9bf101b2b262431743) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a record in the contracts, complexes, tenants, units and payments lists reads as a card — space
  around it, a resting shadow, and a lift when the pointer is over it — instead of a banded row in a
  framed table. a month in the payments statement is named by a card of its own, sized to what it
  says, scrolling with the payments under it rather than pinning above them

- [#435](https://github.com/saud-alnasser/rentable/pull/435) [`f32ad2f`](https://github.com/saud-alnasser/rentable/commit/f32ad2f1e7e965dcbe6724e8cf0ce847bdf03e97) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the startup screen that asks which workspace copy to keep no longer prints the conflict's title
  and description twice — they are read once, in the card that carries the answer

- [#457](https://github.com/saud-alnasser/rentable/pull/457) [`fc87831`](https://github.com/saud-alnasser/rentable/commit/fc87831e97051760c9ab0caa40edd1a7dc3ae055) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a contract whose units cannot be changed shows only the units it holds, laid out across the width as
  a grid, instead of also listing every unit that could be assigned beside a control that has been
  removed. both unit panes now render only the rows on screen

- [#450](https://github.com/saud-alnasser/rentable/pull/450) [`b0533a3`](https://github.com/saud-alnasser/rentable/commit/b0533a3c3a80bed098dc11658adfaedd9ada6e71) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a page taller than the window now scrolls to a bottom with space beneath its last element instead of
  ending flush against the window edge. settings is where this showed, being the longest page, but the
  fault was the shell's and reached every page that scrolls

- [#452](https://github.com/saud-alnasser/rentable/pull/452) [`f22bcde`](https://github.com/saud-alnasser/rentable/commit/f22bcde7ed456bea3b975d110499f63451448585) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a payment dated after today is refused, whether it is being recorded or edited, so money nobody has
  yet cannot move a contract's status. the date picker stops offering a day later than today, and
  nothing bounds how far into the past a payment may be dated

- [#440](https://github.com/saud-alnasser/rentable/pull/440) [`4956df1`](https://github.com/saud-alnasser/rentable/commit/4956df13c74c67d096849af523f6cd3a8ec8a74f) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a record's action controls are styled in one place, so the tenant, complex, unit, payment and
  contract records cannot come to disagree about what the same control looks like. nothing about
  how they read changes

- [#481](https://github.com/saud-alnasser/rentable/pull/481) [`fd66aa1`](https://github.com/saud-alnasser/rentable/commit/fd66aa17426639a03e9b1a6dab899be7dff1cad4) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a tenant card in the directory carries a quiet control at its inline end, opening the same actions
  a right-click on the card opens — so the actions are reachable from the keyboard, and the card no
  longer keeps them behind a gesture with nothing on it to say so. Clicking the card still opens the
  tenant

- [#469](https://github.com/saud-alnasser/rentable/pull/469) [`e6f2721`](https://github.com/saud-alnasser/rentable/commit/e6f2721289974040ea9988a1c968b6e955b7b7ed) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - right-clicking a tenant in the directory opens that tenant's own actions — editing it, and
  deleting it behind the same confirmation the tenant's page asks, which still names what blocks
  the deletion. Clicking the card opens the tenant as it always did

- [#445](https://github.com/saud-alnasser/rentable/pull/445) [`02e5f34`](https://github.com/saud-alnasser/rentable/commit/02e5f346f0198896fe6c6989b080ea2c0729bcf4) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - on a record with more than one collection — today only a contract — a collection scrolls inside its
  own panel instead of growing past the bottom of the window and taking the page with it. the
  contract's unit panes and its payments statement are both fixed by it

- [#466](https://github.com/saud-alnasser/rentable/pull/466) [`c587553`](https://github.com/saud-alnasser/rentable/commit/c587553e43e8e8e0eca11a3efbbf424a34f360ac) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - answering or deferring a workspace conflict at startup goes straight to the application: the
  panel and its progress stay on screen until the app appears, where the entry card used to show
  for a moment in between with nothing left to answer

- [#446](https://github.com/saud-alnasser/rentable/pull/446) [`70ed2b4`](https://github.com/saud-alnasser/rentable/commit/70ed2b42fab337e7c534159f560ea03d9bce0ea7) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a tenant row shows how many contracts the tenant holds in each of the six statuses, drawn with the
  same glyphs the rest of the application reads a status by, instead of one figure for contracts in
  force under a glyph private to that list. a figure at zero reads quiet, so the only red on the
  screen is a tenant who really is in default. the export follows the row and writes a column per
  status, and ordering by contracts still orders by the ones in force

- [#433](https://github.com/saud-alnasser/rentable/pull/433) [`a12c244`](https://github.com/saud-alnasser/rentable/commit/a12c24410565fb036e76e5f13ff299202517a6e0) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a unit no longer shows its status twice. it was drawn as a glyph under the unit's name and
  again as a field below, from the same value, so the two could never disagree — only the field
  remains

- [#352](https://github.com/saud-alnasser/rentable/pull/352) [`0fe1aa9`](https://github.com/saud-alnasser/rentable/commit/0fe1aa9589e6f93cdb60b7b76450b73999767446) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - opening the contract form no longer reads every tenant in the workspace. it asks the database for the ones matching what you type, bounded to what the picker shows. the picker still opens on tenants rather than on an instruction to search for one, and an edited contract still shows whose it is.

- [#389](https://github.com/saud-alnasser/rentable/pull/389) [`dbd17b1`](https://github.com/saud-alnasser/rentable/commit/dbd17b1fe74193fa2321654dd93e3451a889fbc3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - duplicate is offered on a contract and on a payment, where the copy keeps the record's substance — a tenant and a complex no longer offer it, since every field that made them was unique and the copy arrived empty. copying a record's details is unchanged everywhere

- [#482](https://github.com/saud-alnasser/rentable/pull/482) [`ca12c50`](https://github.com/saud-alnasser/rentable/commit/ca12c50daac0e33afc21c7d994907e0dd01ae974) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a complex card, a unit card and a payment card each offer their actions from the control on the
  card and from a right-click on it, whichever list they are in. What each one offers is unchanged;
  a payment in a terminated contract's statement still offers nothing and now carries no control
  either, leaving the gesture alone rather than answering it with an empty menu

- [#468](https://github.com/saud-alnasser/rentable/pull/468) [`7366e9b`](https://github.com/saud-alnasser/rentable/commit/7366e9b86fcfaba23184bd470de020912758c6fe) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - every scrolling surface now scrolls with the application's own scrollbar, including the command
  centre's results, which used to show the platform's

- [#282](https://github.com/saud-alnasser/rentable/pull/282) [`81c6a41`](https://github.com/saud-alnasser/rentable/commit/81c6a41796f24cd1ca342def14a1ca2ae9af2923) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - if you have asked your system for reduced motion, the application now listens. dialogs, menus, tooltips, sheets, drawers and popovers appear and disappear where they are instead of sliding, fading and scaling into place, and nothing else about them changes — every one is still reachable and still closes the same way. loading spinners keep turning, because a frozen one looks like an application that has stopped rather than a calmer one. if you have not asked for reduced motion, nothing is different.

- [#448](https://github.com/saud-alnasser/rentable/pull/448) [`b4b0c8e`](https://github.com/saud-alnasser/rentable/commit/b4b0c8e8d742b3770870691bf29321777ec999b1) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the delete confirmation no longer tells you the action cannot be undone, which was untrue on every
  surface it appeared on: every delete registers its inverse and undo replays it. it now says what is
  actually true — you can undo this while the app is open

- [#292](https://github.com/saud-alnasser/rentable/pull/292) [`9026a87`](https://github.com/saud-alnasser/rentable/commit/9026a87c94f262110f3842b441061165ee39ea91) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - three states in the date pickers now read the way they were written. picking an end date inside the green window shows the chosen day in white on solid green rather than in green on a faint wash, the suggested date fills solid green once you pick it, and hovering a day you have already selected keeps its text bright instead of dimming it. everything else on every surface renders exactly as before.

- [#317](https://github.com/saud-alnasser/rentable/pull/317) [`e0641c5`](https://github.com/saud-alnasser/rentable/commit/e0641c5805204330156357a052950dd2247337e0) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - keep the window's inset framing at every supported size, and stop the navigation drawer
  reopening itself after the window is resized

- [#313](https://github.com/saud-alnasser/rentable/pull/313) [`99104aa`](https://github.com/saud-alnasser/rentable/commit/99104aada8cc63353251d793107913e3f38bd19c) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - ctrl+b now collapses and expands the sidebar whatever keyboard layout you are typing in. it used to match the letter the key produces, so with an arabic layout selected the b key reported ب, the shortcut never fired, and the sidebar could only be toggled from the button in the header. it now matches where the key sits as well as the letter it types, so it works in both languages — and on latin layouts that put b somewhere other than where qwerty does.

- [#470](https://github.com/saud-alnasser/rentable/pull/470) [`4f1bc7a`](https://github.com/saud-alnasser/rentable/commit/4f1bc7a8e62b945da2cdbf7a046c55844f7b8621) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - right-clicking a complex in the directory opens that complex's own actions — editing it, and
  deleting it behind the same confirmation its page asks, which still names the units standing in
  the way

- [#453](https://github.com/saud-alnasser/rentable/pull/453) [`6bb5197`](https://github.com/saud-alnasser/rentable/commit/6bb5197948c8486ffce18965a469e6944b77252f) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - exporting the complexes list writes the occupied-units column its rows show. the file carried total
  and vacant only, so a reader exported what they were looking at and got something missing a figure
  that was on screen

- [#471](https://github.com/saud-alnasser/rentable/pull/471) [`5fabd71`](https://github.com/saud-alnasser/rentable/commit/5fabd71fd11c8f514eeefbf2463f46163667317c) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - right-clicking a contract in the directory opens that contract's own actions — duplicating it,
  editing it, terminating or restoring it where its status allows, and deleting it — each behind the
  same confirmation its page asks

- [#483](https://github.com/saud-alnasser/rentable/pull/483) [`5a8eed2`](https://github.com/saud-alnasser/rentable/commit/5a8eed24286f1f2f227e505d82fda0a97ed18f19) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a contract card reads the same everywhere it is listed. On a unit's page and a tenant's it takes
  the card's own corner on its focus ring rather than a square one, and on all three surfaces the
  figures on the row — the payment count, the status, the fulfillment — keep their own hover names
  and are no longer part of what opens the contract; the card around them still is

- [#449](https://github.com/saud-alnasser/rentable/pull/449) [`00b235b`](https://github.com/saud-alnasser/rentable/commit/00b235b4709ff7d5ceada29c762b0a14e76e50f3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the dashboard's entry in the navigation rail has a glyph of its own instead of wearing the same one
  the rail uses as the application's mark, so no picture appears twice in the rail meaning two
  different things

- [#439](https://github.com/saud-alnasser/rentable/pull/439) [`ddbfb9e`](https://github.com/saud-alnasser/rentable/commit/ddbfb9e06ad5391d109327d17bd01b648253f701) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a list's export control is drawn as a table with an arrow leaving it, rather than as a download
  arrow. nothing is downloaded here — the file is written to disk and revealed in the file manager

- [#454](https://github.com/saud-alnasser/rentable/pull/454) [`47f7976`](https://github.com/saud-alnasser/rentable/commit/47f7976e4fec5e63bdf0d4485742fe88175e6e92) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the two greens in the interface come from named colours declared with the rest of the palette — one
  for a callout reporting success, one for a date the contract's end-date window permits or suggests —
  instead of being raw palette values that said nothing about what they meant

- [#389](https://github.com/saud-alnasser/rentable/pull/389) [`dbd17b1`](https://github.com/saud-alnasser/rentable/commit/dbd17b1fe74193fa2321654dd93e3451a889fbc3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the landing screen shows the first few contracts of each rank rather than every one of them, and each heading still states how many the rank holds in full. its search box is gone — finding a contract is the contracts list's job, and that list searches and now filters by rank. the screen costs the same to open whether the portfolio needs four contracts chasing or four hundred.

- [#456](https://github.com/saud-alnasser/rentable/pull/456) [`ca6b268`](https://github.com/saud-alnasser/rentable/commit/ca6b26865849d890c62d1e294b4af1a0298c8ec2) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the payment count on a contract row reads as money rather than wearing the same tone as the status
  glyph beside it, so a figure counting money and a glyph reporting a condition no longer say different
  things in the same colour

- [#451](https://github.com/saud-alnasser/rentable/pull/451) [`1cc36ea`](https://github.com/saud-alnasser/rentable/commit/1cc36ea7e0a165053e769ee32454eac1a79db97a) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the payment form's "remaining after" figure no longer counts the payment twice. editing one without
  changing its amount leaves the figure where it is instead of appearing to pay the contract down
  again, lowering one lifts the figure back up even on a contract that was paid in full, and recording
  one no longer overshoots for the moment between the save landing and the form closing

- [#458](https://github.com/saud-alnasser/rentable/pull/458) [`732c974`](https://github.com/saud-alnasser/rentable/commit/732c974a23a4c7a77792aa253f094d05f2082ef1) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the settings page says what each setting does for you rather than how the app does it — no
  migrations, no unlink cleanup, no github releases or signed builds — and stops saying things twice:
  the page no longer lists the four groups whose names sit directly beneath it, and three sections no
  longer carry a row title repeating their own heading

- [#467](https://github.com/saud-alnasser/rentable/pull/467) [`c0b70d6`](https://github.com/saud-alnasser/rentable/commit/c0b70d60696be70f0c10f71dc2a437c30135d741) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the startup screen's controls report their own work: choosing to open the local workspace no
  longer makes the link control announce that it is linking, and the control that was pressed is
  the one that says what it is doing

- [#369](https://github.com/saud-alnasser/rentable/pull/369) [`83fad06`](https://github.com/saud-alnasser/rentable/commit/83fad06202d53c9343effea07e21aeeb9b1b66fb) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the startup conflict question and the workspace section say less: the question and its answers lead, and the detail behind them sits one hover or one screen-reader stop away

- [#447](https://github.com/saud-alnasser/rentable/pull/447) [`793180f`](https://github.com/saud-alnasser/rentable/commit/793180fb7eb28c605cb5aa5145742a15b26f886a) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the confirmation shown before unlinking a workspace sits on the same surface as every other
  confirmation in the application — same background, corner and shadow — instead of on one of its own

- [#389](https://github.com/saud-alnasser/rentable/pull/389) [`dbd17b1`](https://github.com/saud-alnasser/rentable/commit/dbd17b1fe74193fa2321654dd93e3451a889fbc3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - take a change back from the message that announces it, rather than from a pair of buttons standing in the titlebar — and ctrl+z now reaches undo on every screen, including the ones that never carried the buttons

## 0.11.1

### Patch Changes

- [#241](https://github.com/saud-alnasser/rentable/pull/241) [`c367dc2`](https://github.com/saud-alnasser/rentable/commit/c367dc2a87978df35a60006494dd5a76cec0a864) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a national identity number is now accepted only when the whole value is one, so a padded or embedded number such as `!1234567890!` is refused where it was previously saved. surrounding whitespace is removed before the check, so an existing tenant stored with padding can still be opened and saved.

## 0.11.0

### Minor Changes

- [#169](https://github.com/saud-alnasser/rentable/pull/169) [`ca16df4`](https://github.com/saud-alnasser/rentable/commit/ca16df428631966acf37e294dd30e36b951f6c8e) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - rentable now keeps a diagnostics log on this machine, covering startup, migrations, backups, and sync. settings shows where the files are and opens the folder, so a failure can be sent on rather than described from memory. the log is bounded in size, and passwords and account tokens are stripped out before anything is written.

### Patch Changes

- [#174](https://github.com/saud-alnasser/rentable/pull/174) [`67a1c12`](https://github.com/saud-alnasser/rentable/commit/67a1c126ac671ff77947c6d33b486af04e6f6b28) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the settings screen no longer replaces itself with a load error when a background refresh fails after it has already loaded. an update being downloaded, or a google drive sign-in waiting in the browser, is no longer discarded by that switch.

- [#185](https://github.com/saud-alnasser/rentable/pull/185) [`e218213`](https://github.com/saud-alnasser/rentable/commit/e218213cffa88fe586d342f4c6e485199b2a2a31) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a sync conflict you set aside now stays set aside wherever you go next. dismissing one at startup and then opening settings used to raise the same question again; it no longer does, until the thing the conflict was about has actually changed.

- [#165](https://github.com/saud-alnasser/rentable/pull/165) [`7a973e1`](https://github.com/saud-alnasser/rentable/commit/7a973e1192eb83e8ac0931b258e312ce9aa0ae24) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a google drive sign-in that fails because the machine is offline now says so, instead of reading as an unexpected error.

- [#162](https://github.com/saud-alnasser/rentable/pull/162) [`b7a98e8`](https://github.com/saud-alnasser/rentable/commit/b7a98e89138a338fdda1d61ff49d301a66b0d3fb) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - google drive and startup failures now read in the selected language, with the underlying detail kept alongside the message rather than replacing it.

- [#178](https://github.com/saud-alnasser/rentable/pull/178) [`26cb694`](https://github.com/saud-alnasser/rentable/commit/26cb694dd9f43fda66e8e95463d1cf094acb089e) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - renaming a unit to a name another unit in the same complex already holds is now refused for every name the form accepts, an empty one included — previously a blank name skipped the check entirely and two units could end up sharing it.

## 0.10.1

### Patch Changes

- [#80](https://github.com/saud-alnasser/rentable/pull/80) [`a0405ce`](https://github.com/saud-alnasser/rentable/commit/a0405ce2dd81f0ed1a0ee9e3337cec1fd08bb320) Thanks [@renovate](https://github.com/apps/renovate)! - upgrade all non-major dependencies

## 0.10.0

### Minor Changes

- [#83](https://github.com/saud-alnasser/rentable/pull/83) [`a3dfdd4`](https://github.com/saud-alnasser/rentable/commit/a3dfdd49fd10b77f598cc88f054f16defe30c402) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - implement google-drive based remote sync utilizing the backups backend api.

## 0.9.1

### Patch Changes

- [#38](https://github.com/saud-alnasser/rentable/pull/38) [`fc2c9d3`](https://github.com/saud-alnasser/rentable/commit/fc2c9d34f8972f1877cb187890593d2b45655121) Thanks [@renovate](https://github.com/apps/renovate)! - update non-major dependencies

## 0.9.0

### Minor Changes

- [#77](https://github.com/saud-alnasser/rentable/pull/77) [`a3be7ee`](https://github.com/saud-alnasser/rentable/commit/a3be7ee0184df1afd79baeaff56ec8a4eebd68c8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - redesign ui with integrated navigation and tabbed detail views

## 0.8.1

### Patch Changes

- [#75](https://github.com/saud-alnasser/rentable/pull/75) [`2bfb84c`](https://github.com/saud-alnasser/rentable/commit/2bfb84ceb2d220b1521a9238bd5841ebe1ef509b) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - fixed all linting issues

## 0.8.0

### Minor Changes

- [#73](https://github.com/saud-alnasser/rentable/pull/73) [`ebd6cdf`](https://github.com/saud-alnasser/rentable/commit/ebd6cdf1432f5dadbe975a74e6a2e16ad12d0f78) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - application UI overhaul

  ## Dashboard
  - Extracted dashboard logic into dedicated components (`dashboard-header`, `dashboard-summary-grid`, `dashboard-summary-card`, `dashboard-follow-ups-section`, `dashboard-follow-up-card`, `dashboard-ending-soon-section`, `dashboard-ending-soon-card`)

  ## Layout
  - Extracted layout logic into dedicated components (`layout-frame`, `layout-startup-loading`, `layout-startup-error`, `layout-startup-recovery`)

  ## Settings
  - Extracted settings logic into dedicated card components (`settings-about-card`, `settings-database-card`, `settings-locale-card`, `settings-updates-card`, `settings-ending-soon-card`)

  ## Detail Pages
  - Added dedicated detail pages and routes for complexes (`complexes/[id]`), contracts (`contracts/[id]`), and tenants (`tenants/[id]`)
  - Added `complex-details`, `contract-details`, and `tenant-details` components

  ## Resource Components
  - Overhauled `complexes-data-view`, `contracts-data-view`, and `tenants-data-view`
  - Enhanced `contract-form` and `tenant-form` with expanded fields and improved UX
  - Updated `contract-payments-data-view`, `contract-payments-table`, and `contract-units-management`

  ## Internals
  - Added `locale.ts` utility for locale handling
  - Enhanced `contract-status.ts` with richer status resolution logic
  - Expanded i18n translation keys for `en` and `ar` locales
  - Updated queries for contracts, complexes, and tenants to support detail views
  - Minor consistency fixes across UI fragment components (`card`, `sheet`, `popover`, `tooltip`, `dropdown-menu`, etc.)

## 0.7.0

### Minor Changes

- [#70](https://github.com/saud-alnasser/rentable/pull/70) [`c625922`](https://github.com/saud-alnasser/rentable/commit/c625922249b7964098f3dc7b6988d3bb2f7ebe46) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - optimized data-view with virtualization

- [#71](https://github.com/saud-alnasser/rentable/pull/71) [`b5efb94`](https://github.com/saud-alnasser/rentable/commit/b5efb948c780304c0133ef3a76ea1829fc743513) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - redesigned the application's visual interface with a modern, glass-morphism inspired design system

## 0.6.0

### Minor Changes

- [#68](https://github.com/saud-alnasser/rentable/pull/68) [`bc4f39d`](https://github.com/saud-alnasser/rentable/commit/bc4f39dcd34bcb099647d121dc3593bc6b4acc8d) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - overhauled data-view ui

- [#67](https://github.com/saud-alnasser/rentable/pull/67) [`4a9373d`](https://github.com/saud-alnasser/rentable/commit/4a9373de14eae24ba1681aa49e3a01f8ed74259d) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - overhauled tauri backend

## 0.5.1

### Patch Changes

- [#62](https://github.com/saud-alnasser/rentable/pull/62) [`d44b263`](https://github.com/saud-alnasser/rentable/commit/d44b263c654a86fa9723316fd3b5eb6e7738a421) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - renamed pre-update backup db filename to include better postfix

- [#63](https://github.com/saud-alnasser/rentable/pull/63) [`e4dcc73`](https://github.com/saud-alnasser/rentable/commit/e4dcc73ddd6c1431a93e0f4e4f19280573dc779f) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - make list keys unique in dashboard page lists

## 0.5.0

### Minor Changes

- [#61](https://github.com/saud-alnasser/rentable/pull/61) [`aa50c24`](https://github.com/saud-alnasser/rentable/commit/aa50c24ea96b0124b599d64d7f10fbe25fba1f77) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - add localzation with both en/ar locales

### Patch Changes

- [#54](https://github.com/saud-alnasser/rentable/pull/54) [`ffbeb85`](https://github.com/saud-alnasser/rentable/commit/ffbeb85b2ecd43e66293e05c9200a75d2d1c965e) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - added checking status in update settings

## 0.4.1

### Patch Changes

- [#49](https://github.com/saud-alnasser/rentable/pull/49) [`abf57ab`](https://github.com/saud-alnasser/rentable/commit/abf57ab20f07dfefe9c0413edd256232c82a3c70) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - fixed ending soon window settings to make changes

## 0.4.0

### Minor Changes

- [#35](https://github.com/saud-alnasser/rentable/pull/35) [`ddedd8e`](https://github.com/saud-alnasser/rentable/commit/ddedd8e717c8969a824e39398a86f99db9b2ae8b) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - create crud operations for complexes and units

- [#47](https://github.com/saud-alnasser/rentable/pull/47) [`b2175d7`](https://github.com/saud-alnasser/rentable/commit/b2175d700e7dfe55a962dc4c3016913fb0ae0036) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - implemented app wide settings

- [#42](https://github.com/saud-alnasser/rentable/pull/42) [`4b9cc40`](https://github.com/saud-alnasser/rentable/commit/4b9cc4018ed974587c44a1228ed4ff79b91a0586) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - implement custom shell styles with custom window controls

- [#48](https://github.com/saud-alnasser/rentable/pull/48) [`ed561e0`](https://github.com/saud-alnasser/rentable/commit/ed561e0364ae41843986e5d205800479f03f056f) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - implemented github release based update with manual binary rollback and automatic db rollback

- [#45](https://github.com/saud-alnasser/rentable/pull/45) [`24b6562`](https://github.com/saud-alnasser/rentable/commit/24b65628972a29ccf9376dd6b611e22b59ef3d01) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - use fixed 30-days payments cycle for contracts

- [#40](https://github.com/saud-alnasser/rentable/pull/40) [`70351ad`](https://github.com/saud-alnasser/rentable/commit/70351adfdd0267e150656bd940c8ac2f0f81146b) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - changed navbar from sidebar to floating tools bar with icons only

- [#39](https://github.com/saud-alnasser/rentable/pull/39) [`2fab7e7`](https://github.com/saud-alnasser/rentable/commit/2fab7e71461a1e5c8f19270d1ef1bf19d6f52b5a) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - added crud operations for contracts and payments

- [#41](https://github.com/saud-alnasser/rentable/pull/41) [`b0853ac`](https://github.com/saud-alnasser/rentable/commit/b0853ac8a612eb44f51b81c1fbba2cbaa101acde) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - sync state of the app on startup/mutations

- [#39](https://github.com/saud-alnasser/rentable/pull/39) [`2fab7e7`](https://github.com/saud-alnasser/rentable/commit/2fab7e71461a1e5c8f19270d1ef1bf19d6f52b5a) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - added dashboard for all stats

- [#46](https://github.com/saud-alnasser/rentable/pull/46) [`0276b61`](https://github.com/saud-alnasser/rentable/commit/0276b61ab96f4f5b5a362829caab8ceda563b7c7) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - treat contracts as ending soon when thir end date within the last 60 days of the contract

### Patch Changes

- [#43](https://github.com/saud-alnasser/rentable/pull/43) [`e66ac9a`](https://github.com/saud-alnasser/rentable/commit/e66ac9a1246c88392e0b8f5347d9649822f68023) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - removed transparent background of app shell

- [#44](https://github.com/saud-alnasser/rentable/pull/44) [`45fff62`](https://github.com/saud-alnasser/rentable/commit/45fff621f01f9a298e8a381f2603fc702e3b8ef7) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - ensured db migrations works in prod

- [#36](https://github.com/saud-alnasser/rentable/pull/36) [`fd4233c`](https://github.com/saud-alnasser/rentable/commit/fd4233cffdd42b0b900365fb29203f41a07cafc6) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - removed select option for tenants table

## 0.3.0

### Minor Changes

- [#31](https://github.com/saud-alnasser/rentable/pull/31) [`6de3bca`](https://github.com/saud-alnasser/rentable/commit/6de3bcaecd4cd90ddaa8d7318b9870d4dfe588a7) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - allow users to view, create, update and delete tenants

- [#31](https://github.com/saud-alnasser/rentable/pull/31) [`6de3bca`](https://github.com/saud-alnasser/rentable/commit/6de3bcaecd4cd90ddaa8d7318b9870d4dfe588a7) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - add custom scrollbar aligned with the content area

## 0.2.0

### Minor Changes

- [#2](https://github.com/saud-alnasser/rentable/pull/2) [`617ed34`](https://github.com/saud-alnasser/rentable/commit/617ed343fd17cc3a75ca535f497ffdf2a4cb56f5) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - added models and database schema for the app
