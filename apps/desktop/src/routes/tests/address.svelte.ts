/**
 * THE ADDRESS A ROUTE TEST STANDS AT
 *
 * Scaffolding for `record-params.svelte.test.ts`: what of `page` from `$app/state` a
 * record route reads, held as state so that a test can move it the way the palette, a link or the
 * back button does and see the route follow. The test's `vi.mock('$app/state')` hands out getters
 * over this object.
 */

export const address = $state({
	params: { id: '' } as Record<string, string | undefined>,
	route: { id: '' },
	/** the path, which the mock reads back as a fresh `URL`, as `page.url` hands one out. */
	path: '/'
});

/** Stands the address at `path` on the route `routeId`, naming the record `id`. */
export function standAt(routeId: string, path: string, id: string): void {
	address.route = { id: routeId };
	address.params = { id };
	address.path = path;
}
