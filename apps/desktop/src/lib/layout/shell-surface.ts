import type { StartupSnapshot } from './startup';

/**
 * WHAT THE FRAME DRAWS INSIDE ITSELF
 *
 * The shell's other decision, and the neighbour of `layout/startup-surface.ts`: that one answers
 * what the window draws before a locale exists, this one answers what goes inside the frame once
 * one does. Both are here rather than in the route for the same reason, which the route states in
 * its own comment: a runes file cannot be imported by a `node:test` at all, so a decision left
 * inline in one is a decision nothing can drive.
 *
 * **It is the address that made this worth extracting.** Until 2026-08-21 the answer was the
 * startup state alone, and a chain of four branches in the route said it. Requirement 1 of
 * `[[efforts/settings-and-the-workspace-finish-what-they-offer]]` adds a second axis: the sign-in
 * card is drawn over every address, and the account menu offers a settings row that changes the
 * address and leaves the same card on screen. That row has been offered since #646 and has never
 * worked, because the requirement's API half landed and its layout half did not.
 */

/** what the frame draws in place of its children, or `route` for the children themselves. */
export type ShellSurface = 'loading' | 'sign-in' | 'recovery' | 'error' | 'route';

/**
 * The addresses that draw with nobody signed in.
 *
 * **One, and it stays one.** Criterion 7 of [[efforts/capabilities-only-one-surface-got]] settled
 * that the four destinations, the search, the workspace control and the shortcut sheet go on
 * refusing, and this does not reopen it: those refuse in the frame and the rail, on the shell
 * state, and none of them consults an address. What is different about settings is that every
 * procedure behind it is already public and building the request context signed out reaches no
 * database, so the page works rather than merely rendering.
 *
 * The language control is the reason it is this page and not another: it is the setting somebody
 * is most likely to want before they can read anything else on the way in.
 */
const OPENS_SIGNED_OUT: readonly string[] = ['/settings'];

/**
 * Whether this address draws while the shell is waiting for somebody to sign in.
 *
 * Exact rather than prefixed: nothing nests under `/settings`, and a prefix would silently admit
 * anything that ever did.
 */
export function opensSignedOut(pathname: string) {
	return OPENS_SIGNED_OUT.includes(pathname);
}

/**
 * What the frame has to draw, given where the application has got to and where the reader is.
 *
 * **Only the sign-in card reads the address**, and that is the whole of the change. A route
 * drawing during `loading` would be a route drawn before anybody has signed in, which is the
 * failure the risk section of the spec names; a route drawing over a failed startup would be a
 * page with no data behind it. Those states are the application not running, and an address
 * cannot make one running.
 *
 * `recovery` without a recovery to describe falls through to the children, which is what the
 * route did before this module existed. It is preserved rather than corrected here: nothing in
 * this ticket is about that state, and changing it would be a second change hiding inside a
 * refactor.
 */
export function shellSurface(snapshot: StartupSnapshot, pathname: string): ShellSurface {
	switch (snapshot.state) {
		case 'loading':
			return 'loading';
		case 'sign-in':
			return opensSignedOut(pathname) ? 'route' : 'sign-in';
		case 'recovery':
			return snapshot.recovery ? 'recovery' : 'route';
		case 'error':
			return 'error';
		case 'ready':
			return 'route';
	}
}
