import api from '$lib/api/caller';
import { UNIT_SORT_COLUMN_IDS, type UnitSortColumnId } from '$lib/complex/complex';
import { keys } from '$lib/complex/query';
import { declareMutation, describeOutcomeChange } from '$lib/mutation/ui';
import type { SelectionCall } from '@rentable/design/selection.js';
import type { HistoryEntry } from '$lib/history';
import { isRecordId } from '$lib/platform/database/identity';
import type { ListSort } from '@rentable/design/sort.js';
import { LL } from '$lib/i18n/i18n-svelte';
import { createQuery, useQueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

/**
 * THE UNITS' QUERIES AND MUTATIONS
 *
 * every hook a unit is read and written through. A unit's procedures are the complex's
 * (`complex.units`), and its keys sit under the complex's `keys.units`, so the two are read
 * from there.
 */

/** Why a record in a selection would be turned away, read off the procedure rather than restated. */
export type UnitRefusalReason = Awaited<
	ReturnType<typeof api.complex.units.planMany>
>['refused'][number]['reason'];

const toIds = (records: readonly { id: string }[]) => records.map((record) => record.id);

/**
 * One line on one record's own account.
 *
 * A multi-record action writes one of these per record it changed, named the way a reader knows
 * one: a selection is how the reader acted, and a record's history is about the record.
 */
const toHistoryEntry = (
	concept: 'unit',
	record: { id: string; name: string },
	action: HistoryEntry['action']
) => ({ concept, recordId: record.id, action, record: record.name });

/** The units a palette search reaches, across every complex. */
export function useSearchUnits(term: () => string, limit: number) {
	return createQuery(() => {
		const trimmed = term().trim();

		return {
			queryKey: keys.units.search(trimmed),
			enabled: trimmed.length > 0,
			queryFn: () => api.complex.units.search({ term: trimmed, limit }),
			placeholderData: <T>(previous: T) => previous
		};
	});
}

function isUnitSortColumnId(columnId: string): columnId is UnitSortColumnId {
	return (UNIT_SORT_COLUMN_IDS as readonly string[]).includes(columnId);
}

/**
 * A complex's unit directory for a search and an order: every unit it holds, each carrying the
 * tenant occupying it. With no order chosen it reads by name, and the reader may choose another
 * from `UNIT_SORT_COLUMN_IDS`, as every list may.
 */
export function useListUnits(
	complexId: () => string,
	search: () => string = () => '',
	sort: () => ListSort | null = () => null
) {
	return createQuery(() => {
		const id = complexId();
		const trimmedSearch = search().trim();
		const chosenSort = sort();

		return {
			queryKey: keys.units.board(id, trimmedSearch, chosenSort),
			queryFn: () =>
				api.complex.units.getMany({
					complexId: id,
					search: trimmedSearch || undefined,
					sort:
						chosenSort && isUnitSortColumnId(chosenSort.columnId)
							? { columnId: chosenSort.columnId, direction: chosenSort.direction }
							: undefined
				}),
			placeholderData: <T>(previous: T) => previous
		};
	});
}

/**
 * What deleting the units named would do, before it is done.
 *
 * **This is the reading no row could have replaced.** A unit row carries a status derived from
 * what holds it today, and a unit is refused for holding any assignment ever, so a unit with a
 * contract starting next month is on screen as vacant and cannot be deleted.
 */
export function usePlanManyUnits(ids: () => readonly string[]) {
	return createQuery(() => {
		const named = [...ids()];

		return {
			queryKey: keys.units.plan(named),
			enabled: named.length > 0,
			queryFn: () => api.complex.units.planMany({ ids: named })
		};
	});
}

/** One unit and the complex holding it. */
export function useFetchUnit(id: () => string) {
	return createQuery(() => {
		const freshId = id();

		return {
			queryKey: keys.units.get(freshId),
			queryFn: () => api.complex.units.get({ id: freshId }),
			enabled: isRecordId(freshId)
		};
	});
}

/**
 * Read one unit once, with the complex holding it, for a caller that holds only its identity or a
 * row short of that complex: the unit host, answering an act the command menu named by id, and
 * copying a unit's details. Under the key `useFetchUnit` reads.
 */
export function useReadUnit() {
	const client = useQueryClient();

	return (id: string) =>
		client.fetchQuery({
			queryKey: keys.units.get(id),
			queryFn: () => api.complex.units.get({ id })
		});
}

export function useFetchUnits(complexId: () => string, enabled: () => boolean = () => true) {
	return createQuery(() => {
		const id = complexId();

		return {
			queryKey: keys.units.getMany(id),
			enabled: enabled(),
			queryFn: () => api.complex.units.getMany({ complexId: id })
		};
	});
}

/**
 * Delete every unit in the selection that no contract has ever held, as one change.
 *
 * The complex's own carries the reasoning; this is the same shape one level down. `touches` names
 * complexes too, because a complex's row shows how many units it holds and how many stand vacant.
 */
export const useDeleteManyUnits = declareMutation({
	mutate: ({ ids }: SelectionCall) => api.complex.units.deleteMany({ ids }),
	touches: ['units', 'complexes'],
	inverse: ({ result }) =>
		result.deleted.length === 0
			? undefined
			: (() => {
					// what the last deletion took, which the next undo puts back: a redo is refused whatever
					// has come to hold one since and removes the rest, so the undo after it puts back only
					// those, and nothing where it removed nothing.
					let removed = result.deleted;

					return {
						describe: (t) => t.common.undo.deletedMany({ count: removed.length }),
						flags: { undo: ['createUnit'], redo: ['deleteUnit'] },
						undo: async () => {
							if (removed.length > 0) {
								await api.complex.units.createMany({ units: removed });
							}
						},
						redo: async () => {
							removed = (await api.complex.units.deleteMany({ ids: toIds(result.deleted) }))
								.deleted;
						},
						records: (direction) =>
							removed.map((unit) =>
								toHistoryEntry('unit', unit, direction === 'undo' ? 'created' : 'deleted')
							)
					};
				})(),
	records: ({ result }) => result.deleted.map((unit) => toHistoryEntry('unit', unit, 'deleted')),
	notice: ({ variables, result }) =>
		describeOutcomeChange(variables.foreseen, result.refused, (refusal) => refusal.name.trim()),
	toast: {
		success: ({ result }) =>
			result.deleted.length > 0
				? get(LL).complexes.hooks.unitDeleteManySuccess({ count: result.deleted.length })
				: undefined,
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useCreateUnit = declareMutation({
	mutate: (data: Parameters<typeof api.complex.units.create>[0]) => api.complex.units.create(data),
	touches: ['units'],
	inverse: ({ result }) => ({
		describe: (t) => t.common.undo.created({ record: t.common.labels.unit() }),
		flags: { undo: ['deleteUnit'], redo: ['createUnit'] },
		undo: () => api.complex.units.delete({ id: result.id }),
		redo: () => api.complex.units.create(result)
	}),
	toast: {
		success: () => get(LL).complexes.hooks.unitCreateSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

/**
 * Create every unit named, as one change.
 *
 * **One call, one batch, one entry on the undo stack.** Eighteen units named in one line are
 * eighteen rows written inside one transaction, and taking it back removes all eighteen rather
 * than eighteen presses removing one each, which is the shape the deletions in this effort
 * take, arrived at from the other direction.
 *
 * The rows are what the procedure answers with, so applying the change again puts them back
 * under the identities the first creation assigned (ADR 0026).
 *
 * The refusal is not toasted: it is a name already taken, and the form naming it has a line for
 * that under the field the reader would fix.
 *
 * **A unit the workspace refuses to remove leaves the undo partial**, which is the property
 * every bulk inverse here already has: `deleteMany` reports what it turned away rather than
 * throwing, and a unit can only be turned away by having gained a contract since it was created,
 * which needs another device to have assigned it.
 */
export const useCreateManyUnits = declareMutation({
	mutate: (data: Parameters<typeof api.complex.units.createMany>[0]) =>
		api.complex.units.createMany(data),
	touches: ['units', 'complexes'],
	inverse: ({ result }) => ({
		describe: (t) => t.common.undo.createdMany({ count: result.length }),
		flags: { undo: ['deleteUnit'], redo: ['createUnit'] },
		undo: () => api.complex.units.deleteMany({ ids: toIds(result) }),
		redo: () => api.complex.units.createMany({ units: result }),
		records: (direction) =>
			result.map((unit) =>
				toHistoryEntry('unit', unit, direction === 'undo' ? 'deleted' : 'created')
			)
	}),
	records: ({ result }) => result.map((unit) => toHistoryEntry('unit', unit, 'created')),
	toast: {
		success: ({ result }) =>
			get(LL).complexes.hooks.unitCreateManySuccess({ count: result.length }),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useUpdateUnit = declareMutation({
	mutate: (values: Parameters<typeof api.complex.units.update>[0]) =>
		api.complex.units.update(values),
	touches: ['units'],
	capture: (variables) => api.complex.units.get({ id: variables.id }),
	inverse: ({ variables, captured }) =>
		captured && {
			describe: (t) => t.common.undo.edited({ record: t.common.labels.unit() }),
			flags: { undo: ['editUnit'], redo: ['editUnit'] },
			undo: () => api.complex.units.update(captured),
			redo: () => api.complex.units.update(variables)
		},
	toast: {
		success: () => get(LL).complexes.hooks.unitUpdateSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useDeleteUnit = declareMutation({
	mutate: (id: string) => api.complex.units.delete({ id }),
	touches: ['units'],
	inverse: ({ result }) =>
		result && {
			describe: (t) => t.common.undo.deleted({ record: t.common.labels.unit() }),
			flags: { undo: ['createUnit'], redo: ['deleteUnit'] },
			undo: () => api.complex.units.create(result),
			redo: () => api.complex.units.delete({ id: result.id })
		},
	toast: {
		success: () => get(LL).complexes.hooks.unitDeleteSuccess(),
		// no dialog asked first, so the announcement says how long it can be taken back.
		detail: () => get(LL).common.undo.lasts(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});
