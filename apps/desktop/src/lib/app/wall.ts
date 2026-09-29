import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import { useFetchOrganizationState } from '$lib/organization/ui';
import { addressAfterSignOut, useStartup } from '$lib/startup';

export { THE_WAY_IN, useStartup } from '$lib/startup';

/**
 * BESIDE THE WALL
 *
 * what the three addresses that open signed out hand the feature they draw: the first run, the
 * join screen and the settings. Each ends with the startup unit reading where the machine stands
 * again, and the unit is startup's while the screens are the organization's and settings'. Both of
 * those are features startup already reaches, so neither can reach startup back, and a route
 * imports only components and this root; so the route takes what the screen needs from here and
 * hands it over as props (effort 840, ticket 34).
 */

/**
 * whether anybody is signed in on this machine, which decides the settings sections offered.
 * Read off the organization's own state, as the settings address always has.
 */
export function useSignedIn(): { readonly current: boolean } {
	const stateQuery = useFetchOrganizationState();

	return {
		get current() {
			return (stateQuery.data?.session ?? null) !== null;
		}
	};
}

/**
 * a settings section let go of the organization: the disconnect and the delete each end here once
 * the shell has forgotten it, and the startup unit reads where the machine stands and raises the
 * first screen.
 *
 * The wall is drawn in place of the route, and `/settings` opens signed out, so a machine left
 * standing there after it let go of its organization would show the settings of nothing with no
 * wall in front of them. The sign-out leaves the same way (`$lib/startup/component/root.svelte`).
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
