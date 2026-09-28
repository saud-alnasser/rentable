import complex, { unit } from '$lib/complex/surface';
import contract from '$lib/contract/surface';
import organization from '$lib/organization/surface';
import payment from '$lib/payment/surface';
import tenant from '$lib/tenant/surface';
import workspace from '$lib/workspace/surface';

/**
 * THE SURFACES
 *
 * every feature's surface, which is what the shell reads to draw the window: the frame mounts each
 * one's `host`. This is the one place that names them all, as `features.ts` is for the routers.
 *
 * **The order is load-bearing.** The frame mounts the hosts in this order, and a host may depend
 * on what mounted before it: the workspace's permissions come first, so every host below draws
 * off what the reader may do, and the rest keep the order they had when the frame named each one.
 * Adding a surface appends it unless it has a reason to stand earlier.
 */
export const surfaces = [
	workspace,
	tenant,
	complex,
	unit,
	contract,
	payment,
	organization
] as const;
