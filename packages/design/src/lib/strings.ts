import { getContext } from 'svelte';

/**
 * The contract a consumer satisfies once, at its root, so that everything this package renders
 * can be read.
 *
 * **The failure this exists to prevent has no error attached to it.** A component that lost its
 * translation read still compiles and still renders; what it produces is English words and a
 * left-to-right layout on a screen somebody is reading right to left, and nothing anywhere
 * reports it. So the words and the reading direction come in from outside, and a consumer that
 * supplies neither does not build.
 *
 * **The direction rides in the same object as the words, deliberately.** It is ambient in the
 * same way they are, twelve of the families still to cross set it on the element they render
 * across nineteen files, and threading it through every call site would buy the same compile
 * error at several hundred times the cost.
 *
 * The type is the first enforcement and not the only one. A consumer whose object is missing a
 * key fails `svelte-check` at the place it renders the provider, and the message names the key;
 * what that cannot see is a consumer which renders no provider at all, and `useDesignContract`
 * below is what catches that.
 */
export type DesignStrings = {
	/** the accessible name of a spinner, which is a `role="status"` with nothing else to read. */
	loading: string;
};

/** which way the reader reads, supplied rather than derived because the package has no locale. */
export type DesignDirection = 'ltr' | 'rtl';

/**
 * What a packaged component reads. Both members are getters over the provider's props, so a
 * consumer that switches language mid-session moves every packaged component with it.
 */
export type DesignContract = {
	readonly strings: DesignStrings;
	readonly direction: DesignDirection;
};

/**
 * The key the provider writes under.
 *
 * A symbol rather than a string because context keys are a flat namespace shared with every
 * library a consumer happens to render inside, and a string collides silently.
 */
export const DESIGN_CONTRACT = Symbol('rentable.design.contract');

/**
 * Read the contract from the nearest provider.
 *
 * **It throws rather than falling back.** A fallback is the silently English render this whole
 * mechanism exists to make impossible, and type-checking cannot see a missing provider: the
 * consumer's object is only checked where it renders one, so an application that renders none is
 * type-correct and wordless. The throw is the only thing left to catch it.
 */
export function useDesignContract(): DesignContract {
	const contract = getContext<DesignContract | undefined>(DESIGN_CONTRACT);

	if (!contract) {
		throw new Error(
			'a @rentable/design component rendered outside DesignProvider. render the provider once at the root of the application, with the strings and the reading direction for the reader.'
		);
	}

	return contract;
}

export { default as DesignProvider } from './strings-provider.svelte';
