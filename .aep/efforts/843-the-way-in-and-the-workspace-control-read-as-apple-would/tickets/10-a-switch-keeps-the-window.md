---
status: resolved
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

- [x] `startup/snapshot.ts` carries `switching: string | null`. A `node:test` on `switchWorkspace`
      finds it set before the open and cleared after, and finds `startupScreen` answering
      `switching` in between. *Verified: `node --import tsx --test startup/tests/running.test.ts
      startup/tests/screen.test.ts` printed 36 pass, 0 fail, including "a switch names the workspace it
      is opening from before the open until the pass ends" (loading with `switching: 'South'` first,
      `arrive`, `open`, `drop` all under `switching`, then `null` and `route`) and a failed switch
      clearing it too.*
- [x] `addressAfterSwitch` in `startup/screen.ts` has a `node:test` over the route table: a
      directory, the dashboard and settings stay where they are, and a record page goes to its
      concept's directory. *Verified: the same run, over the real `PAGE_ROUTES` and trail: `/`,
      the three directories and `/settings` stay; every record page goes to its concept's directory,
      each an existing page. The trail is handed in, since startup may not import the shell.*
- [x] For `switching`, root draws `block/loading.svelte` with the page frame's skeleton and "opening
      {name}", in both locales. *Verified: `npx vitest run startup/tests/switching.svelte.test.ts`
      printed 2 passed, finding the skeleton, the status text and the visible line in English and
      Arabic ("جارٍ فتح {name}"), and no progress bar.*
- [x] The order in `switch.ts` is kept: the page stops drawing before the cache is dropped. *Verified:
      `switch.ts` sets loading and `switching` before the open and the drop; the running test finds
      the screen `switching` at the drop, and "switching workspaces drops what was drawn" still
      passes.*
- [x] [[rules/interface]] *Loading* says a switch draws the loading block, and the comment in
      `switch.ts` says what changed. *Verified: *Loading* holds "A switch between workspaces is a
      load, and draws the loading block"; the `switch.ts` comment opens a paragraph on what changed with
      effort 843.*

## Relevant areas

- `apps/desktop/src/lib/startup/{switch,machine,snapshot,screen}.ts`, `startup/tests/`
- `apps/desktop/src/lib/shell/navigation.ts` (the breadcrumb trail)
- `packages/design/src/lib/block/loading.svelte`, `page-frame.svelte`

## Constraints

- [[rules/data]] on cached queries holds. The plan's *Rejected* table says why an in-place switch
  with no loading lost.
