import { permits, type Administration } from '@rentable/workspace-permission';

/**
 * WHAT A GATED SUBTREE DRAWS
 *
 * **What a member who may not act sees is the caller's choice, and there is no default**, which
 * is requirement 4: some controls should not appear, and some are best shown as unavailable. The
 * rule for choosing is the spec's and not this module's — a control whose absence leaves a
 * surface that still reads as complete is absent; one whose absence would leave a row describing
 * an act that is not there stays and is unavailable.
 *
 * Kept out of `permitted.svelte` for the reason `sync-status.ts` and
 * `settings/update-announcement.ts` are: a runes file cannot be imported by the test harness at
 * all, so a decision left inline in one is a decision nothing can drive. No component in this
 * repository is tested by rendering it.
 */
export type Otherwise = 'absent' | 'unavailable';

/** which of the three things a gate draws. */
export type PermittedBranch = 'children' | 'unavailable' | 'nothing';

/**
 * Whether this member holds **every** act named.
 *
 * **Every, not any.** A subtree gated on two acts is a subtree that does two things, and a member
 * holding one of them cannot use it — so the set is the unit and a partial holder is refused for
 * the whole of it.
 *
 * **A gate naming no acts gates nothing**, because `[].every(...)` is `true`. That is the honest
 * arithmetic rather than a case worth special-handling here: a `<Permitted acts={[]}>` is a
 * caller mistake, and the place to refuse it is the prop type, which does not refuse it today —
 * `procedure.permitted()` has the identical hole, and the two want tightening together rather
 * than one of them quietly diverging.
 *
 * The acts are named. Nothing here reads a bit index, a mask or a role: `permits` is
 * `@rentable/workspace-permission`'s and it is the same function the control plane consults.
 */
export const holdsEvery = (permissions: number, acts: readonly Administration[]): boolean =>
	acts.every((act) => permits(permissions, act));

/**
 * What to draw, from what this member may do and what the caller asked for.
 *
 * **`nothing` and `unavailable` are both the refusal**, and which one arrives is `otherwise`.
 * Splitting them here rather than in the component is what lets a test say *this caller asked for
 * absent and got absent* without a renderer.
 */
export const permittedBranch = (
	permissions: number,
	acts: readonly Administration[],
	otherwise: Otherwise
): PermittedBranch => {
	if (holdsEvery(permissions, acts)) {
		return 'children';
	}

	return otherwise === 'unavailable' ? 'unavailable' : 'nothing';
};
