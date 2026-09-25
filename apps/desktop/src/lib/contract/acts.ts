import type { SerializedContract } from '$lib/contract/serialize';
import {
	canManuallyTerminateContractStatus,
	canUnterminateContractStatus
} from '$lib/contract/contract';
import type { RecordAct } from '$lib/design/acts';
import BanIcon from '@lucide/svelte/icons/ban';
import CalendarPlusIcon from '@lucide/svelte/icons/calendar-plus';
import CopyIcon from '@lucide/svelte/icons/copy';
import FilesIcon from '@lucide/svelte/icons/files';
import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
import SquarePenIcon from '@lucide/svelte/icons/square-pen';
import Trash2Icon from '@lucide/svelte/icons/trash-2';

/**
 * CONTRACT ACTS
 *
 * Everything a person can do to one contract, in the order every surface offers it: the card's
 * menu and its context menu, the contract's page, and the command menu. Each of those is a
 * projection of this list (`design/acts.ts`), so none of them can offer an act another does not,
 * or offer it under another name.
 *
 * Which acts a contract admits is the contract's own rule, called from `contract.ts` rather than
 * restated: a card and a page cannot come to disagree about what may be done to one.
 */

/** What an act is given: a contract as any surface holds one, its tenant's name where it has it. */
export type ContractActRecord = SerializedContract;

/** Every contract act, by the id the palette keys it on. */
export type ContractActId =
	| 'contract.copyDetails'
	| 'contract.duplicate'
	| 'contract.renew'
	| 'contract.edit'
	| 'contract.terminate'
	| 'contract.restore'
	| 'contract.delete';

/** A confirmation an act asks for before anything is written. */
export type ContractConfirmation = 'delete' | 'terminate' | 'restore';

/**
 * What the acts ask of the contract host. Each one opens something the host owns, and none of them
 * writes anything: the host's forms and confirmations are where a contract is changed.
 */
export type ContractHostRequests = {
	/** put the contract's details on the clipboard. */
	copyDetails: (contract: ContractActRecord) => void;
	/** open the form on a new contract that starts from this one. */
	duplicate: (contract: ContractActRecord) => void;
	/** open the form on the successor to this contract. */
	renew: (contract: ContractActRecord) => void;
	/** open the form on this contract. */
	edit: (contract: ContractActRecord) => void;
	/** ask before doing something the reader should see coming. */
	confirm: (kind: ContractConfirmation, contract: ContractActRecord) => void;
};

/** A contract act, with the id narrowed to the ones declared here. */
export type ContractAct = RecordAct<ContractActRecord> & { id: ContractActId };

/**
 * The contract's acts, bound to the host that carries them out.
 *
 * A function of the host rather than a constant beside it so that the list can be read, and run,
 * without the host being mounted: the host binds it once, and a test binds it to a stand-in.
 */
export function declareContractActs(host: ContractHostRequests): ContractAct[] {
	return [
		{
			id: 'contract.copyDetails',
			label: (t) => t.common.actions.copyDetails(),
			icon: CopyIcon,
			group: 'primary',
			run: host.copyDetails
		},
		{
			// a duplicate copies the term; a renewal continues it. Both produce a new contract, which
			// is why they sit together.
			id: 'contract.duplicate',
			label: (t) => t.common.actions.duplicate(),
			icon: FilesIcon,
			group: 'primary',
			run: host.duplicate
		},
		{
			id: 'contract.renew',
			label: (t) => t.common.actions.renew(),
			icon: CalendarPlusIcon,
			group: 'primary',
			run: host.renew
		},
		{
			id: 'contract.edit',
			label: (t) => t.common.actions.edit(),
			icon: SquarePenIcon,
			group: 'primary',
			// a terminated contract is not edited; it is restored first (`ensureContractIsNotTerminated`).
			appliesTo: (contract) => contract.status !== 'terminated',
			run: host.edit
		},
		{
			id: 'contract.terminate',
			label: (t) => t.common.actions.terminate(),
			icon: BanIcon,
			tone: 'error',
			group: 'lifecycle',
			appliesTo: (contract) => canManuallyTerminateContractStatus(contract.status),
			run: (contract) => host.confirm('terminate', contract)
		},
		{
			// restoring puts a contract back rather than taking it away, so it rests neutral beside
			// the two that do not.
			id: 'contract.restore',
			label: (t) => t.common.actions.unterminate(),
			icon: RotateCcwIcon,
			group: 'lifecycle',
			appliesTo: (contract) => canUnterminateContractStatus(contract.status),
			run: (contract) => host.confirm('restore', contract)
		},
		{
			// always offered: what a deletion is refused for (units held, payments made) is read when
			// it is asked, and the delete dialog says it.
			id: 'contract.delete',
			label: (t) => t.common.actions.delete(),
			icon: Trash2Icon,
			tone: 'error',
			group: 'destructive',
			// the record is all it removes, so it runs at once and offers undo.
			confirmation: 'none',
			run: (contract) => host.confirm('delete', contract)
		}
	];
}
