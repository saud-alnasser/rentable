/**
 * CREATE
 *
 * The create capability, and the only way in: how a set says a record can be added to it and the
 * create key that answers the set on screen. The design package's `create-intent.js` is reached
 * from here and nowhere else in the application.
 *
 * What only the window can load is reached through `ui.ts` and never re-exported here (plan,
 * *Components*): its two components, the one control every set draws and the key's registration,
 * which the frame mounts once, and the state they share, the `?create` intent a host consumes on
 * arrival and where a created record lands.
 */
export { withCreateIntent } from '@rentable/design/create-intent.js';
export { CREATE_KEYS, toCreateShortcut, type CreateTarget } from './key';
export type { LandingRequest } from './landing.svelte';
