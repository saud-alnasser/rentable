import { MediaQuery } from 'svelte/reactivity';

const SHELL_BREAKPOINT_PROPERTY = '--breakpoint-shell';

/**
 * Build the media query matching every window narrower than the shell's breakpoint.
 * `@rentable/design/tokens.css` declares that breakpoint and says why it is declared there.
 *
 * The value keeps its declared unit rather than being converted to pixels, which would put the
 * root font size in a second place. The outer parentheses are supplied here rather than left to
 * `MediaQuery`, which adds them only to a query containing none — `calc(…)` already contains a
 * pair, so the query would reach `matchMedia` unwrapped, and an invalid media query does not
 * throw. It simply never matches.
 *
 * @param declaration the breakpoint as declared, with its unit.
 * @throws when the declaration is empty, rather than returning a query that cannot match — a
 * query that never matches hides the fault at exactly the widths it was meant to decide.
 */
export function toNarrowerThanShellQuery(declaration: string) {
	const breakpoint = declaration.trim();

	if (!breakpoint) {
		throw new Error(
			`${SHELL_BREAKPOINT_PROPERTY} is absent from the stylesheet, so the shell cannot tell which navigation to present. It is declared with '@theme static' precisely so unused-value elimination cannot drop it.`
		);
	}

	return `(max-width: calc(${breakpoint} - 1px))`;
}

/**
 * Whether the window is narrower than the shell's breakpoint.
 *
 * The breakpoint is not a constructor parameter: a caller passing its own would be a second
 * statement of the one number this reads from the stylesheet, which is the drift being removed.
 */
export class IsBelowShellBreakpoint extends MediaQuery {
	constructor() {
		super(
			toNarrowerThanShellQuery(
				getComputedStyle(document.documentElement).getPropertyValue(SHELL_BREAKPOINT_PROPERTY)
			)
		);
	}
}
