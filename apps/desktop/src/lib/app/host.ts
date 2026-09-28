import type { OrganizationHost } from '$lib/organization/host';
import { tauri as organization } from '$lib/organization/tauri';
import type { PlatformHost } from '$lib/platform/host';
import { tauri as platform } from '$lib/platform/tauri';
import type { PrintHost } from '$lib/print/host';
import { tauri as print } from '$lib/print/tauri';
import type { SettingsHost } from '$lib/settings/host';
import { tauri as settings } from '$lib/settings/tauri';
import type { StartupHost } from '$lib/startup/host';
import { tauri as startup } from '$lib/startup/tauri';
import type { SyncHost } from '$lib/sync/host';
import { tauri as sync } from '$lib/sync/tauri';
import type { TransferHost } from '$lib/transfer/host';
import { tauri as transfer } from '$lib/transfer/tauri';
import type { UpdateHost } from '$lib/update/host';
import { tauri as update } from '$lib/update/tauri';
import type { WorkspaceHost } from '$lib/workspace/host';
import { tauri as workspace } from '$lib/workspace/tauri';

/**
 * THE HOST
 *
 * what the API may ask of the shell it runs in, composed from the ports that declare it: the
 * platform's own part, and each feature or capability that crosses to Rust under its name. A
 * feature's port is its `host.ts` and its Tauri adapter is its `tauri.ts`; this is the one place
 * that binds them.
 *
 * **Adding a feature's port is a member here and a member below.** Nothing else names it: the
 * request context carries this type, and a router reaches its feature's member through
 * `ctx.host` as it always has.
 */
export type Host = PlatformHost & {
	organization: OrganizationHost;
	print: PrintHost;
	settings: SettingsHost;
	startup: StartupHost;
	sync: SyncHost;
	transfer: TransferHost;
	update: UpdateHost;
	workspace: WorkspaceHost;
};

/**
 * the host the running application hands every request: each port bound to its Tauri adapter.
 * `$lib/app/caller` binds it into the caller with the root router.
 */
export const host = {
	...platform,
	organization,
	print,
	settings,
	startup,
	sync,
	transfer,
	update,
	workspace
} satisfies Host;
