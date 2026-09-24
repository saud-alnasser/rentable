import { LOADING_DELAY } from '#lib/block/loading.svelte';
import RecordSurface from '#lib/block/record-surface.svelte';
import { shownRecord } from '#lib/shown-record.svelte.js';
import { type DesignStrings } from '#lib/strings.js';
import { forgetNavigations, navigations } from '#tests/app-navigation.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import Providers from '#tests/providers.svelte';
import RecordSurfaceHarness from '#tests/record-surface-harness.svelte';
import { act, render, screen } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';

/**
 * The two states of this surface that are words rather than a record, and the first component test
 * in the package to reach a module that navigates.
 *
 * **It could not be written until the runner supplied `$app/navigation`.** The subject's back
 * control navigates, so the attempt at #781 failed at resolution rather than at an assertion.
 * `vitest.config.js` points that specifier at `#tests/app-navigation.js` and says why there.
 *
 * **Both branches are the contract's words, and neither is a prop**, so a caller cannot correct
 * either one. That is what makes them worth a test: `loadingRecord` said `loading app...` on every
 * record page in the consuming application for as long as it was documented as saying otherwise,
 * and the only thing that caught it was a human reading a docstring against a locale file.
 *
 * The subject takes its own props and needs no fixture for them. What it does need is two
 * providers rather than one: the found branch draws `back-control`, which draws a tooltip, and
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

test('a record on its way says so, in the words the contract was handed', async () => {
	vi.useFakeTimers();

	try {
		surface({ isLoading: true }, { loadingRecord: 'the record is on its way' });

		// the loading block says nothing before its delay, which `loading.svelte.test.ts` covers.
		await act(() => vi.advanceTimersByTime(LOADING_DELAY));

		expect(document.body.textContent).toContain('the record is on its way');
	} finally {
		vi.useRealTimers();
	}
});

const missingWords = {
	loadingRecord: 'the record is on its way',
	recordNotFound: 'this record does not exist',
	recordNotFoundDescription: 'it may have been deleted',
	goBack: 'go back'
} satisfies Partial<DesignStrings>;

// criterion 13 of effort 832, its not-found half: a missing record says it does not exist and
// offers the way back, and does not read as a search that found nothing.
test('a record that is not there says it does not exist, and does not say it is loading', () => {
	const { container } = surface({ isLoading: false, found: false }, missingWords);

	const empty = container.querySelector('[data-empty]');

	expect(empty?.getAttribute('data-empty')).toBe('not-found');
	expect(empty?.textContent).toContain('this record does not exist');
	expect(empty?.textContent).toContain('it may have been deleted');
	expect(document.body.textContent).not.toContain('the record is on its way');
});

test('a record that is not there offers the way back, which goes where back goes', () => {
	forgetNavigations();
	surface({ isLoading: false, found: false }, missingWords);

	screen.getByRole('button', { name: 'go back' }).click();

	// nothing was visited before it in this file, so back has nowhere to return to and takes the
	// concept's directory, exactly as the back control does.
	expect(navigations().map((call) => call.url)).toEqual(['/tenants']);
});

// ticket 30 of effort 832: a missing record and an unknown address are one treatment with one way
// back. The corner's back control and a second pill beneath the sentence were two controls going
// to one place; the record now draws the not-found block, whose one control is the back control.
test('a record that is not there offers one way back, the back control in the not-found block', () => {
	const { container } = surface({ isLoading: false, found: false }, missingWords);

	const controls = container.querySelectorAll('[data-back-control]');

	expect(controls).toHaveLength(1);
	expect(controls[0].closest('[data-empty="not-found"]')).not.toBeNull();
	expect(controls[0].textContent?.trim()).toBe('go back');
});

test('the loading state is marked busy from the start', () => {
	const { container } = surface({ isLoading: true });

	expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
});

const withCollections = (section?: string | null) =>
	render(
		RecordSurfaceHarness,
		{ section },
		{
			wrapper: Providers,
			wrapperProps: { strings: suppliedStrings(), direction: 'ltr' }
		}
	);

const switchLinks = () => [
	...document.querySelectorAll<HTMLAnchorElement>('[data-section-switch] a')
];

// criterion 14(c) of effort 832: a record's collections switch with the one section control, and
// every collection is a link to its own address.
test('a record with several collections switches them with the section switch, by address', () => {
	withCollections();

	expect(document.querySelectorAll('nav[data-section-switch]')).toHaveLength(1);
	// the first collection is the record's own address, so arriving with no section and pressing
	// the first link land on one address.
	expect(switchLinks().map((link) => link.getAttribute('href'))).toEqual([
		'/contracts/1',
		'/contracts/1?section=units',
		'/contracts/1?section=history'
	]);
});

test('the collection the address names is the one drawn and the one marked', () => {
	withCollections('history');

	expect(screen.getByText('the history')).toBeDefined();
	expect(screen.queryByText('the payments')).toBeNull();
	expect(screen.queryByText('the units')).toBeNull();

	const marked = switchLinks().filter((link) => link.getAttribute('aria-current') === 'page');

	expect(marked.map((link) => link.dataset.section)).toEqual(['history']);
});

test('no section, and a section the record does not have, draw the first collection', () => {
	for (const section of [undefined, null, 'tenants']) {
		const rendered = withCollections(section);

		expect(screen.getByText('the payments'), String(section)).toBeDefined();
		expect(screen.queryByText('the history'), String(section)).toBeNull();
		rendered.unmount();
	}
});

// the breadcrumb ends on the record, and the surface is what names it.
test('the surface names its record for the chrome while it stands, and takes the name back', () => {
	const rendered = withCollections();

	expect(shownRecord.name).toBe('a name');

	rendered.unmount();

	expect(shownRecord.name).toBeUndefined();
});

test('a record that is not there is named as absent, and one on its way is not named yet', () => {
	const missing = surface({ isLoading: false, found: false });

	expect(shownRecord.name).toBeNull();
	missing.unmount();

	surface({ isLoading: true });

	expect(shownRecord.name).toBeUndefined();
});

// ticket 33 of effort 832: a payment's trail runs through its contract, which the payment's surface
// names and addresses, and only while the payment itself is found.
test('the surface names the record it is reached through while its own record stands', () => {
	const parent = { name: 'a tenant', href: '/contracts/contract-1' };
	const found = surface({ isLoading: false, found: true, parent });

	expect(shownRecord.parent).toEqual(parent);
	found.unmount();

	expect(shownRecord.parent).toBeUndefined();

	surface({ isLoading: false, found: false, parent });

	expect(shownRecord.parent).toBeUndefined();
});
