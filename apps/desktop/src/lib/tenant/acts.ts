import type { RecordAct } from '$lib/design/acts';
import type { Tenant } from '$lib/platform/database/schema';
import CopyIcon from '@lucide/svelte/icons/copy';
import FilePlusIcon from '@lucide/svelte/icons/file-plus';
import SquarePenIcon from '@lucide/svelte/icons/square-pen';
import Trash2Icon from '@lucide/svelte/icons/trash-2';

/**
 * TENANT ACTS
 *
 * Everything a person can do to one tenant, in the order every surface offers it: the card's menu
 * and its context menu, the tenant's page, and the command menu. Each of those is a projection of
 * this list (`design/acts.ts`), so none of them can offer an act another does not.
 *
 * **No duplicate.** A tenant is identified by fields that are unique to it, so a copy would open
 * the form with nothing a new tenant could keep.
 */

/** What an act is given: a tenant as any surface holds one, the directory's row or the page's read. */
export type TenantActRecord = Tenant;

/** Every tenant act, by the id the palette keys it on. */
export type TenantActId =
	'tenant.copyDetails' | 'tenant.edit' | 'tenant.newContract' | 'tenant.delete';

/**
 * What the acts ask of the tenant host. Each one opens something the host owns, and none of them
 * writes anything: the host's form and confirmation are where a tenant is changed.
 */
export type TenantHostRequests = {
	/** put the tenant's details on the clipboard. */
	copyDetails: (tenant: TenantActRecord) => void;
	/** open the form on this tenant. */
	edit: (tenant: TenantActRecord) => void;
	/** open the contract form on a new contract, with this tenant already chosen. */
	newContract: (tenant: TenantActRecord) => void;
	/** delete this tenant: at once where nothing refuses it, as its policy says; the host decides. */
	confirmDelete: (tenant: TenantActRecord) => void;
};

/** A tenant act, with the id narrowed to the ones declared here. */
export type TenantAct = RecordAct<TenantActRecord> & { id: TenantActId };

/**
 * The tenant's acts, bound to the host that carries them out: a function of the host so the list
 * can be read, and run, without the host being mounted.
 */
export function declareTenantActs(host: TenantHostRequests): TenantAct[] {
	return [
		{
			id: 'tenant.copyDetails',
			label: (t) => t.common.actions.copyDetails(),
			icon: CopyIcon,
			group: 'primary',
			run: host.copyDetails
		},
		{
			id: 'tenant.edit',
			label: (t) => t.common.actions.edit(),
			icon: SquarePenIcon,
			group: 'primary',
			run: host.edit
		},
		{
			// a contract is started where the reader already is: on the tenant it is for.
			id: 'tenant.newContract',
			label: (t) => t.common.actions.newContract(),
			icon: FilePlusIcon,
			group: 'primary',
			run: host.newContract
		},
		{
			// always offered: what a deletion is refused for (contracts held) is read when it is asked,
			// and the delete dialog says it.
			id: 'tenant.delete',
			label: (t) => t.common.actions.delete(),
			icon: Trash2Icon,
			tone: 'error',
			group: 'destructive',
			// the record is all it removes, so it runs at once and offers undo.
			confirmation: 'none',
			run: host.confirmDelete
		}
	];
}
