---
status: open
---

# refactor(desktop): the unused workspace gate is deleted

## Outcome

The human's decision after review round two. `workspace/component/permitted.svelte` and the helpers
it alone used (`workspace/permitted.ts`) had no caller before the effort, and beside the gates this
effort built, a documented permission gate that nothing uses misleads. After this, they are gone,
with their test, and nothing names them.

## Acceptance Criteria

Traces requirement 10 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [ ] `workspace/component/permitted.svelte`, `workspace/permitted.ts` and its test are deleted, and
      a grep of the sources and the rules names neither.
- [ ] `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `src/lib/workspace/component/permitted.svelte`, `src/lib/workspace/permitted.ts`,
  `src/lib/workspace/tests/permitted.test.ts`, `organization/component/workspaces.svelte`
