import type { HistoryEntry } from '$lib/history';
import { LL } from '$lib/i18n/i18n-svelte';
import { notify, type NotificationId } from '$lib/notification';
import type { QueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';
import { inverseStack, type Inverse } from '$lib/undo/undo';

/**
 * What moving a change sets off beyond the stack, which is not undo's to know: the workspace has
 * moved, so what is cached of it is stale, what moved belongs in the record's account, and a
 * move that failed is said the way any failed write is.
 *
 * The mutation layer answers these for every change it records, because they are the three
 * things it already does when a declared mutation lands. **It hands them over with each change
 * rather than registering them once**, so undo holds no setting that a module loaded in the wrong
 * order could leave unset: every change on the stack arrived with the means to settle its move.
 */
export type Settlement = {
	/** make every cached read of the workspace stale, and resolve once it is. */
	refresh: (client: QueryClient) => Promise<void>;
	/** append what the move leaves in the record's account. Never awaited into the move. */
	record: (client: QueryClient, recorded: HistoryEntry | HistoryEntry[] | undefined) => void;
	/** say why the move failed. */
	fail: (failure: Error) => void;
};

/** how each change on the stack settles its move, as the change was recorded with it. */
const settlements = new WeakMap<Inverse, Settlement>();

/**
 * Put what a mutation left behind on the session's stack, with how its move settles.
 *
 * The only way onto the stack from outside this module, which is what makes a change without a
 * settlement impossible rather than merely unlikely.
 */
export function recordInverse(inverse: Inverse, settlement: Settlement) {
	settlements.set(inverse, settlement);
	inverseStack.record(inverse);
}

/**
 * How long an announcement carrying an offer stays on screen.
 *
 * The shared duration suits a confirmation that only has to be read. One that also has to be
 * decided on, and reached for, does not fit in it.
 */
const OFFER_DURATION = 8000;

/** which way an offer would move the undo stack. */
type OfferDirection = 'undo' | 'redo';

/**
 * The offer to move a change back, carried by the announcement that change makes.
 *
 * It names the change rather than a position, because the stack moves whatever is on top and
 * an announcement outlives the moment it was raised in.
 */
export type UndoOffer = { client: QueryClient; change: Inverse; direction: OfferDirection };

/**
 * the announcement currently carrying an offer, where one is on screen.
 *
 * Only the change on top of the stack can be moved, so only one offer is ever live, and an
 * older announcement left standing would offer a control over somebody else's change.
 */
let outstandingOffer: NotificationId | null = null;

function withdrawOutstandingOffer() {
	if (outstandingOffer !== null) {
		notify.dismiss(outstandingOffer);
		outstandingOffer = null;
	}
}

// the stack is emptied whenever the workspace underneath it is replaced, which is a workspace
// switch. An offer still on screen then names a change nothing can move, so it leaves with the
// stack rather than waiting to be pressed and refuse.
inverseStack.observe(() => {
	if (!inverseStack.undoable && !inverseStack.redoable) {
		withdrawOutstandingOffer();
	}
});

function toToastAction({ client, change, direction }: UndoOffer) {
	const translations = get(LL);

	return {
		label: direction === 'undo' ? translations.common.undo.undo() : translations.common.undo.redo(),
		onClick: () => {
			// by identity: the stack is emptied whenever the workspace underneath it is replaced,
			// and an offer outliving that names a change nothing can move.
			const top = direction === 'undo' ? inverseStack.undoable : inverseStack.redoable;

			return top === change ? applyInverse(client, direction) : undefined;
		}
	};
}

/**
 * Announce a change with the offer to move it, withdrawing the offer on screen before it.
 *
 * What a change announces is the mutation layer's to word, and the offer riding on it is this
 * module's: the control, how long it stays, and whether the reader may take it at all.
 *
 * @param detail the second line under the announcement, where the change declares one.
 */
export function announceWithOffer(
	message: string,
	detail: { description: string } | undefined,
	offer: UndoOffer
) {
	withdrawOutstandingOffer();

	// an offer the reader may not take is not made (effort 838, requirement 10): the change is
	// announced alone, without the line saying how long an undo lasts, and the key, asked for it,
	// says why it cannot be taken back.
	if (inverseStack.refusal(offer.direction, get(LL))) {
		notify.success(message);

		return;
	}

	outstandingOffer = notify.success(message, {
		...detail,
		action: toToastAction(offer),
		duration: OFFER_DURATION
	});
}

/**
 * Move the undo stack one step, and announce what moved with the offer to move it back.
 *
 * The inverse issues an ordinary procedure, so the workspace has moved by the time it resolves
 * and the cache is as stale as it would be after any other mutation.
 *
 * **It refreshes when the inverse fails, too.** An inverse can be more than one call, as a
 * contract creation's is, and one failing after another has landed leaves the workspace moved
 * part of the way. The entry stays on the stack to be pressed again, and the screen shows what
 * was written rather than what was there before.
 */
async function applyInverse(client: QueryClient, direction: OfferDirection) {
	// refused here as well as where it is offered, for the key: the procedures behind it would
	// refuse too, and the reader is owed the flag rather than a failure.
	const refusal = inverseStack.refusal(direction, get(LL));

	if (refusal) {
		notify.error(refusal);

		return;
	}

	// read before the move, because a move that throws leaves nothing to read it from.
	const top = direction === 'undo' ? inverseStack.undoable : inverseStack.redoable;
	const settlement = top ? settlements.get(top) : undefined;

	try {
		const applied = await (direction === 'undo' ? inverseStack.undo() : inverseStack.redo());

		if (!applied) {
			return;
		}

		await settlement?.refresh(client);

		// an inverse issues its procedure directly rather than through a declared mutation, so
		// this is the only place that can record it. Without it the account shows a change and
		// stays silent about it being taken back.
		settlement?.record(client, applied.records?.(direction));

		const translations = get(LL);
		const change = applied.describe(translations);

		announceWithOffer(
			direction === 'undo'
				? translations.common.undo.undone({ change })
				: translations.common.undo.redone({ change }),
			undefined,
			// what a change offers next is its opposite: one taken back is one to apply again.
			{ client, change: applied, direction: direction === 'undo' ? 'redo' : 'undo' }
		);
	} catch (failure) {
		// first, as on success: what landed before the failure is on screen before it is spoken of.
		await settlement?.refresh(client);

		settlement?.fail(failure as Error);
	}
}

/** take back the change on top of the undo stack. What the keyboard shortcut calls. */
export function applyUndo(client: QueryClient) {
	return applyInverse(client, 'undo');
}

/** apply the most recently taken-back change again. The mirror of {@link applyUndo}. */
export function applyRedo(client: QueryClient) {
	return applyInverse(client, 'redo');
}
