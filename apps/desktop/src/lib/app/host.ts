import type { OrganizationHost } from '$lib/organization/host';
import { tauri as organization } from '$lib/organization/tauri';
import type { PlatformHost } from '$lib/platform/host';
import { tauri as platform } from '$lib/platform/tauri';

/**
 * THE HOST
 *
 * what the API may ask of the shell it runs in, composed from the ports that declare it: the
 * platform's own part, and each feature that crosses to Rust under its name. A feature's port is
 * its `host.ts` and its Tauri adapter is its `tauri.ts`; this is the one place that binds them.
 *
 * **Adding a feature's port is a member here and a member below.** Nothing else names it: the
 * request context carries this type, and a router reaches its feature's member through
 * `ctx.host` as it always has.
 */
export type Host = PlatformHost & {
	organization: OrganizationHost;
};

/**
 * the host the running application hands every request: each port bound to its Tauri adapter.
 * `$lib/app/caller` binds it into the caller with the root router.
 */
export const host = {
	...platform,
	organization
} satisfies Host;
