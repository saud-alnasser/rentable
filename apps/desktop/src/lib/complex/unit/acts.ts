import type { RecordAct } from '$lib/design/acts';
import type { Unit } from '$lib/platform/database/schema';
import CopyIcon from '@lucide/svelte/icons/copy';
import FilePlusIcon from '@lucide/svelte/icons/file-plus';
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
export type UnitActId = 'unit.copyDetails' | 'unit.edit' | 'unit.newContract' | 'unit.delete';

/**
 * What the acts ask of the unit host. Each one opens something the host owns, and none of them
 * writes anything: the host's form and confirmation are where a unit is changed.
 */
export type UnitHostRequests = {
	/** put the unit's details on the clipboard. */
	copyDetails: (unit: UnitActRecord) => void;
	/** open the form on this unit. */
	edit: (unit: UnitActRecord) => void;
	/** open the contract form on a new contract, with this unit already chosen. */
	newContract: (unit: UnitActRecord) => void;
	/** delete this unit: at once where nothing refuses it, as its policy says; the host decides. */
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
			flag: 'editUnit',
			run: host.edit
		},
		{
			// a contract is started where the reader already is: on the unit it will hold. Offered
			// whatever the unit's status, because whether it is free depends on the term the form is
			// given, which is not known until then.
			id: 'unit.newContract',
			label: (t) => t.common.actions.newContract(),
			icon: FilePlusIcon,
			group: 'primary',
			// the act makes a contract, so it is the contract's create the reader needs.
			flag: 'createContract',
			run: host.newContract
		},
		{
			// always offered: what a deletion is refused for (any contract that ever named the unit) is
			// read when it is asked, and the delete dialog says it.
			id: 'unit.delete',
			label: (t) => t.common.actions.delete(),
			icon: Trash2Icon,
			tone: 'error',
			group: 'destructive',
			flag: 'deleteUnit',
			// the record is all it removes, so it runs at once and offers undo.
			confirmation: 'none',
			run: host.confirmDelete
		}
	];
}
