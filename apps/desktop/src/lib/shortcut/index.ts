/**
 * SHORTCUT
 *
 * The keyboard shortcut capability, and the only way in. A surface registers what it answers
 * through `shortcuts.register`, the help sheet and the palette read `shortcuts.registered`, and
 * the application's one key listener (`component/listener.svelte`) is this module's own: nothing
 * else in the tree listens for a keydown to run an application shortcut. The registry and the
 * listener are the window's, so both are reached through `ui.ts`; this file holds what loads under
 * Node.
 *
 * What a combination is made of, how it is matched and how it is printed (`⌘` or `Ctrl`) stays
 * in `@rentable/design/shortcut.js`, because the package's own cards print an act's key with it
 * and the package imports nothing of this application.
 */
export {
	toShortcutSheetEntries,
	type ApplicationShortcut,
	type ShortcutCollision,
	type ShortcutRegistration,
	type ShortcutSheetEntry,
	type SurfaceShortcut
} from './shortcut';
export { isCovered } from './covered';
