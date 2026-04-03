import z from 'zod';

export const DEFAULT_PAGE_SIZE = 24;

export const PaginationSchema = z.object({
	limit: z.number().int().positive().max(100).optional(),
	offset: z.number().int().nonnegative().optional()
});

export type PaginatedResult<T> = {
	items: T[];
	nextOffset: number | null;
};

export function resolvePagination(input: { limit?: number; offset?: number }) {
	return {
		limit: input.limit ?? DEFAULT_PAGE_SIZE,
		offset: input.offset ?? 0
	};
}

export function toPaginatedResult<T>(
	records: T[],
	limit: number,
	offset: number
): PaginatedResult<T> {
	return {
		items: records.slice(0, limit),
		nextOffset: records.length > limit ? offset + limit : null
	};
}
