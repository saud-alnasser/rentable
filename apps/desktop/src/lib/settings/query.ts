import api from '$lib/api/caller';
import { browserAppearance, type AppearanceSetting } from '$lib/platform/appearance';
import { declareMutation } from '$lib/mutation';
import { keys as dashboardKeys } from '$lib/dashboard/query';
import { LL } from '$lib/i18n/i18n-svelte';
import { createQuery } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

/**
 * SETTINGS QUERIES
 *
 * This machine's settings and the writes to them. The replica's state, the updater and the
 * workspace's rename went to `sync/`, `update/` and `workspace/` in effort 840 (ticket 38), and
 * settling the earlier records' offer to `workspace/`.
 */

export const keys = {
	all: ['settings'],
	settings: ['settings', 'data']
} as const;

export function useFetchSettings() {
	return createQuery(() => ({
		queryKey: keys.settings,
		queryFn: () => api.settings.get()
	}));
}

export const useSetEndingSoonNoticeDays = declareMutation({
	mutate: ({ days }: { days: number }) => api.settings.set({ endingSoonNoticeDays: days }),
	touches: 'none',
	toast: {
		success: () => get(LL).settingsHooks.endingSoonUpdated(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	sets: ({ result }) => [{ key: keys.settings, data: result }],
	// a function, because the dashboard's prefix is the cache policy's and is read once it runs.
	invalidates: () => [
		{
			together: [
				keys.settings,
				// the prefix, so the screen is refreshed whichever period it is currently showing.
				dashboardKeys.all
			]
		}
	]
});

/**
 * Choose light, dark or the system's, drawn at once and then written.
 *
 * **Optimistic, the way the language is.** The choice is drawn before the write goes out, since a
 * reader who pressed dark and waited on a round trip to see it would press it again; a write the
 * shell refuses puts the appearance back to what it was and says so through the shared handler.
 */
export const useSetAppearance = declareMutation({
	mutate: ({ appearance }: { appearance: AppearanceSetting }) => api.settings.set({ appearance }),
	touches: 'none',
	toast: {
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	capture: ({ appearance }) => {
		const previous = browserAppearance().setting;

		browserAppearance().apply(appearance);

		return { previous };
	},
	sets: ({ result }) => [{ key: keys.settings, data: result }],
	invalidates: [keys.settings],
	failed: ({ captured }) => {
		if (captured) browserAppearance().apply(captured.previous);
	}
});
