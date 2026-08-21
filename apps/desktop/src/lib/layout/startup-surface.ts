import type { StartupSnapshot } from './startup';

/**
 * THE STARTUP SURFACE DRAWN BEFORE A LOCALE IS
 *
 * Nothing this application draws can be read until a dictionary is loaded, so the whole tree sits
 * behind one gate. Startup sets that gate partway through its first stage, after the settings read
 * and after the reader's own locale loads, and either of those can throw: a settings file that
 * will not parse, a missing locale chunk in a bad build, a host that refuses the call.
 *
 * **A failure there used to show an empty window that had been deliberately made visible.** The
 * state went to `error`, the window was shown, and the route rendered nothing at all, so there was
 * nothing to press and no way back but quitting. That is the exact failure requirement 8 exists to
 * remove, reached by a different road.
 *
 * This is the one decision that gate now makes, kept out of the route so it can be driven without
 * a window.
 */

/** what the window draws while nothing can be read. */
export type PreLocaleSurface =
	/**
	 * a startup that stopped, said in whatever way needs no dictionary.
	 *
	 * Drawn while it is being retried as well as while it is stopped, because a reader who pressed
	 * the retry has not been given a reason to think the screen went away.
	 */
	| 'failure'
	/**
	 * nothing, which is the honest answer while the application is still starting.
	 *
	 * Criterion 16 already documents this stretch: the first frame is either the loading screen or
	 * a blank one, and a blank one waiting on a dictionary is not a state anybody is stuck in.
	 */
	| 'nothing';

/**
 * Whether the window has something to say before it can say anything in the reader's language.
 *
 * **Only a failure earns a surface here.** Loading and signing in are on their way to a locale;
 * a startup that threw is not, and a reader looking at it has no way forward that does not involve
 * quitting the application.
 */
export function startupSurfaceBeforeLocale(snapshot: StartupSnapshot): PreLocaleSurface {
	if (snapshot.isI18nReady) {
		return 'nothing';
	}

	// the second half is the retry. `start` sets `loading` and clears the error, so a failure that
	// stayed on screen only while `state` said `error` would take itself off the moment the reader
	// pressed the one control it offers, and put the blank window back.
	return snapshot.state === 'error' || snapshot.hasFailedUnreadable ? 'failure' : 'nothing';
}
