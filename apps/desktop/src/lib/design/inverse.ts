import type { HistoryEntry } from '$lib/history/history';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';

/**
 * INVERSE
 *
 * what a mutation leaves behind so the user can take it back: the call that reverses it, the
 * call that applies it again, and what to call the change while a control is offering it.
 *
 * Both calls issue an ordinary procedure — the same one a typed action goes through — so
 * validation, the reconcile and the push to the remote all fire exactly as they did the first
 * time, and there is no second write path that could diverge from the first (ADR 0026).
 */
export type Inverse = {
	/** the change itself, named — "deleting a tenant" — never the act of undoing it. */
	describe: (translations: TranslationFunctions) => string;
	/** return the workspace to the state before the mutation. */
	undo: () => Promise<unknown>;
	/** apply the mutation again, with the identity it had. */
	redo: () => Promise<unknown>;
	/**
	 * what moving this change leaves in the record's account, in whichever direction it moved.
	 *
	 * Declared here as well as on the mutation because **an inverse does not go through the
	 * mutation's own success path** — it issues the procedure directly, so nothing else would
	 * record it. A history that shows a contract being terminated and stays silent about it being
	 * taken back is worse than no history: it reports something that is no longer true.
	 *
	 * The direction decides which way it reads, because the two are opposite events and both are
	 * things that happened: undoing a termination *is* a restoration, and the account says so.
	 */
	records?: (direction: 'undo' | 'redo') => HistoryEntry | HistoryEntry[] | undefined;
};

/**
 * The session's inverses, newest last.
 *
 * Last in, first out, and that ordering is load-bearing rather than conventional: the engine
 * hands out the next id above the highest in use, so deleting the highest-numbered record and
 * creating another takes the freed id. Undoing that deletion could only collide by reaching
 * past the creation that took the id — which a stack cannot do.
 *
 * Cleared whenever the workspace underneath it is replaced. An inverse is a statement about a
 * database, and a sync pull, a backup restore or a workspace switch replaces the one it was
 * written against; replaying it there would corrupt rather than undo.
 */
export class InverseStack {
	#undoable: Inverse[] = [];
	#redoable: Inverse[] = [];
	#observers = new Set<() => void>();
	#isApplying = false;

	// bumped by every clear, so an inverse that was in flight when the workspace was replaced
	// cannot land on the stack it was taken from.
	#generation = 0;

	/** the change undo would take back, or `null` when there is nothing to take back. */
	get undoable(): Inverse | null {
		return this.#undoable.at(-1) ?? null;
	}

	/** the change redo would apply again, or `null` when there is nothing to apply. */
	get redoable(): Inverse | null {
		return this.#redoable.at(-1) ?? null;
	}

	/** true while an inverse is being applied, so a control can stand down rather than queue. */
	get isApplying() {
		return this.#isApplying;
	}

	/** register a listener called after every state change. Returns its own removal. */
	observe(observer: () => void) {
		this.#observers.add(observer);

		return () => this.#observers.delete(observer);
	}

	/**
	 * take a change back, and say which one was taken. `null` where there was nothing to take
	 * back, or where one was already being applied.
	 *
	 * An inverse that throws stays where it was: it did not move the workspace, and dropping it
	 * would leave the user unable to try again.
	 */
	undo() {
		return this.#apply(this.#undoable, this.#redoable, (inverse) => inverse.undo());
	}

	/** apply a taken-back change again, and say which one. The mirror of {@link undo}. */
	redo() {
		return this.#apply(this.#redoable, this.#undoable, (inverse) => inverse.redo());
	}

	/**
	 * record what a mutation left behind.
	 *
	 * A new change makes everything taken back unreachable: those inverses were written
	 * against a workspace that no longer exists ahead of this point.
	 */
	record(inverse: Inverse) {
		this.#undoable.push(inverse);
		this.#redoable = [];
		this.#notify();
	}

	/** forget every inverse, in both directions. */
	clear() {
		this.#generation += 1;
		this.#undoable = [];
		this.#redoable = [];
		this.#notify();
	}

	async #apply(
		from: Inverse[],
		to: Inverse[],
		call: (inverse: Inverse) => Promise<unknown>
	): Promise<Inverse | null> {
		const inverse = from.at(-1);

		if (!inverse || this.#isApplying) {
			return null;
		}

		const generation = this.#generation;

		this.#isApplying = true;
		this.#notify();

		try {
			await call(inverse);
		} finally {
			this.#isApplying = false;
			this.#notify();
		}

		if (generation !== this.#generation) {
			return null;
		}

		// by identity rather than by position: an inverse issues a real procedure, and a mutation
		// the user started before it can settle while it is in flight and record onto this very
		// stack. Popping the top would then move somebody else's change.
		const position = from.lastIndexOf(inverse);

		if (position !== -1) {
			from.splice(position, 1);
		}

		to.push(inverse);
		this.#notify();

		return inverse;
	}

	#notify() {
		for (const observer of this.#observers) {
			observer();
		}
	}
}

/**
 * the session's one stack.
 *
 * A module rather than a per-screen instance because a change outlives the screen that made
 * it: a tenant deleted from its own page is undone from the shell, after that page is gone.
 * It is the plain stack rather than the reactive face beside it so that the mutation layer,
 * which is not a component, can record onto the same stack the shell reads.
 */
export const inverseStack = new InverseStack();
