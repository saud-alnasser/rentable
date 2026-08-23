import type { Pathname } from '$app/types';

/**
 * The search parameter a link carries to ask the list it opens to start a new record.
 *
 * A list owns its own create form, so nothing outside it can open that form directly. The
 * intent travels in the URL instead: whoever wants a record created navigates to the list
 * carrying this parameter, and the list consumes it on arrival.
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
