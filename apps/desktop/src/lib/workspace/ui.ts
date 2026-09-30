// What of the workspace only the window can load, which another concept may use: the records an
// earlier version left on this machine, which the way in mentions and the organization's
// workspaces section offers to bring in, the writes that import records and rename a workspace,
// and the fields every form naming a workspace draws. Everything else stays private; `index.ts`
// holds what loads under Node (plan, *A feature has the same two entries*).
export { default as WorkspaceFields } from './component/fields.svelte';
export { readEarlierRecords, useEarlierRecords } from './app-database';
export { useImportRecords, useRenameWorkspace, useSettleEarlierRecords } from './query';
