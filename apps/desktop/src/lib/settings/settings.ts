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
	 * the key of what is ranked by the ending-soon figure, refreshed with the settings when the
	 * figure changes: the dashboard's, its prefix, so whichever period it shows is refreshed. Read
	 * when a change lands, since the prefix is the cache policy's.
	 */
	endingSoonReaders: () => QueryKey;
};
