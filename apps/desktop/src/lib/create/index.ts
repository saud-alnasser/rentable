/**
 * CREATE
 *
 * The create capability, and the only way in: how a set says a record can be added to it, the
 * create key that answers the set on screen, the `?create` intent a host consumes on arrival, and
 * where a created record lands. The design package's `create-intent.js` is reached from here and
 * nowhere else in the application.
 *
 * Its two components are its own and are never re-exported here (plan, *Components*):
 * `component/control.svelte`, the one control every set draws, and `component/shortcut.svelte`,
 * the key's registration, which the frame mounts once.
 */
export { withCreateIntent } from '@rentable/design/create-intent.js';
export { consumeCreateIntent } from './intent.svelte';
export { CREATE_KEYS, toCreateShortcut, type CreateTarget } from './key';
export {
	dropLandingOnNavigation,
	landing,
	whenSurfacesClose,
	type LandingRequest
} from './landing.svelte';
export { createTargets } from './target.svelte';
