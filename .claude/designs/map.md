# Design map

| Design | Status | Sources |
| --- | --- | --- |
| [contract-work-queue-and-directory](contract-work-queue-and-directory.md) | implemented | `src/lib/dashboard/`, `src/lib/contract/`, `src/lib/payment/component/`, `src/lib/design/block/`, `src/routes/+page.svelte`, `src/routes/contracts/+page.svelte` |
| [dashboard-as-the-days-work](dashboard-as-the-days-work.md) | superseded by contract-work-queue-and-directory.md | `src/lib/dashboard/`, `src/routes/+page.svelte`, `src/lib/design/block/`, `src/lib/design/cell/`, `src/lib/contract/` |
| [dependency-backlog-consolidation](dependency-backlog-consolidation.md) | accepted | `package.json`, `tauri/Cargo.toml`, `.github/renovate.json`, `.github/workflows/`, `.claude/evidence/research/dependency-backlog-consolidation.md` |
| [drive-command-surface-cutover](drive-command-surface-cutover.md) | implemented | `src/lib/api/utils/remote-sync-google-drive.ts`, `tauri/src/remote_sync/`, `src/lib/resources/settings/`, `src/routes/+layout.svelte` |
| [form-presentation-spec](form-presentation-spec.md) | implemented | `src/lib/design/block/form-sheet.svelte`, `src/lib/design/primitive/form/`, `src/lib/design/primitive/dialog/`, `src/lib/design/primitive/sheet/`, `src/lib/tenant/component/form.svelte`, `src/lib/contract/component/form.svelte`, `src/lib/complex/component/form.svelte`, `src/lib/payment/component/form.svelte` |
| [integration-gate-cost](integration-gate-cost.md) | implemented | `.github/workflows/integration.yml`, `.github/workflows/release.yml`, `tauri/tauri.conf.json` |
| [list-presentation-spec](list-presentation-spec.md) | implemented | `src/lib/design/block/`, `src/lib/design/cell/`, `src/lib/contract/`, `src/lib/payment/`, `src/lib/tenant/`, `src/lib/complex/` |
| [national-identity-validation](national-identity-validation.md) | implemented | `src/lib/tenant/tenant.ts`, `src/lib/platform/database/schema.ts`, `src/lib/tenant/component/form.svelte`, `src/lib/tenant/router.test.mjs` |
| [sql-proxy-value-conversion](sql-proxy-value-conversion.md) | implemented | `tauri/src/database/proxy.rs`, `src/lib/platform/database/client.ts`, `src/lib/platform/database/memory.ts` |
| [surfaces-the-overhaul-left-behind](surfaces-the-overhaul-left-behind.md) | draft | `src/routes/settings/`, `src/lib/settings/`, `src/lib/layout/component/`, `src/lib/sync/component/`, `src/routes/+error.svelte` |
| [ui-overhaul-spec](ui-overhaul-spec.md) | superseded by list-presentation-spec.md | `src/lib/design/`, `src/lib/layout/`, `src/routes/`, `src/app.css`, `src/lib/contract/`, `src/lib/payment/`, `src/lib/tenant/`, `src/lib/complex/`, `src/lib/platform/database/`, `tauri/migrations/`, `tauri/tauri.conf.json` |
| [ui-overhaul](ui-overhaul.md) | implemented | `src/lib/design/block/`, `src/lib/design/primitive/`, `src/lib/layout/`, `src/routes/`, `src/app.css`, `src/lib/contract/router.ts`, `src/lib/contract/serialize.ts`, `src/lib/contract/reconcile.ts`, `tauri/tauri.conf.json` |
