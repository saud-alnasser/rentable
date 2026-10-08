---
status: open
---

# feat(desktop): a contract can name the contract it renews

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Architecture, The renewal link; Data Model; Integration*).

## Outcome

`contract` carries a nullable `renews_contract_id`, added by migration `0009` declared as an addition, carried by the serialized contract and through delete and restore, and never writable through create, duplicate or edit.

## Acceptance Criteria

Traces requirement 5 and criterion 5 (the column, undo and restore, duplicate).

- [ ] Migration `0009` adds the column, generated with `pnpm db:generate:desktop`; `tauri/src/database/step.rs` declares it **an addition** with `readers_need: true` and a `describes` sentence in both locales; the step tests pass.
- [ ] The version-9 seed joins `SEEDS`, `SEEDED_AT_TEN` is added, and the contract rows in `with_nothing_merged` and every `carried_*` are widened; the seed walk opens version 9 at 10 with its rows.
- [ ] `ContractSchema` and `serializeContract` carry `renewsContractId`; the create, update and fields schemas omit it; a router test shows create and a duplicate cannot write it, and delete then `restoreMany` keeps it.
- [ ] [[contexts/desktop/contract]] gains the renewal link in its vocabulary.

## Relevant areas

- apps/desktop/src/lib/platform/database/schema.ts, contract/serialize.ts, contract/router.ts (schemas), contract/selection/router.ts (`restoreMany`)
- packages/workspace-migrations/migrations/
- apps/desktop/tauri/src/database/step.rs, organization/lease/test/seed.rs, organization/i18n/
- apps/desktop/src/lib/organization/i18n/en.ts, ar.ts (the step sentence)

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- [[rules/migrations]] throughout; no shipped migration is edited.
- No changeset: nothing here is observable by a user yet; say so in Notes.

## Notes
