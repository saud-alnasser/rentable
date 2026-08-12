/**
 * Whether a keydown carries the given shortcut character, ignoring modifiers.
 *
 * Matches the physical key as well as the character it produces. Under an Arabic layout the
 * `b` key reports `ب`, so comparing against the character alone leaves a shortcut dead in a
 * locale this application treats as first-class; accepting either half also keeps it live
 * under a layout that moves the character somewhere else.
 *
 * @param character the shortcut's character, as a single lowercase letter.
 */
export function matchesShortcutKey(event: Pick<KeyboardEvent, 'key' | 'code'>, character: string) {
	return event.key === character || event.code === `Key${character.toUpperCase()}`;
}

/** the elements that take typing, and whose own editing shortcuts a surface must not take. */
const EDITABLE_TAG_NAMES = new Set(['INPUT', 'TEXTAREA']);

/**
 * Whether what the event reached is somewhere text is being typed.
 *
 * A shortcut that collides with the text editor's own — undo above all — stands down here
 * rather than fighting for it. The test reads the element rather than a list of components: a
 * rich control that is not an `input` still takes typing, and `contenteditable` is how it says
 * so.
 *
 * @param target the event's target, which is an element only some of the time.
 */
export function isEditingText(target?: EventTarget | null) {
	// `EventTarget` is the honest type of what arrives and carries neither property, so the two
	// that decide this are read off it rather than asserted onto an element it may not be.
	const element = target as { tagName?: string; isContentEditable?: boolean } | null | undefined;

	if (!element) {
		return false;
	}

	return Boolean(element.isContentEditable) || EDITABLE_TAG_NAMES.has(element.tagName ?? '');
}
