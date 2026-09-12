import { getContext, setContext } from 'svelte';

import type { Startup } from './startup';

/**
 * The startup unit, reachable from the two routes that stand beside the wall.
 *
 * The shell creates the unit and every surface it draws itself is handed what it needs as props.
 * The first run and the join screen are routes rather than surfaces, because they are addresses
 * the wall lets through, and a route cannot take a prop from the layout that mounted it. What
 * both do ends the same way: the machine's standing changed under the shell, and the unit has to
 * read it again and go on in. Context is how a route reaches the unit, and it is the only thing
 * shared this way.
 */
const STARTUP = Symbol('startup');

export function provideStartup(startup: Startup) {
	setContext(STARTUP, startup);
}

export function useStartup(): Startup {
	const startup = getContext<Startup | undefined>(STARTUP);

	if (!startup) {
		throw new Error('a route asked for the startup unit outside the shell that provides it');
	}

	return startup;
}
