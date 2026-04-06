# rentable

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
