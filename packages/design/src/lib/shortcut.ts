/**
 * SHORTCUT
 *
 * What a keyboard shortcut is made of, before anything decides where it is answered: the
 * combination it claims, whether a keydown carries that combination, whether two combinations
 * could be carried by one keydown, and how a combination is printed.
 *
 * The registry that holds them is `shortcut-registry.ts`; nothing here knows it exists.
 */

/** the physical keys whose name is not derived from the character sitting on them. */
const PHYSICAL_KEYS: Record<string, string> = { '/': 'Slash' };

/**
 * The physical key a shortcut's character sits on, as `KeyboardEvent.code` names it.
 *
 * A letter's is its own name under `Key`. A key that is named rather than typed — `ArrowDown`,
 * `Enter` — reports the same string as both `key` and `code`, so it is its own answer. What is
 * left is punctuation, where the two disagree and the mapping has to be stated.
 */
function toPhysicalKey(character: string) {
	if (character.length > 1) {
		return character;
	}

	return PHYSICAL_KEYS[character] ?? `Key${character.toUpperCase()}`;
}

/**
 * Whether a keydown carries the given shortcut character, ignoring modifiers.
 *
 * Matches the physical key as well as the character it produces. Under an Arabic layout the
 * `b` key reports `ب`, so comparing against the character alone leaves a shortcut dead in a
 * locale this application treats as first-class; accepting either half also keeps it live
 * under a layout that moves the character somewhere else.
 *
 * @param character the shortcut's character — a single lowercase letter, a punctuation mark, or
 * the name of a key that types nothing.
 */
export function matchesShortcutKey(event: Pick<KeyboardEvent, 'key' | 'code'>, character: string) {
	return event.key === character || event.code === toPhysicalKey(character);
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

/**
 * One set of keys that fires a shortcut.
 *
 * **A modifier stated must match; a modifier omitted is not consulted.** The three states are
 * what let `ctrl z` and `ctrl shift z` be two different shortcuts while `ctrl k` stays the one
 * shortcut it has always been — it never looked at shift, and stating `shift: false` here would
 * silently take `ctrl shift k` away from a reader who has been pressing it.
 */
export type ShortcutCombination = {
	/**
	 * the shortcut's character — a single lowercase letter, a punctuation mark, or the name a key
	 * that types nothing reports, as `ArrowDown` and `Enter` do.
	 */
	key: string;
	/** ctrl on a PC keyboard and command on an Apple one; either satisfies it. */
	command?: boolean;
	/** shift. */
	shift?: boolean;
};

/** What a keydown has to carry for a combination to decide anything. */
export type ShortcutKeydown = Pick<
	KeyboardEvent,
	'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey'
>;

/** Whether a modifier a combination stated is satisfied by what is held. */
function matchesModifier(stated: boolean | undefined, held: boolean) {
	return stated === undefined || stated === held;
}

/** Whether one keydown could satisfy both statements of a modifier. */
function modifiersOverlap(one: boolean | undefined, other: boolean | undefined) {
	return one === undefined || other === undefined || one === other;
}

/**
 * Whether a keydown fires this combination.
 *
 * The character is matched by {@link matchesShortcutKey}, so the physical key counts as well as
 * the character the layout produces.
 */
export function matchesShortcut(event: ShortcutKeydown, combination: ShortcutCombination) {
	return (
		matchesShortcutKey(event, combination.key) &&
		matchesModifier(combination.command, event.metaKey || event.ctrlKey) &&
		matchesModifier(combination.shift, event.shiftKey)
	);
}

/**
 * Whether some one keydown would fire both combinations.
 *
 * This is what a collision is: not that two shortcuts mention the same letter, but that a
 * reader pressing keys once could set both of them off. `ctrl z` and `ctrl shift z` mention the
 * same letter and are answered apart, so they are not one.
 */
export function shortcutsCollide(one: ShortcutCombination, other: ShortcutCombination) {
	return (
		one.key === other.key &&
		modifiersOverlap(one.command, other.command) &&
		modifiersOverlap(one.shift, other.shift)
	);
}

/** what an Apple keyboard prints on its modifier keys. */
const APPLE_MODIFIERS = { command: '⌘', shift: '⇧' };

/** what every other keyboard prints on them. */
const KEYBOARD_MODIFIERS = { command: 'Ctrl', shift: 'Shift' };

/**
 * what a key is printed as, where the name it reports is not what a reader would look for.
 *
 * The arrows are the glyphs on the keys themselves, which is shorter than their names and is
 * the same in both locales — the sheet prints the keyboard, not the language.
 */
const PRINTED_KEYS: Record<string, string> = {
	ArrowUp: '↑',
	ArrowDown: '↓',
	ArrowLeft: '←',
	ArrowRight: '→',
	Enter: 'Enter'
};

/**
 * Whether the keyboard prints modifier symbols rather than modifier words.
 *
 * Read at the point of use rather than at module load: this file is imported by tests running
 * under Node, where there is no navigator to read and no keyboard to describe.
 */
export function usesAppleKeyboard() {
	return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
}

/**
 * A combination as the keyboard prints it.
 *
 * A modifier appears only where the combination requires it — one it does not consult is not
 * something the reader has to press, so printing it would name keys the shortcut never asked
 * for.
 *
 * @param isAppleKeyboard from {@link usesAppleKeyboard}, passed in so a surface reads the
 * platform once rather than once per shortcut.
 */
export function toShortcutHint(combination: ShortcutCombination, isAppleKeyboard: boolean) {
	const modifiers = isAppleKeyboard ? APPLE_MODIFIERS : KEYBOARD_MODIFIERS;
	const held: string[] = [];

	if (combination.command) {
		held.push(modifiers.command);
	}

	if (combination.shift) {
		held.push(modifiers.shift);
	}

	return [...held, PRINTED_KEYS[combination.key] ?? combination.key.toUpperCase()].join(' ');
}
