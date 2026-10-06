import type { ApplicationShortcut } from '$lib/shortcut';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';

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
 * Each says why it cannot run when the stack in that direction is empty. That is not for the
 * keyboard, which gets a no-op either way — it is for the palette, which offers both by name
 * and would otherwise show a reader a row that does nothing and explains nothing.
 *
 * @param apply what each direction does. Passed in because the stack is reached through a query
 * client the shell holds and this module has no business knowing about.
 * @param hasChange whether there is anything to apply in a direction, for the same reason: the
 * stack's reactive face is a rune module, and this one is read by a test running under Node.
 * @param refusal why the reader may not move the change there is in a direction, or nothing where
 * they may (`InverseStack.refusal`, effort 838).
 * @param isCovered whether a form, a sheet or a confirmation stands over the page, asked at each
 * press. While one does, neither direction moves anything: the change on top of the stack is one
 * the reader cannot see from under the cover (effort 854, requirement 12). Passed in because the
 * answer is read from the document, which a test under Node has none of.
 */
export function toUndoShortcuts(
	apply: (intent: UndoIntent) => void,
	hasChange: (intent: UndoIntent) => boolean,
	refusal: (intent: UndoIntent, translations: TranslationFunctions) => string | undefined,
	isCovered: () => boolean
): ApplicationShortcut[] {
	// still the application's key under a cover, so the webview never takes it; it just moves
	// nothing until the cover is gone.
	const move = (intent: UndoIntent) => {
		if (!isCovered()) {
			apply(intent);
		}
	};

	return [
		{
			id: 'undo',
			scope: 'application',
			keys: [{ key: UNDO_KEY, command: true, shift: false }],
			describe: (translations) => translations.common.undo.undo(),
			unavailable: (translations) =>
				hasChange('undo')
					? refusal('undo', translations)
					: translations.common.undo.nothingToUndo(),
			standsDownWhileEditing: true,
			run: () => move('undo')
		},
		{
			id: 'redo',
			scope: 'application',
			keys: [
				{ key: UNDO_KEY, command: true, shift: true },
				{ key: REDO_KEY, command: true }
			],
			describe: (translations) => translations.common.undo.redo(),
			unavailable: (translations) =>
				hasChange('redo')
					? refusal('redo', translations)
					: translations.common.undo.nothingToRedo(),
			standsDownWhileEditing: true,
			run: () => move('redo')
		}
	];
}
