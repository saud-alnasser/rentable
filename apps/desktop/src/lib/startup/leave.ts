import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';

import { useStartup } from './context';
import { addressAfterSignOut } from './screen';

/**
 * a settings section let go of the organization: the disconnect and the delete each end here once
 * the shell has forgotten it, and the startup unit reads where the machine stands and raises the
 * first screen.
 *
 * The wall is drawn in place of the route, and `/settings` opens signed out, so a machine left
 * standing there after it let go of its organization would show the settings of nothing with no
 * wall in front of them. The sign-out leaves the same way (`./component/root.svelte`).
 *
 * *It sat in `$lib/app/wall` until effort 840's ticket 69 gave it to startup, whose unit it
 * drives; the settings address hands it to the page as a prop.*
 */
export function useLeaveForTheWall(): () => Promise<void> {
	const startup = useStartup();

	return async () => {
		const destination = addressAfterSignOut(page.url.pathname);

		if (destination) {
			await goto(resolve(destination));
		}

		void startup.standingChanged();
	};
}
