/**
 * SHORTCUT REGISTRY
 *
 * The one place a keyboard shortcut is declared, and therefore the only place that can answer
 * *what does this application respond to*. Three shortcuts each owned a private window listener
 * before this existed, so nothing could enumerate them: a reader had no way to learn a shortcut
 * was there, and a second one claiming the same keys raced the first in silence.
 *
 * A registration is **a declaration, not a handler**. What it does is a function taking no
 * event, so something other than a keydown can run it; where its keys are answered is a
 * property it states rather than a listener it owns. That is what lets one registration serve
 * the sheet, the application's listener, and a surface answering its own keys.
 */
import {
	isEditingText,
	matchesShortcut,
	shortcutsCollide,
	toShortcutHint,
	type ShortcutCombination,
	type ShortcutKeydown
} from '$lib/design/shortcut';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';

/** What every registration says about itself, whoever answers its keys. */
type ShortcutSubject = {
	/** what names it — in a collision report, and as the sheet's key for its row. */
	id: string;
	/** every combination that fires it. A shortcut with two spellings states both. */
	keys: [ShortcutCombination, ...ShortcutCombination[]];
	/** what it does, read from the translations the caller holds, so the sheet is in the active locale. */
	describe: (translations: TranslationFunctions) => string;
	/**
	 * Whether it stands down where text is being typed.
	 *
	 * Undo does, because `ctrl z` inside a field means the text editor's own undo and always
	 * will. Toggling the navigation does not.
	 */
	standsDownWhileEditing?: boolean;
};

/** A shortcut the application answers from anywhere. */
export type ApplicationShortcut = ShortcutSubject & {
	scope: 'application';
	/**
	 * Do it.
	 *
	 * It takes no event, which is the point: the keydown is one caller and never the only
	 * possible one.
	 */
	run: () => void;
};

/**
 * A shortcut the surface owning it answers on its own element.
 *
 * The registry lists it and never fires it — a key meaning *the next row* has no meaning away
 * from the rows, and a window listener holding it would fire it on every screen. It is
 * registered anyway so that the sheet, which is the only place a reader learns a shortcut
 * exists, does not have to be told about it separately.
 */
export type SurfaceShortcut = ShortcutSubject & { scope: 'surface' };

/** A shortcut, as the registry holds it. */
export type ShortcutRegistration = ApplicationShortcut | SurfaceShortcut;

/** Two registrations that one keydown could set off together. */
export type ShortcutCollision = {
	/** the registration already held. */
	held: string;
	/** the one arriving on keys the first already answers. */
	arriving: string;
	/** the combination the arriving one claims, which the held one also answers. */
	combination: ShortcutCombination;
};

/**
 * How a collision reads where it is written down.
 *
 * Printed with the modifier words rather than an Apple keyboard's symbols: it goes to the
 * diagnostics file, which is read to explain a fault rather than to be pressed.
 */
export function describeShortcutCollision(collision: ShortcutCollision) {
	return `${collision.arriving} claims ${toShortcutHint(collision.combination, false)}, which ${collision.held} already answers`;
}

/**
 * Every shortcut this session has registered.
 *
 * A plain object with observers rather than a runed one, so the whole of the decision — what
 * fires, what collides, what the sheet is given — is reachable from a test that runs under
 * Node. `shortcut-registry.svelte.ts` is the reactive mirror, and owns nothing this does not.
 */
export class ShortcutRegistry {
	#registered: ShortcutRegistration[] = [];
	#observers = new Set<() => void>();
	#report: (collision: ShortcutCollision) => void;

	/**
	 * @param report where a collision goes. It is injected rather than reached for, because a
	 * registry that writes to the machine's diagnostics cannot be exercised by a test asserting
	 * that it reported anything — which is exactly what has to be asserted.
	 */
	constructor(report: (collision: ShortcutCollision) => void) {
		this.#report = report;
	}

