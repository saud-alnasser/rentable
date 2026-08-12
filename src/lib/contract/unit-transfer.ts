/**
 * UNIT TRANSFER
 *
 * What a contract holds once one unit is moved between the panes of its units tab.
 *
 * A transfer commits on its own as a whole-set write (ADR 0029), so the set is derived from
 * what the record holds rather than accumulated on screen — there is no unsaved state for it
 * to be computed from.
 */

/**
 * The units a contract holds after one is moved.
 *
 * @param heldUnitIds what the contract holds now — unfiltered, whatever the panes are showing.
 * @param unitId the unit whose row was pressed.
 * @param wasHeld the side it was pressed on: held units leave the set, offered ones join it.
 */
export function toTransferredUnitIds(
	heldUnitIds: readonly number[],
	unitId: number,
	wasHeld: boolean
): number[] {
	const remaining = heldUnitIds.filter((id) => id !== unitId);

	return wasHeld ? remaining : [...remaining, unitId];
}
