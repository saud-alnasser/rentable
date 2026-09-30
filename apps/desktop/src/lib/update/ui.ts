// What of the update only the window can load, which another concept may use: checking for the
// next release, preparing it and restarting into it. Everything else stays private; `index.ts`
// holds what loads under Node (plan, *A feature has the same two entries*).
export { useCheckForUpdate, usePrepareUpdate, useRestartApp } from './query';
