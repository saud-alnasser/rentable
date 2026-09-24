import type { Pathname } from '$app/types';

/**
 * The search parameter a link carries to ask for a new record in the list it opens.
 *
 * Whoever wants a record created where it will be listed navigates to the list carrying this
 * parameter. The concept's host, which owns the create form, consumes it on arrival; the list
 * itself does not read it.
 */
export const CREATE_INTENT_PARAM = 'create';

/**
 * `path`, asking the list it addresses to open its create form on arrival.
 *
 * The result keeps the literal route it was given, because `resolve` reads the route out of
 * the type it is handed and cannot match a widened one.
 */
export function withCreateIntent<T extends Pathname>(
	path: T
): `${T}?${typeof CREATE_INTENT_PARAM}` {
	return `${path}?${CREATE_INTENT_PARAM}`;
}

/** Whether `url` asks the list it addresses to open its create form. */
export function hasCreateIntent(url: URL): boolean {
	return url.searchParams.has(CREATE_INTENT_PARAM);
}
