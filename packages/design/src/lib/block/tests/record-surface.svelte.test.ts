import RecordSurface from '#lib/block/record-surface.svelte';
import { type DesignStrings } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import Providers from '#tests/providers.svelte';
import { render } from '@testing-library/svelte';
import { expect, test } from 'vitest';

/**
 * The two states of this surface that are words rather than a record, and the first component test
 * in the package to reach a module that navigates.
 *
 * **It could not be written until the runner supplied `$app/navigation`.** The subject calls `goto`
 * from an effect, so the attempt at #781 failed at resolution rather than at an assertion.
 * `vitest.config.js` points that specifier at `#tests/app-navigation.js` and says why there.
 *
 * **Both branches are the contract's words, and neither is a prop**, so a caller cannot correct
 * either one. That is what makes them worth a test: `loadingRecord` said `loading app...` on every
 * record page in the consuming application for as long as it was documented as saying otherwise,
 * and the only thing that caught it was a human reading a docstring against a locale file.
 *
 * The subject takes its own props and needs no fixture for them. What it does need is two
 * providers rather than one: the not-found branch draws `back-control`, which draws a tooltip, and
 * `wrapper` puts a single component above a subject. `#tests/providers.svelte` is that pair, and
 * it takes the string contract's props unchanged.
 */
const surface = (props: Record<string, unknown>, strings: Partial<DesignStrings> = {}) =>
	render(
		RecordSurface,
		{
			backFallback: '/tenants',
			path: '/tenants/1',
			eyebrow: 'tenant',
			title: 'a name',
			...props
		},
		{
			wrapper: Providers,
			wrapperProps: { strings: suppliedStrings(strings), direction: 'rtl' }
		}
	);

test('a record on its way says so, in the words the contract was handed', () => {
	surface({ isLoading: true }, { loadingRecord: 'the record is on its way' });

	expect(document.body.textContent).toContain('the record is on its way');
});

test('a record that is not there says so, and does not say it is loading', () => {
	surface(
		{ isLoading: false, found: false },
		{ loadingRecord: 'the record is on its way', noResults: 'no such record' }
	);

	expect(document.body.textContent).toContain('no such record');
	expect(document.body.textContent).not.toContain('the record is on its way');
});

test('the loading state is the one that draws the spinner, and it is a status', () => {
	const { container } = surface({ isLoading: true });

	expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
});
