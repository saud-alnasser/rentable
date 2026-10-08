import type { Contributed } from '$lib/api/contribution';
import type { Context, Database } from '$lib/api/context';
import type { ContributedRead } from '$lib/feature/surface';
import type { RecordFlag, RecordKind } from '$lib/permission';
import type { Contract, Unit } from '$lib/platform/database/schema';
import { refuse } from '$lib/api/refusal';
import * as s from '$lib/platform/database/schema';
import { and, inArray, ne } from 'drizzle-orm';

/**
 * COMPLEX
 *
 * the complex domain module: what a caller is allowed to ask for when reading the
 * complexes directory. The rules that decide whether a write is allowed still live in the
 * router beside the uniqueness checks they read the database for.
 */

/**
 * Whether a complex may be deleted: no contract, of any status, may hold any of its units. The
 * units themselves do not refuse it; they are deleted with it (effort 840, requirement 22).
 *
 * @param assignments every contract's hold on any of the complex's units, counted the way
 * {@link isUnitDeletable} counts one unit's: a contract that ended years ago still holds.
 *
 * Exported beside the router that enforces it so a surface can say what blocks a deletion
 * before offering one, rather than restating the threshold in its own words.
 */
export const isComplexDeletable = (assignments: unknown[]) => assignments.length === 0;

/**
 * The flags deleting a complex needs besides its own: its units go with it, so deleting one that
 * has any deletes units too, and one that has none needs nothing more.
 */
export const flagsToDeleteUnitsOf = (units: unknown[]): RecordFlag[] =>
	units.length > 0 ? ['deleteUnit'] : [];

/** Whether a unit may be deleted: no contract may hold it. The same shape, one level down. */
export const isUnitDeletable = (assignments: unknown[]) => assignments.length === 0;

/**
 * Refuse a deletion the rule above turns away.
 *
 * The code lives here rather than in the procedure, because a rule that decides whether
 * something is allowed belongs to the concept and not to a caller of it. Two procedures apply
 * each of these now, one record at a time and a selection at a time, and two copies of a
 * refusal are two refusals waiting to disagree.
 */
export function ensureComplexDeletable(assignments: unknown[]) {
	if (!isComplexDeletable(assignments)) {
		throw refuse('complex.unitsUnderContract');
	}
}

/** The same, for a unit. See {@link ensureComplexDeletable}. */
export function ensureUnitDeletable(assignments: unknown[]) {
	if (!isUnitDeletable(assignments)) {
		throw refuse('unit.holdsContracts');
	}
}

/**
 * the router passes whatever row its uniqueness query found; any row is a conflict.
 *
 * @param named the name the conflict is over, where the caller acts on more than one complex.
 * Putting a deleted selection back is refused as a set, and *one of them is already registered*
 * is not something a reader can act on. The single-record caller passes nothing: its reader is
 * looking at the one field it is about.
 */
export function ensureComplexNameAvailable(conflicting: unknown, named?: string) {
	if (conflicting) {
		throw named ? refuse('complex.nameTakenNamed', { named }) : refuse('complex.nameTaken');
	}
}

/**
 * The complexes holding any of `names`, leaving out the complex `except` names, which is the one
 * being edited.
 *
 * **The app keeps a complex's name unique, not the database** (effort 857, requirement 14): the
 * shared database refused one machine's changes over a name another saved while apart, and the
 * engine dropped them. So every save that could take a name reads who holds it through here, and
 * what counts as holding one is decided once. A complex retired by a merge holds nothing: the
 * statement rewrite every client applies keeps it out of this read (`platform/database/retired`),
 * so no condition here names it.
 */
export async function complexesNamed(db: Database, names: readonly string[], except?: string) {
	if (names.length === 0) {
		return [];
	}

	return await db
		.select()
		.from(s.complex)
		.where(
			and(
				inArray(s.complex.name, [...names]),
				except === undefined ? undefined : ne(s.complex.id, except)
			)
		);
}

/** The same, for a unit's name, which is unique within the complex holding it. */
export function ensureUnitNameAvailable(conflicting: unknown, named?: string) {
	if (conflicting) {
		throw named ? refuse('unit.nameTakenNamed', { named }) : refuse('unit.nameTaken');
	}
}

/**
 * Why one complex, or one unit, in a selection would be turned away.
 *
 * `missing` is not a rule either concept enforces: it says the row named is no longer in the
 * workspace, which every selection can meet because another device may delete a record between
 * the reader picking it out and asking for the action.
 */
export type ComplexRefusalReason = 'units-under-contract' | 'deletes-units' | 'missing';
export type UnitRefusalReason = 'holds-contracts' | 'missing';

/**
 * Why deleting this complex would be refused, or `undefined` where it would go through: a
 * contract holding one of its units first, then a reader who may not delete the units that would
 * go with it.
 *
 * The predicates above called rather than restated, so what a reader is shown before the deletion
 * and what the deletion decides cannot come to be two rules.
 *
 * Neither takes an action, where the contract's equivalent takes one of three: a selection of
 * complexes, and a selection of units, each admit deleting and nothing else, and a parameter with
 * one legal value is not a choice.
 *
 * @param permitted whether the reader holds a flag.
 */
