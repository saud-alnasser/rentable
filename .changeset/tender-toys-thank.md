---
'rentable': minor
---

application UI overhaul

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
