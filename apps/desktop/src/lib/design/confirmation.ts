/**
 * CONFIRMATION
 *
 * What a confirmation surface may offer, given what the surface behind it knows about the
 * record. The procedure refuses a forbidden operation either way — this decides what is put
 * in front of the reader before they press anything.
 */

/**
 * What a caller passes while it is still reading what depends on the record.
 *
 * It is a value rather than an absence because the two are different answers and only one of
 * them withholds the control: a caller with nothing to read says nothing, and a caller that
 * has not finished reading says this. Spelling the second as a missing value made every
 * caller of the first kind indistinguishable from one that had never answered.
 */
export const AWAITING_BLOCKERS = 'awaiting';

/**
 * What stops the record being acted on, in the reader's words.
 *
 * An omitted value and an empty list are the same answer — *nothing blocks this*.
 */
export type Blockers = readonly string[] | typeof AWAITING_BLOCKERS;

/**
 * What the surface does with the confirming control.
 *
 * `offered` puts it in front of the reader; `awaiting` shows it and waits, because the answer
 * is not known yet; `blocked` withholds it entirely and says why instead.
 */
export type ConfirmationState = 'offered' | 'awaiting' | 'blocked';

export type Confirmation = {
	state: ConfirmationState;
	/** what to name as standing in the way — empty unless the state is `blocked`. */
	blocking: readonly string[];
};

/**
 * What the surface does with the confirming control, and what it names instead.
 *
 * Both answers come from one reading of `blockers`, so the surface never discriminates the
 * value a second time to work out what to render.
 */
export function toConfirmation(blockers: Blockers | undefined): Confirmation {
	if (blockers === AWAITING_BLOCKERS) {
		return { state: 'awaiting', blocking: [] };
	}

	const blocking = blockers ?? [];

	return { state: blocking.length > 0 ? 'blocked' : 'offered', blocking };
}

/**
 * Whether the confirming control may be pressed.
 *
 * A past refusal is deliberately not an input: it describes the attempt that earned it, and
 * treating it as a reason to keep withholding the control is what left a refused deletion
 * impossible to try again without dismissing the surface.
 */
export function isConfirmable(state: ConfirmationState, isSubmitting: boolean): boolean {
	return state === 'offered' && !isSubmitting;
}
