/**
 * What another concept may import of startup: the unit and the snapshot it draws the shell
 * from, and how a route reaches the unit the root layout created. Loadable under Node; the
 * screens are the root layout's to draw, from `component/`.
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
