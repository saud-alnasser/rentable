# rentable

## 0.12.0

### Minor Changes

- [#263](https://github.com/saud-alnasser/rentable/pull/263) [`5539a72`](https://github.com/saud-alnasser/rentable/commit/5539a728151eec392ec6f7e0bd3540b3c7d52e0c) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the interface is black and high-contrast now. the frosted-glass panels, the coloured glow behind the window and the tinted gradient under everything are gone, and surfaces separate by their own weight instead — each panel a step lighter than what holds it, over a hairline edge. blue no longer tints the furniture: it marks the tab you are on, the row you picked and the field you are typing in, and nothing else. controls are a step shorter throughout, so a form or a menu shows more at once.

- [#264](https://github.com/saud-alnasser/rentable/pull/264) [`13b6870`](https://github.com/saud-alnasser/rentable/commit/13b6870635a70efaf0c566e349a26df3558faa15) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - navigation moved into a collapsible sidebar down the side of the window, replacing the row of icons in the title bar. it collapses to icons and back with the button beside the breadcrumbs or ctrl+b, it remembers which way you left it, and it sits on the right in arabic. the title bar now carries the breadcrumb trail for where you are, and dragging the window and the minimise, maximise and close buttons follow the reading direction with it. the window can no longer be resized smaller than 640×480, which is the narrowest the layout is built to hold. creating and editing a tenant opens in a panel that slides in from the side instead of a box in the middle of the screen — the rest of the forms follow as their lists are rebuilt.

- [#285](https://github.com/saud-alnasser/rentable/pull/285) [`74969c8`](https://github.com/saud-alnasser/rentable/commit/74969c8ff2f37507629f47b062d0db269404fbee) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the complex and payment forms open on the shared form surface. both are still a panel in the middle of the window, but they now use the full width of a narrow window instead of a fixed column, they keep everything you have typed if you resize while one is open, and they carry the same header, footer and scrolling as every other form. an amount with more than two decimal places is now refused in your own language, in the form, where the rest of the errors already appear — the browser used to refuse it in english with a bubble of its own.

- [#286](https://github.com/saud-alnasser/rentable/pull/286) [`73aae04`](https://github.com/saud-alnasser/rentable/commit/73aae04ea97299f45c1c089acaed23fbd394bab8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the contract and unit forms open on the shared form surface, which is now the only way a form opens anywhere in the application. the contract form arrives from the side of the window instead of sitting in a box in the middle, and the unit form is a panel like the complex and payment ones. a cost with more than two decimal places is refused in your own language, in the form, where the rest of the errors already appear — the browser used to refuse it in english with a bubble of its own.

  the contract form is also rebuilt inside. it opens with a summary of the contract you are making — the tenant, the total, and the period — which stays in view as you scroll and fills in as you type, so you can see what you are about to create without reading it back off the fields. the fields themselves sit in one column, cut into the panel rather than stacked as boxes on top of it, and the tenant picker opens showing your tenants instead of asking you to start typing first.

  every form now tells you where a problem is. a field that needs fixing turns red and carries a mark, and hovering or tabbing to it shows what is wrong — replacing the list of messages that used to collect at the bottom of the panel, which told you what was wrong but never which box to fix.

- [#300](https://github.com/saud-alnasser/rentable/pull/300) [`7f004b2`](https://github.com/saud-alnasser/rentable/commit/7f004b2525a3049427e8b2bdbd9163ac0e5a680c) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the contracts list reads as a directory rather than a triage queue. the status headings are gone and every contract sits in one list, so scheduled and expired contracts no longer take a heading of their own. a row leads with the tenant, carries the contract number and the period it runs over beneath, and ends with the status and the cost — the cost shown with the interval it is charged over, so the figure is not mistaken for what the whole contract is worth.

  the list can be ordered by tenant, by contract number, by start, by end, by cost, or by status, and the order is the database's rather than the screen's. ordering by status follows what needs you first — defaulted, active, scheduled, then fulfilled, expired and terminated — rather than the alphabet. contracts tied on the chosen order fall back to tenant name and then to when the contract runs.

  searching still runs in the database and still finds a contract by phone or tenant even though a row does not show them.

- [#274](https://github.com/saud-alnasser/rentable/pull/274) [`1050eea`](https://github.com/saud-alnasser/rentable/commit/1050eeacb894961948f27a0ab87249809ef20068) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the contracts list opens as a queue rather than a grid of cards. contracts are grouped by what needs you first — defaulted, then active, then scheduled, with fulfilled, expired and terminated below them — and inside each group the soonest end date leads. a row carries the tenant, how much of the contract has been paid, and when it ends, and opens the contract.

  searching runs in the database now instead of over everything already loaded. it still finds a contract by government id, phone, cost or interval even though a row no longer shows those, and a search containing % or _ looks for those characters rather than treating them as wildcards. the whole list arrives at once, so there is no more loading as you scroll.

  progress bars fill from the right in arabic, where they used to fill from the left.

- [#265](https://github.com/saud-alnasser/rentable/pull/265) [`694673b`](https://github.com/saud-alnasser/rentable/commit/694673b31879cfac00a0aad7b200bef55035f480) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a command palette opens over the app with ctrl+k, or from the search button beside the breadcrumbs. type a few letters to jump to the dashboard, tenants, complexes, contracts or settings, or to start a new tenant, complex or contract — starting one takes you to its list and opens the form there. it searches whatever language the app is in, and reads right to left in arabic.

- [#299](https://github.com/saud-alnasser/rentable/pull/299) [`6d0c9ec`](https://github.com/saud-alnasser/rentable/commit/6d0c9ec4616542897642ad333bab63a1552903ef) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - make the landing screen the day's work: the contracts needing action open as a queue grouped
  overdue, owing, then ending soon, each heading stating its contract count and its money total.
  a contract joins a money group when it owes anything today rather than when a payment fell due
  this calendar month, so a contract behind by cycles from earlier months is no longer hidden.
  clicking a money row opens the payment form with the contract already chosen; the fifteen
  portfolio figures are replaced by two — this month's collected against due, and occupied
  against total units.

- [#298](https://github.com/saud-alnasser/rentable/pull/298) [`a701777`](https://github.com/saud-alnasser/rentable/commit/a70177767c0276fbc1ab99e0b8e02e24e5559a10) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a contract's payments read as a ledger rather than a grid of cards. rows are grouped by the month they were made in, newest first, each row carrying its date with the amount trailing it, and each month carrying what its payments add up to.

  the foot of the ledger states what the contract still owes against what it is worth in total, taken from the figures the contract already keeps rather than added up from the rows on screen — so a search never changes the balance.

  searching the ledger is answered by the database in one query, over the amount and the day a payment was made, and the whole ledger arrives at once instead of loading as you scroll. adding, editing and deleting a payment still work from it, and a terminated or fully paid contract still says why it will not take one.

- [#297](https://github.com/saud-alnasser/rentable/pull/297) [`72ef95f`](https://github.com/saud-alnasser/rentable/commit/72ef95f3da0fc4235b5952c628770c690fdf411a) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the complexes list reads as a directory rather than a grid of cards. a row leads with the name, carries the location beneath it, and shows how many units the complex holds and how many of those stand vacant — so a screen shows the buildings you were scrolling past. the list can be ordered by name, by location, by unit count or by vacant count, and the order is the database's rather than the screen's.

  the units inside a complex read as an occupancy board: a tile per unit, laid out across the window and reflowing as it resizes. a let unit is a solid tile naming the tenant living in it; a free one is a dashed tile that says vacant. searching the board reaches the tenant's name as well as the unit's.

  both lists arrive at once, so there is no more loading as you scroll, and the unit and vacant counts come from the same query as the rows rather than from a count per building.

- [#284](https://github.com/saud-alnasser/rentable/pull/284) [`c6cfcaf`](https://github.com/saud-alnasser/rentable/commit/c6cfcafe05966d905142a609d0d826ac64ec8ef4) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the tenant form opens on the shared form surface. it is still the panel that slides in from the side, and it still reads from the right in arabic, but it now uses the whole width of a narrow window instead of sitting in a fixed column with empty space beside it, and it keeps everything you have typed if you resize the window while it is open.

- [#290](https://github.com/saud-alnasser/rentable/pull/290) [`b02fa15`](https://github.com/saud-alnasser/rentable/commit/b02fa1524577e627b9b9c6ac8e17a25defbcb4b3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the tenants list reads as a directory rather than a grid of cards. a row leads with the name, carries the national id and phone beneath it, and shows how many contracts that tenant currently holds — so a screen now shows the people you were scrolling past.

  the list can be ordered by name, by national id, or by how many contracts a tenant holds, and the order is the database's rather than the screen's. a contract counts as held while its period covers today and nobody has ended it by hand; a contract that is paid up still counts, one that has expired does not.

  the whole list arrives at once, so there is no more loading as you scroll.

### Patch Changes

- [#282](https://github.com/saud-alnasser/rentable/pull/282) [`81c6a41`](https://github.com/saud-alnasser/rentable/commit/81c6a41796f24cd1ca342def14a1ca2ae9af2923) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - if you have asked your system for reduced motion, the application now listens. dialogs, menus, tooltips, sheets, drawers and popovers appear and disappear where they are instead of sliding, fading and scaling into place, and nothing else about them changes — every one is still reachable and still closes the same way. loading spinners keep turning, because a frozen one looks like an application that has stopped rather than a calmer one. if you have not asked for reduced motion, nothing is different.

- [#292](https://github.com/saud-alnasser/rentable/pull/292) [`9026a87`](https://github.com/saud-alnasser/rentable/commit/9026a87c94f262110f3842b441061165ee39ea91) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - three states in the date pickers now read the way they were written. picking an end date inside the green window shows the chosen day in white on solid green rather than in green on a faint wash, the suggested date fills solid green once you pick it, and hovering a day you have already selected keeps its text bright instead of dimming it. everything else on every surface renders exactly as before.

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