export function whatRefusesComplexDeletion(
	units: unknown[],
	assignments: unknown[],
	permitted: (flag: RecordFlag) => boolean
) {
	if (!isComplexDeletable(assignments)) {
		return 'units-under-contract' as const;
	}

	return flagsToDeleteUnitsOf(units).every(permitted) ? undefined : ('deletes-units' as const);
}

/**
 * Why deleting this unit would be refused, or `undefined` where it would go through.
 *
 * **Every assignment counts, not the current one.** A unit whose only contract starts next month
 * reads as `vacant` today and still cannot be deleted, which is why no surface can answer this
 * from the row it is showing.
 */
export const whatRefusesUnitDeletion = (assignments: unknown[]) =>
	isUnitDeletable(assignments) ? undefined : ('holds-contracts' as const);

/**
 * The row an update wrote back, or the refusal that it wrote none.
 *
 * An update matching no row writes nothing and answers with nothing, which reads at every call
 * site as success. That is survivable while this machine is the only writer, and it stops being
 * survivable the moment another device can delete a record between this one reading it and
 * writing it. The caller that meets it first is an inverse — see [[rules/data]], under *Undo*,
 * which is where the reasoning lives and which requires this to fail visibly rather than
 * silently write nothing, and requires it not to put the row back.
 */
export function ensureComplexStillExists<T>(complex: T | undefined | null): T {
	if (!complex) {
		throw refuse('complex.gone');
	}

	return complex;
}

/** The same, for a unit. See {@link ensureComplexStillExists} for why it is here at all. */
export function ensureUnitStillExists<T>(unit: T | undefined | null): T {
	if (!unit) {
		throw refuse('unit.gone');
	}

	return unit;
}

/**
 * Refuse a set of unit names holding the same name twice.
 *
 * A collision *within* one submission is a case creating units one dialog at a time could
 * not produce: each was checked against what was stored, and there was never a set to check
 * against itself. The uniqueness the database enforces is per complex, so this is the same
 * rule read against the arriving set rather than against the table.
 *
 * @param names the unit names as submitted, in order.
 * @throws a `BAD_REQUEST` naming the first name that repeats.
 */
export function ensureUnitNamesDistinct(names: string[]) {
	const seen = new Set<string>();

	for (const name of names) {
		const normalized = name.trim().toLowerCase();

		if (seen.has(normalized)) {
			throw refuse('unit.nameRepeated', { name: name.trim() });
		}

		seen.add(normalized);
	}
}

/**
 * The keys the complexes directory may be ordered by, and the whole of what its sort
 * control may offer — an order outside this list is one the query cannot answer, so the
 * router rejects it rather than silently falling back to the default.
 *
 * It lives here rather than beside the SQL because it decides what a caller is allowed to
 * ask for, and it is exported because the control has to be built from the same list: two
 * places naming the orders is how a control comes to offer one the query cannot serve.
 */
export const COMPLEX_SORT_COLUMN_IDS = [
	'name',
	'location',
	'unitCount',
	'vacantUnitCount'
] as const;

export type ComplexSortColumnId = (typeof COMPLEX_SORT_COLUMN_IDS)[number];

/**
 * The keys a complex's unit directory may be ordered by, on the same terms as the complexes'
 * own: the router orders on this list and nothing else, and the directory's sort control is
 * built from it. A unit's name, who occupies it today, and its status are what its card shows.
 */
export const UNIT_SORT_COLUMN_IDS = ['name', 'tenantName', 'status'] as const;

export type UnitSortColumnId = (typeof UNIT_SORT_COLUMN_IDS)[number];

/**
 * What the unit's procedures, which the complex's router serves, need of the contracts holding a
 * unit, contributed by the contract, which depends on the unit rather than the other way round
 * (`$lib/feature/feature`, under *What a feature contributes*).
 */
export type UnitContributions = {
	/** the statuses of a contract that occupies the units it holds while its period runs. */
	occupyingStatuses: readonly Contract['status'][];
	/**
	 * each unit's status as the contracts holding it derive it today, by the unit's id; a unit no
	 * contract holds is absent.
	 */
	unitStatuses: (
		ctx: Pick<Context, 'db' | 'clock'> & Contributed,
		unitIds: string[]
	) => Promise<Map<string, Unit['status']>>;
};

/**
 * The kind of record a unit is, as its declaration names it: what a feature depending on the unit
 * asks the reader's permissions about, rather than spelling the kind itself.
 */
export const UNIT_KIND = 'unit' satisfies RecordKind;

/** What the unit's host and acts need of the contracts holding a unit, in the window. */
export type UnitSurfaceContributions = {
	/**
	 * every contract that ever named the unit, read only while `enabled` says so: what refuses its
	 * deletion ({@link isUnitDeletable}).
	 */
	useHeldContracts: (
		unitId: () => string | undefined,
		enabled: () => boolean
	) => ContributedRead<unknown[]>;
	/** open a new contract holding the unit. */
	newContract: (unitId: string) => void;
	/**
	 * whether the reader may see tenants, and so who holds a unit under the contract naming it:
	 * the directory's tenant column.
	 */
	viewsTenants: () => boolean;
};

/** What the complex's page needs of the contracts on its units, in the window. */
export type ComplexSurfaceContributions = {
	/**
	 * how many of the complex's contracts are active, or `undefined` while that is being read. Read
	 * as the reader reads it, so a page deriving from it follows the read.
	 */
	useActiveContractCount: (complexId: () => string) => { readonly count: number | undefined };
};
