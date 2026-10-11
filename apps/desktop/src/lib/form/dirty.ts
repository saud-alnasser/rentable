/**
 * Whether a form that is not a superform has changes: what it holds now against what it held
 * when it opened ([[rules/interface]], *Form surface*; requirement 10 of
 * [[efforts/861-the-app-never-shows-something-false/spec]]).
 *
 * A superform says this itself, from its tainted fields. The rest keep what the reader edits in
 * `$state`, and a form says which of it a close would lose. Each takes a `$state.snapshot` of that
 * when it opens, inside the effect that seeds it and under `untrack`, so the snapshot is retaken
 * when a seed is and never because the reader typed; then it hands `FormSurface` the comparison
 * with a snapshot of the same state now:
 *
 * ```svelte
 * const edits = () => ({ chosen, password });
 * let opened = $state.raw<ReturnType<typeof edits>>();
 *
 * $effect(() => {
 * 	if (open) opened = untrack(() => $state.snapshot(edits()));
 * });
 *
 * const dirty = $derived(isDirty(opened, $state.snapshot(edits())));
 * ```
 *
 * **Values are compared, never identities**, so a value changed and then changed back is no
 * change, and neither is a record whose keys came back in another order. A key set to
 * `undefined` reads as one never set, which is how a record that gained a key and lost its value
 * again reads to the reader. What a snapshot holds is plain data, primitives, arrays and plain
 * objects, and that is all this walks; anything else is the same only where it is the same object.
 *
 * Nothing taken yet (`undefined`) is unlike anything a form holds, so a form whose snapshot is
 * somehow missing asks before it closes rather than losing what was typed.
 *
 * *Why the forms compare snapshots rather than the surface doing it for them: the surface cannot
 * see state kept outside a form's fields, and what a form counts as its changes (a checked list,
 * the grants a member's sheet comes to) is the form's to say, not the surface's to guess
 * (`plan.md`, Closing a form with changes).*
 */
export const isDirty = (opened: unknown, current: unknown): boolean => !same(opened, current);

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' &&
	value !== null &&
	(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const same = (left: unknown, right: unknown): boolean => {
	if (Object.is(left, right)) return true;

	if (Array.isArray(left) || Array.isArray(right)) {
		return (
			Array.isArray(left) &&
			Array.isArray(right) &&
			left.length === right.length &&
			left.every((item, at) => same(item, right[at]))
		);
	}

	if (!isRecord(left) || !isRecord(right)) return false;

	const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

	return [...keys].every((key) => same(left[key], right[key]));
};
