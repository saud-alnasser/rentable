import api from '$lib/api/caller';
import { historyKeys, type HistoryConcept } from '$lib/history/history';
import { isRecordId } from '$lib/platform/database/identity';
import { createQuery } from '@tanstack/svelte-query';

/** What was done to one record, most recent first. */
export function useListHistory(
	concept: () => HistoryConcept,
	recordId: () => string,
	search: () => string = () => ''
) {
	return createQuery(() => {
		const kind = concept();
		const id = recordId();
		const trimmed = search().trim();

		return {
			queryKey: historyKeys.getMany(kind, id, trimmed),
			enabled: isRecordId(id),
			queryFn: () =>
				api.history.getMany({ concept: kind, recordId: id, search: trimmed || undefined }),
			placeholderData: <T>(previous: T) => previous
		};
	});
}