	/** every shortcut registered, in the order it was registered. */
	get registered(): readonly ShortcutRegistration[] {
		return this.#registered;
	}

	/** register a listener called after every change. Returns its own removal. */
	observe(observer: () => void) {
		this.#observers.add(observer);

		return () => this.#observers.delete(observer);
	}

	/**
	 * Hold a shortcut, and return the removal.
	 *
	 * A collision is **reported and still registered**. Refusing the second one would decide the
	 * winner by mount order and leave the sheet describing an application that answers keys it
	 * no longer answers; registering both leaves the fault visible in the one place a reader
	 * looks, as well as in the report.
	 */
	register(registration: ShortcutRegistration) {
		for (const collision of this.#collisionsWith(registration)) {
			this.#report(collision);
		}

		this.#registered = [...this.#registered, registration];
		this.#notify();

		return () => this.#remove(registration);
	}

	/**
	 * Every shortcut the application's own listener should fire for this keydown.
	 *
	 * @param target what the keydown reached, so a shortcut that stands down inside a field can.
	 */
	answering(event: ShortcutKeydown, target?: EventTarget | null): ApplicationShortcut[] {
		const editing = isEditingText(target);

		return this.#registered.filter(
			(registration): registration is ApplicationShortcut =>
				registration.scope === 'application' &&
				!(registration.standsDownWhileEditing && editing) &&
				registration.keys.some((combination) => matchesShortcut(event, combination))
		);
	}

	/**
	 * The collisions a registration arrives with.
	 *
	 * A pair of surface shortcuts is not one: they are answered by the element that has focus,
	 * and two elements do not have it at once. Anything an application shortcut is in, is —
	 * that one fires from wherever the reader is standing.
	 */
	#collisionsWith(arriving: ShortcutRegistration) {
		const collisions: ShortcutCollision[] = [];

		for (const held of this.#registered) {
			if (held.scope === 'surface' && arriving.scope === 'surface') {
				continue;
			}

			for (const combination of arriving.keys) {
				if (held.keys.some((claimed) => shortcutsCollide(claimed, combination))) {
					collisions.push({ held: held.id, arriving: arriving.id, combination });
				}
			}
		}

		return collisions;
	}

	#remove(registration: ShortcutRegistration) {
		this.#registered = this.#registered.filter((held) => held !== registration);
		this.#notify();
	}

	#notify() {
		for (const observer of this.#observers) {
			observer();
		}
	}
}

/** One line of the help sheet. */
export type ShortcutSheetEntry = {
	/** the registration's id, which is what keys the row. */
	id: string;
	/** what the shortcut does, in the active locale. */
	description: string;
	/** every combination that fires it, as the keyboard prints them. */
	hints: string[];
};

/**
 * The help sheet's contents, derived from what is registered.
 *
 * This is the whole of what the sheet knows. Nothing here is written beside the shortcuts, so a
 * shortcut registered anywhere appears without the sheet being edited — which is the point of
 * the registry and the thing a hard-coded list would quietly defeat.
 *
 * Ordered by the printed combination rather than by registration order, which is mount order
 * and therefore not an order at all, and rather than by the description, which would reshuffle
 * the whole sheet when the locale changes.
 */
export function toShortcutSheetEntries(
	registered: readonly ShortcutRegistration[],
	translations: TranslationFunctions,
	isAppleKeyboard: boolean
): ShortcutSheetEntry[] {
	return registered
		.map((registration) => ({
			id: registration.id,
			description: registration.describe(translations),
			hints: registration.keys.map((combination) => toShortcutHint(combination, isAppleKeyboard))
		}))
		.sort((one, other) => compareHints(one.hints[0], other.hints[0]));
}

/**
 * Order two printed combinations.
 *
 * A plain comparison rather than a locale-aware one, because these are the names printed on the
 * keys and the sheet must not reorder itself when the reader changes language.
 */
function compareHints(one: string, other: string) {
	if (one === other) {
		return 0;
	}

	return one < other ? -1 : 1;
}
