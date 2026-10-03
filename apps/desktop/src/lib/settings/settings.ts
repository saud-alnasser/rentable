import type { QueryKey } from '@tanstack/svelte-query';

/**
 * What the settings area needs of the features depending on it, in the window, contributed by
 * them (`$lib/feature/feature`, under *What a feature contributes*).
 *
 * *The dashboard's key was imported here until effort 840, and it put the settings on a cycle
 * through the dashboard, the contracts and the organization that contributes to the settings.*
 */
export type SettingsSurfaceContributions = {
	/**
	 * the keys of everything that reads the rank the ending-soon figure decides, refreshed with the
	 * settings when the figure changes: the dashboard's, and the contracts list's filter, a
	 * contract's page and its schedule. Read when a change lands, since the prefixes are the cache
	 * policy's.
	 *
	 * *One key, the dashboard's, until effort 846 (requirement 6): the contracts filter, a
	 * contract's page and the schedule went on showing the rank the old figure gave.*
	 */
	endingSoonReaders: () => readonly QueryKey[];
};
