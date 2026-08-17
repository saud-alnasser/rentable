import type { ApplicationShortcut } from '$lib/design/shortcut-registry';

/** Held with ctrl or command: undo, and redo with shift. */
const UNDO_KEY = 'z';

/** the other redo, the one Windows applications answer to. */
const REDO_KEY = 'y';

/** which way a keydown would move the undo stack. */
export type UndoIntent = 'undo' | 'redo';

/**
 * The undo pair, as registrations.
 *
 * The whole decision is here rather than in the shell so it can be checked: which physical keys
 * count, that shift is what separates the two — stated on the `z` pair and left unstated on `y`,
 * which never looked at it — and that both stand down inside a field where those keys mean the
 * text editor's own undo and always will.
 *
 * @param apply what each direction does. Passed in because the stack is reached through a query
 * client the shell holds and this module has no business knowing about.
 */
export function toUndoShortcuts(apply: (intent: UndoIntent) => void): ApplicationShortcut[] {
	return [
		{
			id: 'undo',
			scope: 'application',
			keys: [{ key: UNDO_KEY, command: true, shift: false }],
			describe: (translations) => translations.common.undo.undo(),
			standsDownWhileEditing: true,
			run: () => apply('undo')
		},
		{
			id: 'redo',
			scope: 'application',
			keys: [
				{ key: UNDO_KEY, command: true, shift: true },
				{ key: REDO_KEY, command: true }
			],
			describe: (translations) => translations.common.undo.redo(),
			standsDownWhileEditing: true,
			run: () => apply('redo')
		}
	];
}
