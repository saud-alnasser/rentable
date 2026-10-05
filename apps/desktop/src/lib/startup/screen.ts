import type { StartupSnapshot } from './snapshot';

/**
 * WHAT THE FRAME DRAWS INSIDE ITSELF
 *
 * Startup's other decision about the frame, and the counterpart of `./gate`: that one answers what the window
 * draws before a locale exists, this one answers what goes inside the frame once one does. Both
 * are here rather than in `./component/root.svelte`, which draws them, for the reason that
 * component states in its own comment: a runes file cannot be imported by a `node:test` at all,
 * so a decision left inline in one is a decision nothing can drive.
 *
 * **Startup's rather than the shell's, though the frame is what it fills**, because what it reads
 * is where startup has got to, and startup's root is what reads it (effort 840, ticket 34). The
 * addresses beside the wall reach the way in and the sign-out's landing through `./ui`.
 *
 * **It is the address that made this worth extracting.** Until 2026-08-21 the answer was the
 * startup state alone, and a chain of four branches in the route said it. Requirement 1 of
 * `[[efforts/settings-and-the-workspace-finish-what-they-offer]]` adds a second axis: the sign-in
 * card is drawn over every address, and the account menu offers a settings row that changes the
 * address and leaves the same card on screen. That row has been offered since #646 and has never
 * worked, because the requirement's API half landed and its layout half did not.
 */

/** the screen startup has the frame draw in place of its children, or `route` for the children. */
export type StartupScreen =
	'loading' | 'switching' | 'sign-in' | 'no-workspace' | 'recovery' | 'error' | 'route';

/**
 * Where an organization is created: the first run's own address.
 *
 * Reached from the sign-in card, and it opens with nobody signed in because it is how a person
 * comes to be somebody here: an organization has no members until the walk on this address has
 * made its owner. Every procedure behind it is public and reaches no database, which is the test
 * `/settings` passed to be the first.
 */
export const THE_FIRST_RUN = '/organization/new';

/** the connect screen: the organization's link, read and recorded on this machine. */
export const THE_JOIN = '/organization/join';

/**
 * The addresses that draw with nobody signed in.
 *
 * **One, and it stays one**, said 2026-08-21, and it is two since 2026-09-11 for the reason the
 * constant above gives; the first run is the one address that cannot be behind the wall it
 * exists to get a person past. What follows is otherwise unchanged. Criterion 7 of [[efforts/capabilities-only-one-surface-got]] settled
 * that the four destinations, the search, the workspace control and the shortcut sheet go on
 * refusing, and this does not reopen it: those refuse in the frame and the rail, on the shell
 * state, and none of them consults an address. What is different about settings is that every
 * procedure behind it is already public and building the request context signed out reaches no
 * database, so the page works rather than merely rendering.
 *
 * The language control is the reason it is this page and not another: it is the setting somebody
 * is most likely to want before they can read anything else on the way in.
 */
const OPENS_SIGNED_OUT: readonly string[] = ['/settings', THE_FIRST_RUN, THE_JOIN];

/**
 * The way in's own address: home, which the sign-in card is drawn over.
 *
 * The sign-in card is a shell surface rather than a route, so there is no address that *is* the
 * card, and the only way to reach one is to stand somewhere the card draws over. Home is that
 * somewhere; any address `OPENS_SIGNED_OUT` does not hold would serve. A sign-out and a machine
 * letting go of its organization land here from the three addresses that open signed out, and the
 * settings opened signed out go back to it.
 */
export const THE_WAY_IN = '/';

/**
 * Which way a route change between two screens of the way in runs, or `null` where it is not one.
 *
 * **The welcome or the wall and a walk are two addresses and one surface changing step** (effort
 * 843, requirement 4). The welcome and the wall are the sign-in card, drawn over every address but
 * the ones that open signed out, so a move from any address the card covers into the first run or
 * the join runs forward, and the move back out to one runs back; the design package's `crossWayIn`
 * draws it. Between two addresses that open signed out, `/settings` among them, it is not a step
 * of the way in and takes no transition of its own.
 */
export function wayInCrossing(from: string, to: string): 'forward' | 'back' | null {
	const walks = [THE_FIRST_RUN, THE_JOIN];

	if (walks.includes(to) && !opensSignedOut(from)) return 'forward';
	if (walks.includes(from) && !opensSignedOut(to)) return 'back';

	return null;
}

/**
 * Which way a navigation runs across the way in where startup has got to, or `null` for none.
 *
 * **Only on the way in, and only while it waits on the reader.** The same two addresses with
 * somebody in are not a step of it, which is `shellFor`'s answer. **A navigation made under
 * `loading` is the arrival, and takes no crossing** (effort 843, ticket 14): the join's `arrive`,
 * the first run's `prepare` and its connect to an existing organization each move the address to
 * the way in under the loading surface, and since ticket 08 gave that load the way-in frame, each
 * ran a back crossing over the loading screen, as if the reader had left the walk for the welcome.
 * Nothing on screen changes with the address there: the loading surface is drawn over it. **Nor
 * does the no-workspace screen**, which is drawn over every address: a link the system hands over
 * there moves the address to the join under the same screen (review round two).
 */
export function navigationCrossing(
	snapshot: Pick<StartupSnapshot, 'state' | 'switching'>,
	from: string,
	to: string
): 'forward' | 'back' | null {
	if (shellFor(snapshot) !== 'way-in') return null;
	if (snapshot.state === 'loading' || snapshot.state === 'no-workspace') return null;

	return wayInCrossing(from, to);
}

