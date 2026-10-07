---
status: open
blocked-by: [25, 27]
---

# refactor(update): the update feature owns its words, and one type each

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]].

## Outcome

Found at review round one (standards 1, 3, 4, 5, 7, 8, 10; correctness 9): the update's strings live in the update feature, one target type serves each language, the rules describe what exists, the read-only refusals carry their changeset, and a server error is never read as no release.

## Acceptance Criteria

Traces requirement 6, requirement 11, criterion 11 and criterion 12.

- [ ] The strings `update-action.svelte` draws from `settings` move to `update/i18n/{en,ar}.ts`, with nothing left unused in `settings`, and the update action uses one check label rather than both `update.actions.check` and `common.actions.checkForUpdates`.
- [ ] TypeScript has one target type (`HeldByVersion.target` reuses `UpgradeTarget`), and Rust one (`VersionTarget` and the upgrade's `Target` become one serde enum).
- [ ] [[rules/module-layout]] gains a departures row for `organization/upgrade/sheet.svelte.ts`, lists `organization/session/unsent.rs` among the test homes that construct the upgrader, names `upgrade/` among the organization's sub-concepts, and no longer says TypeScript has no upgrade concept.
- [ ] A changeset in a user's words covers the read-only refusals of ticket 05, and `.changeset/updates-arrive-by-themselves.md` is a full sentence addressed to the user like the others.
- [ ] A check that the server answers with an error is reported as a failure, not as no release; only a missing manifest or no newer version reads as no release; a test per case.

## Relevant areas

- apps/desktop/src/lib/update/, src/lib/settings/i18n/, src/lib/organization/host.ts, organization/upgrade/host.ts
- apps/desktop/tauri/src/organization/session/version.rs, organization/upgrade/mod.rs, tauri/src/update/release.rs
- .aep/rules/module-layout.md, .changeset/

## Constraints

- Each defect is pinned first by a test that fails on the code as it stands, at the level [[rules/testing]] fixes ([[skills/tdd]]); where a finding turns out not to reproduce, say so in Notes with the evidence and leave its box unticked for the orchestrator.
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
