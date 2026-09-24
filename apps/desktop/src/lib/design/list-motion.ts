/**
 * LIST MOTION
 *
 * The pure half of how a directory moves when its result set changes: which snapshot name a record
 * travels under, whether a change moves anything at all, and where the snapshots are clipped. The
 * block keeps the half that is the document's, which is starting the transition and marking what
 * it captures, because a `.svelte` file cannot be imported by a `node:test` file and these rules
 * are the kind that regress without a sound.
 *
 * The mechanism is a same-document view transition, chosen by prototype over `animate:flip`
 * (plan, *Architecture 4*): it reaches rows the virtualiser adds and removes, where `animate:flip`
 * moves only rows already on screen.
 */

// what a `<custom-ident>` may carry unescaped. The underscore is left out on purpose, because it is
// the escape's own marker: keeping it out of the plain set is what makes two different ids always
// give two different names.
const PLAIN = /[^A-Za-z0-9-]/g;

/**
 * The `view-transition-name` a list row travels under.
 *
 * A name has to be a valid identifier and unique in the document for the length of the
 * transition, or the browser skips the whole transition. So every character an id may carry that
 * an identifier may not is written as its code point between underscores, and the name opens with
 * the list's own scope: two lists on one screen can show the same record, and a name shared
 * between them would be two elements under one name.
 */
export function toTransitionName(scope: string, key: string) {
	const escape = (value: string) =>
		value.replace(PLAIN, (character) => `_${character.codePointAt(0)!.toString(16)}_`);

	// a leading letter, so the name can never start with a digit or be read as a keyword.
	return `list-${escape(scope)}-${escape(key)}`;
}

/**
 * Whether two result sets hold the same records in the same order.
 *
 * Only such a change has nothing to move: a record edited in place comes back as a new object at
 * the same place, and cross-fading it would be motion that explains nothing. What moves is a set
 * that gained a record, lost one, or put them in another order.
 */
export function hasSameOrder(
	before: readonly { id: string }[],
	after: readonly { id: string }[]
): boolean {
	return (
		before.length === after.length && before.every((record, index) => record.id === after[index].id)
	);
}

/** The part of a box a clip needs: its edges in the viewport's coordinates. */
export type ClipBox = { top: number; right: number; bottom: number; left: number };

/**
 * The `clip-path` that keeps a transition's snapshots inside the list's frame.
 *
 * The snapshots are drawn on a layer above the whole document, so the frame's own `overflow` and
 * rounded corners do not reach them, and a record leaving past the frame's edge would be drawn over
 * the toolbar. The layer covers the viewport, so the frame's box is stated as insets from each of
 * its edges, with the right and bottom ones measured from the far side, and it keeps the frame's
 * rounding.
 */
export function toClipPath(box: ClipBox, radius: string) {
	const round = radius && radius !== '0px' ? ` round ${radius}` : '';

	return (
		`inset(${box.top}px calc(100% - ${box.right}px) calc(100% - ${box.bottom}px) ` +
		`${box.left}px${round})`
	);
}
