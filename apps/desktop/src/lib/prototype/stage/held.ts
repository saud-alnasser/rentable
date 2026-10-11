import type { Host } from '$lib/app/host';

/**
 * The staged host, held for the feature adapters `./vite.js` stands in for.
 *
 * A feature's `tauri.ts` is imported by modules the staged host's own graph reaches (a state file
 * raising a toast reaches diagnostics, which reaches the platform's adapter), so an adapter that
 * imported `./host.ts` would close a cycle and read the host before it exists. It reads this
 * instead, at the call, which is always after staging booted.
 */
let held: Host | null = null;

export function hold(host: Host) {
	held = host;
}

export function heldHost(): Host {
	if (!held) throw new Error('stage: the shell was asked for before staging booted');

	return held;
}
