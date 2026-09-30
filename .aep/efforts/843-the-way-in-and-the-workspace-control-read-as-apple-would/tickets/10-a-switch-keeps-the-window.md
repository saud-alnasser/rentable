---
status: open
blocked-by: [09]
---

# feat(desktop): a workspace switch loads the page, not the application

## Outcome

Choosing another workspace first moves a record page to its directory. The workspace then opens with
the rail and titlebar up, and the page shows the shared loading block with "opening {name}". The old
workspace's rows are never drawn under the new name.

## Acceptance Criteria

Traces requirement 12 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
and its criterion 12.

- [ ] `startup/snapshot.ts` carries `switching: string | null`. A `node:test` on `switchWorkspace`
      finds it set before the open and cleared after, and finds `startupScreen` answering
      `switching` in between.
- [ ] `addressAfterSwitch` in `startup/screen.ts` has a `node:test` over the route table: a
      directory, the dashboard and settings stay where they are, and a record page goes to its
      concept's directory.
- [ ] For `switching`, root draws `block/loading.svelte` with the page frame's skeleton and "opening
      {name}", in both locales.
- [ ] The order in `switch.ts` is kept: the page stops drawing before the cache is dropped.
- [ ] [[rules/interface]] *Loading* says a switch draws the loading block, and the comment in
      `switch.ts` says what changed.

## Relevant areas

- `apps/desktop/src/lib/startup/{switch,machine,snapshot,screen}.ts`, `startup/tests/`
- `apps/desktop/src/lib/shell/navigation.ts` (the breadcrumb trail)
- `packages/design/src/lib/block/loading.svelte`, `page-frame.svelte`

## Constraints

- [[rules/data]] on cached queries holds. The plan's *Rejected* table says why an in-place switch
  with no loading lost.
