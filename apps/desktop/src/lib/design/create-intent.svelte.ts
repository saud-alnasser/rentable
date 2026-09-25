import { goto } from '$app/navigation';
import { page } from '$app/state';
import type { ResolvedPathname } from '$app/types';
import { hasCreateIntent } from '@rentable/design/create-intent.js';
import { untrack } from 'svelte';

/**
 * Answer `?create` on a directory's address with the concept host's create.
 *
 * The command menu asks for a new tenant, complex or contract by going to that directory with
 * `?create`, so the record is made where it will be listed. **The host consumes it, not the
 * directory**: the host owns the form, and a directory asking for it again would be a second route
 * to create written beside the first. Called once, from the host's component, which is mounted in
 * the frame and so is there whichever screen the address arrives on.
 *
 * The intent is consumed on arrival and cleared from the address, so a reload or a back navigation
 * does not reopen a form the reader has already dismissed.
 *
 * @param address the directory's address, resolved: the intent is the host's only there.
 * @param create the host's create.
 */
export function consumeCreateIntent(address: ResolvedPathname, create: () => void) {
	$effect(() => {
		if (page.url.pathname !== address || !hasCreateIntent(page.url)) {
			return;
		}

		// untracked: opening reads the host's render key to advance it, and an effect that reads
		// what it writes never settles.
		untrack(create);
		void goto(address, { replaceState: true, noScroll: true, keepFocus: true });
	});
}
