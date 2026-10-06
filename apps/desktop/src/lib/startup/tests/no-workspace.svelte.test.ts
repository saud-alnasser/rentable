import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { beforeAll, beforeEach, expect, test, vi } from 'vitest';
import type { Writable } from 'svelte/store';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { fakeHeldOrganization } from '$lib/organization/tests/testing';
import { fakeSettings } from '$lib/settings/tests/testing';
import StartupNoWorkspace from '$lib/startup/component/no-workspace.svelte';
import Providers from '#tests/providers.svelte';

/**
 * THE NO-WORKSPACE SCREEN'S CREATE
 *
 * Effort 854, requirement 11 and criterion 11: the owner names the organization's first workspace
 * here, and a create that fails leaves them on this screen. The name they typed is still in the
 * field to be pressed again, rather than emptied by the submit that carried it.
 *
 * **The create is a callback that does nothing**, which is what a failed one looks like from
 * here: the root layout's mutation says the failure, and the screen stays.
 */

// the session the locked notice reads, which has nothing to say here.
vi.mock('$lib/organization/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/query')>()),
	useFetchOrganizationState: () => ({ data: undefined })
}));

const hooks = vi.hoisted(() => ({
	page: null as Writable<Record<string, unknown>> | null
}));

// **The form's own answer to a submit is applied as SvelteKit applies it**, as
// `organization/setup/tests/first-run.svelte.test.ts` does: `applyAction` sets the page's `form`
// and `status`, and superforms reads the page and resets a valid form on a success. A no-op here
// would skip that reset, and with it the defect this pins. The page is a store of this file's own,
// since this runner has no application root to hold one.
vi.mock('$app/stores', async (original) => {
	const { writable } = await import('svelte/store');

	hooks.page = writable<Record<string, unknown>>({});

	return { ...(await original<Record<string, unknown>>()), page: hooks.page };
});

vi.mock('$app/forms', async (original) => ({
	...(await original<Record<string, unknown>>()),
	applyAction: async (result: { type: string; status?: number; data?: unknown }) => {
		if (result.type === 'error' || result.type === 'redirect') return;

		hooks.page?.update((page) => ({ ...page, form: result.data, status: result.status }));
	}
}));

// the settings the foot control reads, which a test has no shell to ask.
vi.mock('$lib/api/caller', () => ({
	default: { settings: { get: async () => fakeSettings(), set: async () => fakeSettings() } }
}));

beforeAll(() => {
	// the popover's floating-ui measures with a `ResizeObserver`, and the appearance reads the
	// system's through `matchMedia`; jsdom has neither.
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	window.matchMedia = ((query: string) => ({
		matches: false,
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {}
	})) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
	document.body.innerHTML = '';
});

const noop = () => {};

test('a create that fails keeps the name typed, in either language', async () => {
	for (const [locale, direction, name] of [
		['en', 'ltr', 'North tower'],
		['ar', 'rtl', 'البرج الشمالي']
	] as const) {
		loadLocale(locale);
		setLocale(locale);
		document.body.innerHTML = '';

		const created: string[] = [];

		render(
			StartupNoWorkspace,
			{
				organizations: [fakeHeldOrganization({ id: 'acme', name: 'Acme Rentals' })],
				selected: 'acme',
				canCreate: true,
				isCreating: false,
				onCreate: (value: string) => void created.push(value),
				onSelect: noop,
				onRemove: noop,
				onSetUpOrganization: noop,
				onJoinByLink: noop
			},
			{ wrapper: Providers, wrapperProps: { strings, direction } }
		);

		const input = () => document.querySelector<HTMLInputElement>('input[name=name]')!;

		await fireEvent.input(input(), { target: { value: name } });
		await fireEvent.submit(input().closest('form')!);

		await waitFor(() => expect(created).toEqual([name]));
		// a reset would land after the create was handed on, so it is given the time to.
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(input().value).toBe(name);
	}

	setLocale('en');
});
