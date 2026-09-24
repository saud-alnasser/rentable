import type { RecordAct } from '$lib/design/acts';
import type { Unit } from '$lib/platform/database/schema';
import CopyIcon from '@lucide/svelte/icons/copy';
import SquarePenIcon from '@lucide/svelte/icons/square-pen';
import Trash2Icon from '@lucide/svelte/icons/trash-2';

/**
 * UNIT ACTS
 *
 * Everything a person can do to one unit, in the order every surface offers it: the card's menu
 * and its context menu in the complex's unit directory, the unit's own page, and the command menu.
 * Each of those is a projection of this list (`design/acts.ts`), so the unit's page offers what its
 * card offers.
 *
 * **No duplicate.** A unit is created from the complex holding it, by name, and a name is the one
 * thing a copy could not keep.
 */

/**
 * What an act is given: a unit as any surface holds one. The complex's name is there where the
 * surface has it (the page reads it; the directory knows which complex it lists); the host reads
 * the unit for it where it is not.
 */
export type UnitActRecord = Unit & { complexName?: string };

/** Every unit act, by the id the palette keys it on. */
export type UnitActId = 'unit.copyDetails' | 'unit.edit' | 'unit.delete';

/**
 * What the acts ask of the unit host. Each one opens something the host owns, and none of them
 * writes anything: the host's form and confirmation are where a unit is changed.
 */
export type UnitHostRequests = {
	/** put the unit's details on the clipboard. */
	copyDetails: (unit: UnitActRecord) => void;
	/** open the form on this unit. */
	edit: (unit: UnitActRecord) => void;
	/** ask before deleting this unit. */
	confirmDelete: (unit: UnitActRecord) => void;
};

/** A unit act, with the id narrowed to the ones declared here. */
export type UnitAct = RecordAct<UnitActRecord> & { id: UnitActId };

/**
 * The unit's acts, bound to the host that carries them out: a function of the host so the list can
 * be read, and run, without the host being mounted.
 */
export function declareUnitActs(host: UnitHostRequests): UnitAct[] {
	return [
		{
			id: 'unit.copyDetails',
			label: (t) => t.common.actions.copyDetails(),
			icon: CopyIcon,
			group: 'primary',
			run: host.copyDetails
		},
		{
			id: 'unit.edit',
			label: (t) => t.common.actions.edit(),
			icon: SquarePenIcon,
			group: 'primary',
			run: host.edit
		},
		{
			// always offered: what a deletion is refused for (any contract that ever named the unit) is
			// read when it is asked, and the confirmation says it.
			id: 'unit.delete',
			label: (t) => t.common.actions.delete(),
			icon: Trash2Icon,
			tone: 'error',
			group: 'destructive',
			run: host.confirmDelete
		}
	];
}
