import type { CreateTarget } from '$lib/design/create-key';

/**
 * The sets on screen that a record can be added to, in the order they were drawn.
 *
 * Each create control holds its place here while it is mounted, which is what makes the create
 * key answer the set on screen without anything naming a route: a directory, a record's embedded
 * list and a settings directory each draw the one control, and the control says it is here. The
 * last one drawn answers, so a list opened inside a record answers over the page behind it.
 *
 * A module rather than a context, for the reason the shortcut registry is one: the key is
 * registered in the frame, and the controls are drawn by surfaces that share no ancestor with it.
 */
class CreateTargets {
	// raw rather than deep: a place is given back by identity, and a proxied target is not the one
	// that was handed in.
	held = $state.raw<readonly CreateTarget[]>([]);

	/** the set that answers the create key, or nothing where no set is on screen. */
	get onScreen(): CreateTarget | undefined {
		return this.held.at(-1);
	}

	/**
	 * Hold a set while its control is drawn, and return the removal.
	 *
	 * Call it from an `$effect` and return what it gives back, as a shortcut is registered.
	 */
	hold = (target: CreateTarget) => {
		this.held = [...this.held, target];

		return () => {
			this.held = this.held.filter((held) => held !== target);
		};
	};
}

/** the session's one list of sets on screen. */
export const createTargets = new CreateTargets();
