import { inverseStack } from '$lib/design/inverse';

/**
 * The reactive face of {@link inverseStack}. Owns nothing but the mirror — the stack is the
 * plain one so that the mutation layer, which is not a component, records onto the same one a
 * surface reads.
 *
 * It exists because a control can now be *offered while unavailable*: the palette lists undo
 * whether or not there is anything to take back, and says which it is. Reading the stack
 * directly would answer that once, at the moment the row was built, and never again.
 */
class Undoable {
	/** whether there is a change to take back. */
	canUndo = $state(false);

	/** whether there is a taken-back change to apply again. */
	canRedo = $state(false);

	constructor() {
		inverseStack.observe(() => {
			this.canUndo = Boolean(inverseStack.undoable);
			this.canRedo = Boolean(inverseStack.redoable);
		});
	}
}

/** the session's one mirror, for the one stack. */
export const undoable = new Undoable();
