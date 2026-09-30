import complex, { unit } from '$lib/complex/feature';
import contract from '$lib/contract/feature';
import dashboard from '$lib/dashboard/feature';
import history from '$lib/history/feature';
import organization from '$lib/organization/feature';
import payment from '$lib/payment/feature';
import settings from '$lib/settings/feature';
import startup from '$lib/startup/feature';
import sync from '$lib/sync/feature';
import tenant from '$lib/tenant/feature';
import transfer from '$lib/transfer/feature';
import update from '$lib/update/feature';
import workspace from '$lib/workspace/feature';

/**
 * THE FEATURES
 *
 * every feature and capability the composition root reads, each router mounted under its
 * declared name. This is the
 * one place that names them all: adding one is a line here, and removing one is taking it out.
 *
 * **Every router is mounted here, and at one depth.** No feature's router mounts another's, so a
 * procedure's path is always its feature's name and then the procedure (effort 840, criterion 3).
 * The unit declares no router of its own, and is listed for what it does declare.
 *
 * **The order of the record features is the workspace invalidation's.** `$lib/app/cache` builds
 * the cache policy from this list, and the prefixes are invalidated in the order their features
 * stand here.
 */
const declared = [
	contract,
	payment,
	tenant,
	complex,
	unit,
	dashboard,
	history,
	workspace,
	organization,
	settings,
	sync,
	update,
	startup
] as const;

/**
 * **A capability that reads what features declare is handed the list here**, and listed after it:
 * the transfer builds its router from every sheet the features above declare, since it may not
 * import one of them (plan, *How a capability is configured*).
 */
export const features = [...declared, transfer(declared)] as const;
