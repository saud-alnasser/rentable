import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import { sectionsOn } from '$lib/app/surfaces';
import { searchField } from '$lib/list/tests/search';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { hostAnswers, resetHostAnswers } from '$lib/organization/tests/host-hooks';
import { fakeOrganizationSession } from '$lib/organization/tests/testing.ts';
import { fakeSettings } from '$lib/settings/tests/testing.ts';
import { fakeSyncState } from '$lib/sync/tests/testing.ts';
import SettingsArea from '$lib/settings/component/area.svelte';
import TenantDetails from '$lib/tenant/component/details.svelte';
import { usesAppleKeyboard } from '@rentable/design/shortcut.js';
import { BUILT_IN } from '@rentable/workspace-permission';

import type { Component } from 'svelte';

import PaletteHarness from '#tests/palette-harness.svelte';

/**
 * THE COMMAND MENU, OPENED FROM EVERY SCREEN
 *
 * Criterion 7(b) of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]]: Ctrl/Cmd+K
 * opens the command menu on every route, settings and record pages included. The frame mounts the
 * palette once above whatever route is drawn, so what is read here is that the key reaches it with
 * each of the two screens on screen, from the page and from inside the screen's own search field,
 * where a listener that swallowed the key, or a field that kept it, would stop it.
 *
 * **The address and the reads are the mock.** `$app/state` carries no navigation under this
 * runner, and the tenant page's two reads would reach a shell there is none of, so the tenant is
 * stood in for and its contracts are none. The settings area's organization section reads the
 * organization for itself, so its reads are the organization host's hooks stood in for
 * (`organization/tests/host-hooks.ts`).
 */

const { address } = vi.hoisted(() => ({
	address: { url: new URL('http://localhost/settings?section=organization') }
}));

vi.mock('$app/state', () => ({
	page: {
		get url() {
			return address.url;
		}
	}
}));

const TENANT_ID = '0b0c4d6e-7f8a-4b9c-8d0e-1f2a3b4c5d6e';

vi.mock('$lib/tenant/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/tenant/query')>()),
	useFetchTenant: () => ({
		data: { id: TENANT_ID, name: 'Sara', phone: '+966500000000', nationalId: '1000000000' },
		isLoading: false
	})
}));

vi.mock('$lib/organization/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

vi.mock('$lib/organization/member/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/member/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

vi.mock('$lib/organization/role/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/role/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

vi.mock('$lib/organization/access/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/access/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

vi.mock('$lib/organization/workspace/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/workspace/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

vi.mock('$lib/organization/session/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/session/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

vi.mock('$lib/sync/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/sync/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).syncHooks
}));

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useListContracts: () => ({ data: [], isLoading: false, isFetching: false })
}));

/**
 * a route, as the fixture draws it: a component and whatever props it is handed. The fixture only
 * spreads them, so they are not checked against the route here; the settings area's are the ones
 * `app/tests/settings-area.svelte.test.ts` renders it with, and a wrong one fails the render.
 */
const asScreen = (route: unknown) => route as Component<Record<string, unknown>>;

const noop = () => {};
const resolved = async () => {};

beforeEach(() => {
	resetHostAnswers();
	loadLocale('en');
	setLocale('en');

	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;

	// the command list brings its first row into view as it opens, which jsdom cannot do.
	Element.prototype.scrollIntoView = () => {};
});

/** whether the palette is showing, as the frame holds it. */
const isOpen = () =>
	document.querySelector('[data-palette-open]')?.getAttribute('data-palette-open') === 'true';

/** Mod+K, with whichever modifier this platform's own shortcuts use, pressed on `target`. */
const pressPaletteKey = (target: Element) =>
	fireEvent.keyDown(
		target,
		usesAppleKeyboard() ? { key: 'k', metaKey: true } : { key: 'k', ctrlKey: true }
	);

const onSettings = () => {
	address.url = new URL('http://localhost/settings?section=organization');
	hostAnswers.session = fakeOrganizationSession({ permissions: BUILT_IN.manager.mask });
	hostAnswers.holdsTursoAuthority = true;
	hostAnswers.syncState = fakeSyncState();

	return render(PaletteHarness, {
		strings,
		direction: 'ltr',
		screen: asScreen(SettingsArea),
		screenProps: {
			section: 'organization',
			settings: fakeSettings(),
			signedIn: true,
			sections: sectionsOn('settings'),
			onChangeLocale: noop,
			onRevealDiagnostics: noop,
			leaveForTheWall: resolved
		}
	});
};

const onRecordPage = () => {
	address.url = new URL(`http://localhost/tenants/${TENANT_ID}`);

	return render(PaletteHarness, {
		strings,
		direction: 'ltr',
		screen: asScreen(TenantDetails),
		screenProps: { tenantId: TENANT_ID, sections: sectionsOn('tenant') }
	});
};

test('Mod+K opens the command menu on the settings area', async () => {
	onSettings();

	expect(document.querySelector('[data-section-switch]')).not.toBeNull();
	expect(isOpen()).toBe(false);

	await pressPaletteKey(document.body);

	await waitFor(() => expect(isOpen()).toBe(true));
	expect(document.querySelector('[role=dialog]')).not.toBeNull();
});

test('Mod+K opens the command menu from inside the settings directory search', async () => {
	onSettings();

	const field = searchField();

	field.focus();
	await pressPaletteKey(field);

	await waitFor(() => expect(isOpen()).toBe(true));
});

test('Mod+K opens the command menu on a record page', async () => {
	onRecordPage();

	expect(document.body.textContent).toContain('Sara');
	expect(isOpen()).toBe(false);

	await pressPaletteKey(document.body);

	await waitFor(() => expect(isOpen()).toBe(true));
	expect(document.querySelector('[role=dialog]')).not.toBeNull();
});

test('Mod+K opens the command menu from inside a record page list search', async () => {
	onRecordPage();

	const field = searchField();

	field.focus();
	await pressPaletteKey(field);

	await waitFor(() => expect(isOpen()).toBe(true));
});
