/**
 * UNDO
 *
 * The undo capability, and the only way in: the session's stack of inverses, taking a change back
 * and applying it again, the offer an announcement carries to do either, and the undo pair on the
 * keyboard. Nothing else in the tree knows how undo works.
 *
 * The mutation layer is its one writer. A declaration carrying an `inverse` is recorded through
 * `recordInverse`, with the `Settlement` saying how its move refreshes the cache, writes the
 * record's account and reports a failure, and its announcement carries the offer through
 * `announceWithOffer`. Undo imports nothing of the mutation layer, which is what keeps the two
 * out of a cycle.
 *
 * The key pair's registration, which the frame mounts once, is rendered through `ui.ts` and is
 * never re-exported here (plan, *Components*).
 */
export type { Inverse } from './undo';
export {
	announceWithOffer,
	applyRedo,
	applyUndo,
	recordInverse,
	type Settlement,
	type UndoOffer
} from './move';
