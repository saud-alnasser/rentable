/**
 * What another concept may import of startup: the unit and the snapshot it draws the shell
 * from, how a route reaches the unit `component/root.svelte` created, and the way in the
 * addresses beside the wall leave for. Loadable under Node; the screens are the root's to draw,
 * from `component/`.
 */

export {
	createStartup,
	type Startup,
	type SignInReason,
	type StartupPorts,
	type StartupSnapshot,
	type StartupState,
	type SyncOutcome
} from './startup';
export { provideStartup, useStartup } from './context';
export { startupSurfaceBeforeLocale, type PreLocaleSurface } from './gate';
export { addressAfterSignOut, THE_WAY_IN } from './shell-surface';
