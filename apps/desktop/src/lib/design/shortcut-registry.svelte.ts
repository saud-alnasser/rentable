import {
	describeShortcutCollision,
	ShortcutRegistry,
	type ShortcutRegistration
} from '$lib/design/shortcut-registry';
import { recordDiagnosticError } from '$lib/platform/diagnostics';

/**
 * The reactive face of {@link ShortcutRegistry}. Owns nothing but the mirror — every decision is
 * the registry's, so what the help sheet reads here and what the tests exercise there cannot
 * drift apart.
 */
class Shortcuts {
	#registry = new ShortcutRegistry((collision) =>
		// a collision is a fault in the application rather than in what the reader did, and there
		// is nobody to tell. The local diagnostics file is where everything else of that kind
		// goes, and the sheet shows the duplicate at the same time.
		recordDiagnosticError('shortcut.collision', {
			held: collision.held,
			arriving: collision.arriving,
			detail: describeShortcutCollision(collision)
		})
	);

	/** every shortcut registered, for a surface that redraws when one arrives or leaves. */
	registered = $state<readonly ShortcutRegistration[]>([]);

	constructor() {
		this.#registry.observe(() => {
			this.registered = [...this.#registry.registered];
		});
	}

	/**
	 * Hold these shortcuts, and return the removal.
	 *
	 * Call it from an `$effect` and return what it gives back: registering is a component saying
	 * *while I am here*, and the effect's teardown is the only thing that knows when that stops
	 * being true.
	 */
	register = (...registrations: ShortcutRegistration[]) => {
		const removals = registrations.map((registration) => this.#registry.register(registration));

		return () => {
			for (const remove of removals) {
				remove();
			}
		};
	};

	/** every shortcut the application's listener should fire for a keydown. */
	answering: ShortcutRegistry['answering'] = (event, target) =>
		this.#registry.answering(event, target);
}

/**
 * the session's one registry.
 *
 * A module rather than a context because a shortcut is registered from places that share no
 * ancestor — the shell, a primitive's own state, and whatever surface holds a key next — and
 * the sheet has to see all of them at once.
 */
export const shortcuts = new Shortcuts();
