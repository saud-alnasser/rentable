import type { RecordAct } from '$lib/act';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';

/**
 * A LOCKED READER, AT THE ORGANIZATION'S ACTS
 *
 * Effort 851, requirement 32: a locked member sees the directories their role shows them, and every
 * act on a member, a role or a workspace that writes is drawn as it would be for them unlocked,
 * dimmed and refused with the lock as its reason ([[rules/interface]], *An act that cannot run says
 * why at the control*). The lock comes first, before any reason of the act's own, because it is
 * what stands in the way whatever the record says. Rust refuses every such act again (`Locked`).
 */

/** the reason a locked reader is refused a write, or nothing where they are not locked. */
export const lockedRefusal = (locked: boolean, t: TranslationFunctions): string | undefined =>
	locked ? t.common.permission.locked() : undefined;

/**
 * these acts, each refused for the lock first where `lockedOf` says the reader is locked, save the
 * ones named in `reads`, which write nothing.
 */
export function refusedWhileLocked<T, A extends RecordAct<T>>(
	acts: A[],
	lockedOf: (record: T) => boolean,
	reads: readonly string[] = []
): A[] {
	return acts.map((act) =>
		reads.includes(act.id)
			? act
			: {
					...act,
					unavailable: (record: T, t: TranslationFunctions) =>
						lockedRefusal(lockedOf(record), t) ?? act.unavailable?.(record, t)
				}
	);
}
