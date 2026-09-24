// Shared scaffolding for the tests that render a screen through the design package's provider.
// Not a `*.test.ts` file, so the test runner does not pick it up directly.

import { toRefusalText } from '$lib/error/refusal';
import { LL } from '$lib/i18n/i18n-svelte';
import type { DesignStrings } from '@rentable/design/strings.js';
import { get } from 'svelte/store';

/**
 * The string contract, answered with each key's own name in braces.
 *
 * A packaged block reads its strings from `DesignProvider`, and a screen rendered under test
 * needs something there; what it needs is never a real sentence, since no assertion on the
 * application's screens looks for a package string, only for the application's own. So every
 * key comes back as `{key}`, and the two functions the contract declares come back as functions:
 * `moreRecords` does the same with its count. `refusal` is the exception: a refusal is the
 * application's own sentence rather than the package's, so it is worded exactly as the root
 * layout words it, in whatever locale the test set. One fixture for one declared interface,
 * as [[rules/testing]] asks, rather than a copy per test file.
 */
export const placeholderStrings = new Proxy({} as DesignStrings, {
	get: (_, key) =>
		key === 'moreRecords'
			? (count: number) => `{${count}}`
			: key === 'refusal'
				? (failure: unknown) => toRefusalText(failure, get(LL))
				: `{${String(key)}}`
});
