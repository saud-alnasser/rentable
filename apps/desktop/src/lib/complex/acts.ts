import type { RecordAct } from '$lib/design/acts';
import type { Complex } from '$lib/platform/database/schema';
import CopyIcon from '@lucide/svelte/icons/copy';
import SquarePenIcon from '@lucide/svelte/icons/square-pen';
import Trash2Icon from '@lucide/svelte/icons/trash-2';

/**
 * COMPLEX ACTS
 *
 * Everything a person can do to one complex, in the order every surface offers it: the card's menu
 * and its context menu, the complex's page, and the command menu. Each of those is a projection of
 * this list (`design/acts.ts`), so none of them can offer an act another does not.
 *
 * **No duplicate.** A complex is its name and its location, both unique to it, so the copy would
 * carry nothing. A unit's acts are the unit's own, in `complex/unit/acts.ts`.
 */

/** What an act is given: a complex as any surface holds one, the directory's row or the page's read. */
export type ComplexActRecord = Complex;

/** Every complex act, by the id the palette keys it on. */
export type ComplexActId = 'complex.copyDetails' | 'complex.edit' | 'complex.delete';

/**
 * What the acts ask of the complex host. Each one opens something the host owns, and none of them
 * writes anything: the host's form and confirmation are where a complex is changed.
 */
export type ComplexHostRequests = {
	/** put the complex's details on the clipboard. */
	copyDetails: (complex: ComplexActRecord) => void;
	/** open the form on this complex. */
	edit: (complex: ComplexActRecord) => void;
	/** ask before deleting this complex. */
	confirmDelete: (complex: ComplexActRecord) => void;
};

/** A complex act, with the id narrowed to the ones declared here. */
export type ComplexAct = RecordAct<ComplexActRecord> & { id: ComplexActId };

/**
 * The complex's acts, bound to the host that carries them out: a function of the host so the list
 * can be read, and run, without the host being mounted.
 */
export function declareComplexActs(host: ComplexHostRequests): ComplexAct[] {
	return [
		{
			id: 'complex.copyDetails',
			label: (t) => t.common.actions.copyDetails(),
			icon: CopyIcon,
			group: 'primary',
			run: host.copyDetails
		},
		{
			id: 'complex.edit',
			label: (t) => t.common.actions.edit(),
			icon: SquarePenIcon,
			group: 'primary',
			run: host.edit
		},
		{
			// always offered: what a deletion is refused for (units held) is read when it is asked, and
			// the confirmation says it.
			id: 'complex.delete',
			label: (t) => t.common.actions.delete(),
			icon: Trash2Icon,
			tone: 'error',
			group: 'destructive',
			run: host.confirmDelete
		}
	];
}
