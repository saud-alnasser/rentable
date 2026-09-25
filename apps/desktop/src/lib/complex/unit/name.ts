/**
 * UNIT NAMES
 *
 * How a set of units is named before any of them is written, which is one thing said in one
 * place because two forms say it. A complex is created with its units, and an existing complex
 * has units added to it later; a run typed into either has to name the same units, or `A 1-18`
 * comes to mean one thing on one surface and another thing on the other.
 *
 * Nothing here reads the workspace. The procedures enforce these rules over what arrives, in
 * `ensureUnitNamesDistinct` and `ensureUnitNameAvailable` beside them, and this is what lets a
 * form answer while the reader is still holding the names. It answers with a reason
 * rather than a sentence, so the words stay in the locale files where a surface can read them
 * in the locale it is drawn in.
 */

/**
 * One unit named but not yet created.
 *
 * Each carries a key of its own because the name is editable after it is added, and a list
 * keyed by its own text loses the field the moment the text changes.
 */
export type DraftUnit = { key: number; name: string };

/**
 * a run renders one editable field per unit it names, so a mistyped number must not be able to
 * ask the surface for tens of thousands of them. No building this application is for has more.
 */
export const UNIT_RUN_LIMIT = 500;

/** Why a run names nothing. Both are about the numbers; neither is about a name being taken. */
export type UnitRunRefusal = 'end-before-start' | 'over-the-limit';

/** What a line of typing names, or why it names nothing. */
export type UnitRun = { names: string[]; refusal?: UnitRunRefusal };

/**
 * a run is a pair of numbers at the end of what was typed. Everything before the first of them
 * is the prefix, kept exactly as written: `A1-18` names `A1`, and `A 1-18` names `A 1`, so the
 * notation never inserts a space the reader did not.
 */
const UNIT_RUN = /^(.*?)(\d+)\s*-\s*(\d+)$/;

/**
 * The units one line of typing names.
 *
 * A run is a way of typing the names rather than something the workspace remembers, so it
 * expands here and the names are what is held; anything that is not a run is one unit called
 * what it says, and an empty line names nothing without refusing.
 */
export function parseUnitRun(draft: string): UnitRun {
	const typed = draft.trim();

	if (!typed) return { names: [] };

	const run = UNIT_RUN.exec(typed);

	if (!run) return { names: [typed] };

	const [, prefix, from, to] = run;
	const first = Number(from);
	const last = Number(to);

	if (last < first) return { names: [], refusal: 'end-before-start' };

	if (last - first + 1 > UNIT_RUN_LIMIT) return { names: [], refusal: 'over-the-limit' };

	return {
		names: Array.from({ length: last - first + 1 }, (_, step) => `${prefix}${first + step}`)
	};
}

/**
 * The first name already taken, either by the list it is joining or by an earlier name in its
 * own batch.
 *
 * **The first one, rather than the fact that there is one.** A reader holding eighteen names
 * can act on *A12 is already in the list* and can do nothing at all with *two of these match*.
 *
 * Folded, because the procedure refuses on the same terms.
 *
 * @param against the names already spoken for: on a new complex the batch alone, and on an
 * existing one the units it already holds as well, which is the one comparison the create case
 * has nothing to make.
 */
export function firstTakenName(names: readonly string[], against: readonly string[]) {
	const taken = against.map((name) => name.trim().toLowerCase());

	return names.find((name) => {
		const folded = name.trim().toLowerCase();

		if (taken.includes(folded)) return true;

		taken.push(folded);

		return false;
	});
}
