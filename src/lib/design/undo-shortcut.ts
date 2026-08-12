import { isEditingText, matchesShortcutKey } from '$lib/design/shortcut';

/** Held with ctrl or command: undo, and redo with shift. */
const UNDO_KEY = 'z';

/** the other redo, the one Windows applications answer to. */
const REDO_KEY = 'y';

/** which way a keydown would move the undo stack, if either. */
export type UndoIntent = 'undo' | 'redo';

/**
 * Read a keydown as an intention to move the undo stack.
 *
 * The whole decision is here rather than in the shell so it can be checked: which physical
 * keys count, that shift reverses the direction, and that the pair stands down inside a field
 * where those keys mean the text editor's own undo and always will.
 *
 * @param event the keydown, as far as its keys and modifiers.
 * @param target what the keydown reached, so a text field can keep its own shortcuts.
 */
export function toUndoIntent(
	event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey'>,
	target?: EventTarget | null
): UndoIntent | null {
	if (!(event.metaKey || event.ctrlKey) || isEditingText(target)) {
		return null;
	}

	if (matchesShortcutKey(event, UNDO_KEY)) {
		return event.shiftKey ? 'redo' : 'undo';
	}

	return matchesShortcutKey(event, REDO_KEY) ? 'redo' : null;
}
