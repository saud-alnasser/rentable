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
