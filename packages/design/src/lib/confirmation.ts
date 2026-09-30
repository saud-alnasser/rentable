import { TRPCError } from '@trpc/server';

/**
 * CONFIRMATION
 *
 * What a confirmation surface may offer, given what the surface behind it knows about the
 * record. The procedure refuses a forbidden operation either way — this decides what is put
 * in front of the reader before they press anything.
 *
 * What a surface holds while it is offering that — whether the call is in flight, and the
 * refusal the last attempt earned — is `confirmation.svelte.ts` beside this file, because a
 * rune cannot be declared in a plain module.
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

/**
 * What a failed confirmation says to the reader, or `null` where it says nothing.
 *
 * Only a `BAD_REQUEST` is a refusal the procedure raised to be read. Anything else is a fault
 * rather than an answer to what was asked, and the surface stays silent rather than putting an
 * internal message in a callout; the caller's own error handling is what reports one.
 *
 * `read` turns the refusal into the reader's words. **The package has no locale**, so the
 * consumer supplies it through the string contract's `refusal`: a refusal crosses as a code and
 * its values rather than as a sentence, and only the consumer knows the sentence. Left out, the
 * refusal is shown as it was raised.
 *
 * `unexpected` covers the refusal that reads as nothing at all, which is a shape nothing here
 * writes deliberately and every surface would otherwise render as an empty callout.
 */
export function toRefusal(
	failure: unknown,
	unexpected: string,
	read: (refusal: TRPCError) => string = (refusal) => refusal.message
): string | null {
	if (!(failure instanceof TRPCError) || failure.code !== 'BAD_REQUEST') {
		return null;
	}

	return read(failure) || unexpected;
}

/**
 * What a confirmation surface shows, held while it closes.
 *
 * A caller closes a surface by forgetting what it asked about, so the record and what blocks it
 * empty in the same moment the surface is told to close. The surface is still on screen while it
 * leaves, and redrawn from those emptied props it turns into the question it never asked: a
 * refused delete became the delete form, with no record named and its destructive control
 * offered, for the length of the closing. So what is shown is read afresh only while the surface
 * is open, and the last of it is kept once it is not.
 *
 * Read inside a `$derived`, the reading tracks what `read` touches only while open, so props
 * that change behind a closing surface do not reach it.
 */
export function heldWhileOpen<T>(isOpen: () => boolean, read: () => T): () => T {
	let shown = read();

	return () => {
		if (isOpen()) {
			shown = read();
		}

		return shown;
	};
}
