import { inverseStack, type Inverse } from '$lib/design/inverse';

/**
 * The reactive face of {@link inverseStack}. Owns nothing but the mirrors — every decision is
 * the stack's, so what the shell reads here and what the tests exercise there cannot drift
 * apart.
 */
class Undo {
	/** the change undo would take back, or `null` when there is nothing to take back. */
	undoable = $state<Inverse | null>(null);

	/** the change redo would apply again, or `null` when there is nothing to apply. */
	redoable = $state<Inverse | null>(null);

	/** true while an inverse is being applied. */
	isApplying = $state(false);

	constructor() {
		inverseStack.observe(() => {
			this.undoable = inverseStack.undoable;
			this.redoable = inverseStack.redoable;
			this.isApplying = inverseStack.isApplying;
		});
	}

	undo = () => inverseStack.undo();

	redo = () => inverseStack.redo();
}

/** what the shell's undo controls read. */
export const undo = new Undo();
