import complex from '$lib/complex/feature';
import contract from '$lib/contract/feature';
import dashboard from '$lib/dashboard/feature';
import history from '$lib/history/feature';
import organization from '$lib/organization/feature';
import payment from '$lib/payment/feature';
import settings from '$lib/settings/feature';
import startup from '$lib/startup/feature';
import sync from '$lib/sync/feature';
import tenant from '$lib/tenant/feature';
import update from '$lib/update/feature';
import workspace from '$lib/workspace/feature';

/**
 * THE FEATURES
 *
 * every feature and capability the root router mounts, each under its declared name. This is the
 * one place that names them all: adding one is a line here, and removing one is taking it out.
 *
 * **Every router is mounted here, and at one depth.** No feature's router mounts another's, so a
 * procedure's path is always its feature's name and then the procedure (effort 840, criterion 3).
 */
export const features = [
	tenant,
	complex,
	contract,
	payment,
	dashboard,
	history,
	workspace,
	organization,
	settings,
	sync,
	update,
	startup
] as const;
