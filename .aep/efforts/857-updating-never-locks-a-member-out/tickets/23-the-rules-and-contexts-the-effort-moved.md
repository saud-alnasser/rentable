---
status: open
blocked-by: [16, 17]
---

# docs: the rules and contexts the effort moved

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]].

## Outcome

Found at converge round one: the rules and contexts that still describe what the effort changed say what is true now.

## Acceptance Criteria

Traces requirement 1, requirement 6 and requirement 11.

- [ ] [[rules/module-layout]] names the update state under `update/` instead of `settings/update-announcement.ts` and `settings/update-download.svelte.ts`.
- [ ] [[contexts/desktop/components]] takes its `details` and spinning-glyph examples from `update/component/update-action.svelte`.
- [ ] [[rules/migrations]] no longer says a reshape takes older builds off the moment one newer build opens it; it says an upgrade runs when someone runs it on purpose.
- [ ] [[rules/interface]] no longer calls the terminated-payment note the only standing explanation of a refusal; it names the read-only notice too.
- [ ] `node .aep/scripts/validate.mjs` passes and the index is regenerated.

## Relevant areas

- .aep/rules/module-layout.md, migrations.md, interface.md, .aep/contexts/desktop/components.md

## Constraints

- No changeset; nothing here is observable by a user.
