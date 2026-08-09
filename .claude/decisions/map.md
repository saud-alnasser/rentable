# Decision map

| ADR | Load when | Status | Sources |
| --- | --- | --- | --- |
| [0001](0001-one-database-client-type.md) | a database client is constructed, or the shape of a row crossing the IPC boundary is in question | accepted | `src/lib/platform/database/` |
| [0002](0002-no-repository-layer.md) | a router or a domain module is being added, and where persistence is called from is in question | accepted | `src/lib/api/`, `src/lib/contract/` |
| [0003](0003-drive-client-relocates-to-rust.md) | the request touches Drive credentials, OAuth, or where Drive network calls are made | accepted | `tauri/src/sync/google/`, `src/lib/sync/` |
| [0004](0004-drive-transport-tested-against-a-local-server.md) | a Drive transport test is being written or is failing | accepted | `tauri/src/sync/google/test/`, `tauri/src/sync/google/transport.rs` |
| [0005](0005-drive-concurrency-is-detected-not-prevented.md) | two clients could write one workspace, or a manifest or snapshot conflict is being handled | accepted | `tauri/src/sync/google/manifest.rs`, `tauri/src/sync/google/conflict.rs` |
| [0006](0006-payment-aggregates-are-materialized.md) | a read needs a contract's paid or expected amount, or a list sorts or filters on one | accepted | `src/lib/payment/`, `src/lib/contract/reconcile.ts` |
| [0007](0007-rhea-geometry-is-hand-ported.md) | a primitive is being regenerated, added, or restyled | accepted | `src/lib/design/primitive/` |
| [0008](0008-one-list-block-replaces-both.md) | the history of how the list block reached its present shape is in question | superseded | `src/lib/design/block/` |
| [0009](0009-the-shipping-list-block-is-rewritten-under-a-new-name.md) | the history of how the list block reached its present shape is in question | superseded | `src/lib/design/block/` |
| [0010](0010-lists-load-whole-result-sets.md) | a list read is being written, or pagination is proposed for one | accepted | `src/lib/design/block/list.svelte` |
| [0011](0011-reconcile-is-scoped-by-trigger.md) | a mutation, a sync pull, or a day crossing has to move derived state | accepted | `src/lib/contract/reconcile.ts` |
| [0012](0012-the-query-cache-is-trusted-until-told-otherwise.md) | a query's caching or invalidation behaviour is in question | accepted | `src/lib/design/query.ts` |
| [0013](0013-list-presentation-is-per-concept.md) | a list's presentation is being chosen or changed | accepted | `src/lib/design/block/list.svelte` |
| [0014](0014-the-dashboard-is-the-days-work.md) | the landing screen's content is in question | accepted | `src/lib/dashboard/` |
| [0015](0015-the-applications-own-surfaces-converge.md) | a surface the application shows about itself — starting, failing, recovering, choosing a workspace — is being built or restyled | accepted | `src/lib/layout/component/`, `src/lib/sync/component/`, `src/routes/+error.svelte` |
| [0016](0016-motion-responds-and-uses-what-is-installed.md) | a surface is gaining animation, a transition, or a duration | accepted | `src/lib/design/`, `src/app.css` |
| [0017](0017-a-form-surface-is-one-component.md) | a form is being presented, or a surface has to survive a breakpoint crossing | accepted | `src/lib/design/block/form-surface.svelte` |
| [0018](0018-a-validation-error-belongs-to-its-field.md) | a form reports validation errors | accepted | `src/lib/design/block/field-error.svelte`, `src/lib/design/primitive/form/` |
| [0019](0019-the-work-queue-is-the-landing-screen.md) | the landing screen or the contracts list is being changed | accepted | `src/lib/dashboard/`, `src/lib/contract/` |
| [0020](0020-surfaces-diverge-by-kind-not-by-operation.md) | a new surface for a concept is being placed | accepted | `src/lib/design/block/` |
