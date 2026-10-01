/**
 * Whether the reader asked for less motion, read at the moment it is asked.
 *
 * **For a decision made once, at the moment of a change**: whether to ask for a view transition at
 * all, which the way-in surface and `crossWayIn` both decide this way. Nothing draws from the
 * answer, so it needs no subscription.
 *
 * **Not `prefersReducedMotion` from `svelte/motion`** for that: it is a `MediaQuery` built when
 * its module loads, and it calls `matchMedia` there, which jsdom does not have. Every screen of the
 * way in draws through the way-in surface, so importing it there would break each of their
 * component tests before the first assertion. Where there is no `matchMedia` at all, the answer is
 * no, and the caller's own feature detection decides the rest. `prefersReducedMotion` stays the
 * reader for motion that follows the setting while it runs ([[rules/frontend]], *Motion*).
 */
export function reducesMotion(): boolean {
	return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
