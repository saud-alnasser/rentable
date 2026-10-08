import api from '$lib/api/caller';
import { declareMutation } from '$lib/mutation/ui';
import { LL } from '$lib/i18n/i18n-svelte';
import { createQuery } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

import { keys as organizationKeys, organizationChanged } from '../query';
import type { UpgradeTarget } from './host';

/**
 * THE UPGRADE'S QUERIES
 *
 * What waits for the upgrade, what one would do, and running it (effort 857, tickets 07 and 08).
 */

export const keys = {
	/**
	 * what waits, under the state's key: it is part of where the organization stands, so whatever
	 * reads the state again, a sign-in, a pull, any write to the organization, reads it again too.
	 */
	awaiting: [...organizationKeys.state, 'upgrade'],
	/** what upgrading one target would do and whom it would stop, read while its sheet is open. */
	preview: (target: UpgradeTarget) => [...organizationKeys.all, 'upgradePreview', target]
} as const;

/** what waits for the upgrade on the organization and on each workspace the reader holds. */
export function useFetchUpgradeAwaiting(enabled: () => boolean = () => true) {
	return createQuery(() => ({
		queryKey: keys.awaiting,
		queryFn: () => api.organization.upgrade.awaiting(),
		enabled: enabled()
	}));
}

/**
 * what upgrading `target` would run, and whom it would stop or make read-only, read afresh each
 * time the sheet opens on it: the machines move while nobody looks.
 */
export function useFetchUpgradePreview(target: () => UpgradeTarget | null) {
	return createQuery(() => {
		const asked = target();

		return {
			queryKey: keys.preview(asked ?? 'organization'),
			queryFn: () => api.organization.upgrade.preview({ target: asked ?? 'organization' }),
			enabled: asked !== null,
			staleTime: 0,
			gcTime: 0,
			retry: false
		};
	});
}

/**
 * run the upgrade of a target, whole or not at all (requirement 5). It reports as every write to
 * the organization does: the success named for what was upgraded, a refusal as its sentence
 * (`upgradeNeedsOwner`, `upgradeUnderWay`, `ownerNotUpdated`), and anything else as unexpected.
 * What waits and where the organization stands are read again, which takes the mark off and lets
 * every capability waiting on it run.
 */
export const useRunUpgrade = declareMutation({
	mutate: ({ target }: { target: UpgradeTarget; name: string }) =>
		api.organization.upgrade.run({ target }),
	touches: 'none',
	toast: {
		success: ({ variables }) =>
			variables.target === 'organization'
				? get(LL).organization.upgrade.upgradedOrganization()
				: get(LL).organization.upgrade.upgradedWorkspace({ workspace: variables.name }),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	invalidates: [keys.awaiting, organizationChanged]
});