/**
 * Whether this address draws while the shell is waiting for somebody to sign in.
 *
 * Exact rather than prefixed: nothing nests under either address, and a prefix would silently
 * admit anything that ever did.
 */
export function opensSignedOut(pathname: string) {
	return OPENS_SIGNED_OUT.includes(pathname);
}

/**
 * Where a sign-out has to land, or `null` where the card will draw over the address already.
 *
 * **Signing out puts the wall up, and an address that opens signed out never gets one** (effort
 * 826, requirement 11 as corrected on 2026-09-15). Every other address is covered by the card the
 * moment the standing changes, so nothing needs to move and the reader keeps their place; the
 * three addresses `OPENS_SIGNED_OUT` holds go on drawing, and a person who signs out from
 * `/settings` is left reading the settings of a machine nobody is signed in on. The human met
 * exactly that on their first run of the build. So the sign-out leaves those three, and the one
 * place to leave for is the way in's own address.
 */
export function addressAfterSignOut(pathname: string): typeof THE_WAY_IN | null {
	return opensSignedOut(pathname) ? THE_WAY_IN : null;
}

/** How much of the shell the frame draws: the titlebar alone, around the way in, or the rail. */
export type ShellChrome = 'bare' | 'way-in' | 'full';

/**
 * How much of the shell a state draws.
 *
 * **The rail is drawn only once a person is in** (effort 843, requirement 7, decided by the human
 * on 2026-09-30). Signing in, a machine with no workspace yet, and a load with nobody in are the
 * way in, and get the titlebar and its window controls around it and nothing else: a control that
 * does not apply is not drawn. Failing to start and recovering from an update are an application
 * that is not running, and get the bare frame.
 *
 * **Loading is two states and the table reads which.** A switch between workspaces keeps the
 * rail, since only the page loads (requirement 12). Every other load is the way in's last step
 * (requirement 9): a launch, and the load after a first run, a join or a sign-in, draw the way-in
 * frame, and the rail arrives with the application, once and at the moment it is true. *Ticket 03
 * kept the rail for a load with a person in once it had latched; ticket 08 gave that load to the
 * way in, as the plan's Architecture says.*
 *
 * It was a chain of branches in `./component/root.svelte`, with a fourth answer that drew the rail
 * signed out, until effort 843's ticket 03 moved it here for a `node:test` to drive.
 */
export function shellFor(snapshot: Pick<StartupSnapshot, 'state' | 'switching'>): ShellChrome {
	switch (snapshot.state) {
		case 'ready':
			return 'full';
		case 'sign-in':
		case 'no-workspace':
			return 'way-in';
		case 'loading':
			return snapshot.switching === null ? 'way-in' : 'full';
		case 'recovery':
		case 'error':
			return 'bare';
	}
}

/**
 * One crumb of a page's trail, as far as a switch reads it: a place the trail names, or the record
 * the page is (and the record it is reached through).
 *
 * **Handed in rather than imported.** The trail is the shell's (`shell/navigation`), built from
 * every feature's pages, and startup is a feature: it reads no page table and imports nothing
 * above it, so the shell's window hands its trail in with the choice, and the root passes it here.
 */
export type SwitchCrumb<Place extends string = string> =
	{ kind: 'place'; route: Place } | { kind: 'parent' | 'record'; route: string };

/**
 * Where a switch between workspaces moves the address before it opens the other one, or `null`
 * where the page stays where it is.
 *
 * **A place stays, and a record goes to its concept's directory** (effort 843, requirement 12).
 * A directory, the dashboard and the settings area exist in every workspace, so the other
 * workspace's copy of the same page is where the reader lands. A record does not: the one on
 * screen belongs to the workspace being left, and its page in the other would be a not-found. So a
 * record's page goes to the last place its trail names, the directory it is listed in, and to home
 * where the trail names none.
 *
 * Read off the trail rather than the address, for the reason the trail gives: a path segment is not
 * a place, and a unit or a payment is listed under a directory whose own name is not in its route.
 * `null` is SvelteKit's route id for an address no route matched, which stays as it is.
 */
export function addressAfterSwitch<Place extends string>(
	routeId: string | null,
	trailOf: (routeId: string) => readonly SwitchCrumb<Place>[]
): Place | typeof THE_WAY_IN | null {
	if (!routeId) {
		return null;
	}

	const trail = trailOf(routeId);

	if (trail.at(-1)?.kind !== 'record') {
		return null;
	}

	const directory = trail.findLast(
		(crumb): crumb is Extract<SwitchCrumb<Place>, { kind: 'place' }> => crumb.kind === 'place'
	);

	return directory?.route ?? THE_WAY_IN;
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
export function startupScreen(snapshot: StartupSnapshot, pathname: string): StartupScreen {
	switch (snapshot.state) {
		// a switch's loading is drawn inside the page, with the rail up, and a launch's is the
		// application starting (effort 843, requirement 12).
		case 'loading':
			return snapshot.switching === null ? 'loading' : 'switching';
		case 'sign-in':
			return opensSignedOut(pathname) ? 'route' : 'sign-in';
		// over every address but the two walks: a person is in, and there is no workspace for any
		// address to draw from. The first run and the join are how its switcher adds an
		// organization (effort 851, requirement 7), and the screen signs out as it moves there,
		// since adding happens signed out; neither reads a workspace.
		case 'no-workspace':
			return pathname === THE_FIRST_RUN || pathname === THE_JOIN ? 'route' : 'no-workspace';
		case 'recovery':
			return snapshot.recovery ? 'recovery' : 'route';
		case 'error':
			return 'error';
		case 'ready':
			return 'route';
	}
}
