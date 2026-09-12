import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import SetupWalk from '$lib/organization/component/setup-walk.svelte';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';

/**
 * THE WALK, RENDERED
 *
 * `setup.test.ts` asserts over the description the screen draws from. This asserts over what the
 * screen actually put in the document, which is the other half of criterion 3: a field that
 * reached the DOM without going through the description would pass there and fail here.
 */

const noop = () => {};
const walk = (
	step: 'connect' | 'name' | 'done',
	overrides: Partial<Parameters<typeof render<typeof SetupWalk>>[1]> = {}
) =>
	render(SetupWalk, {
		step,
		consent: { status: 'idle', error: null },
		isConnecting: false,
		isCreating: false,
		created: null,
		linkCopied: false,
		onOpenDashboard: noop,
		onConnect: noop,
		onDisconnect: noop,
		onContinue: noop,
		onBack: noop,
		onCreate: async () => {},
		onCopyLink: noop,
		...overrides
	});

const inputsOnScreen = () =>
	Array.from(document.querySelectorAll<HTMLInputElement>('input, textarea, select'));

test('the naming step presents exactly two fields: the name and a password', () => {
	loadLocale('en');
	setLocale('en');
	walk('name');

	const inputs = inputsOnScreen();

	expect(inputs.map((input) => input.getAttribute('name')).sort()).toEqual(['name', 'password']);
	expect(inputs.find((input) => input.name === 'password')?.type).toBe('password');
	expect(screen.getByText(en.organization.setup.nameLabel)).toBeDefined();
	expect(screen.getByText(en.organization.setup.passwordLabel)).toBeDefined();
	expect(screen.getByText(en.organization.setup.passwordFloor)).toBeDefined();
	expect(screen.getByRole('button', { name: en.organization.setup.create })).toBeDefined();
});

test('the connect step asks for nothing and says what has to be known first', () => {
	loadLocale('en');
	setLocale('en');
	walk('connect');

	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getByText(en.organization.setup.groupPreparation)).toBeDefined();
	expect(screen.getByText(en.organization.setup.accountCreation)).toBeDefined();
	expect(screen.getByText(en.organization.setup.succession)).toBeDefined();
	expect(screen.getByRole('button', { name: en.organization.setup.connect })).toBeDefined();
	expect(screen.getByRole('button', { name: en.organization.setup.openDashboard })).toBeDefined();
});

test('a granted consent offers the way on and the way to give the authority back', () => {
	loadLocale('en');
	setLocale('en');
	walk('connect', { consent: { status: 'granted', error: null } });

	expect(screen.getByText(en.organization.setup.connected)).toBeDefined();
	expect(screen.getByRole('button', { name: en.organization.setup.continue })).toBeDefined();
	expect(screen.getByRole('button', { name: en.organization.disconnectAction })).toBeDefined();
	expect(screen.queryByRole('button', { name: en.organization.setup.connect })).toBeNull();
});

test('an abandoned consent says nothing was created and offers the consent again', () => {
	loadLocale('en');
	setLocale('en');
	walk('connect', { consent: { status: 'abandoned', error: null } });

	expect(screen.getByText(en.organization.setup.consentAbandoned)).toBeDefined();
	expect(screen.getByRole('button', { name: en.organization.setup.connect })).toBeDefined();
});

test('the last step shows the link as a machine string and says when it is not yet sent', () => {
	loadLocale('en');
	setLocale('en');
	walk('done', {
		created: { organizationId: 'org-1', joinLink: 'rentable://join/abc', synced: false }
	});

	const link = document.querySelector('[data-join-link]');

	expect(link?.textContent).toBe('rentable://join/abc');
	expect(link?.getAttribute('dir')).toBe('ltr');
	expect(screen.getByText(en.organization.setup.notYetSent)).toBeDefined();
	expect(screen.getByRole('button', { name: en.organization.setup.copyLink })).toBeDefined();
});

// requirement 21: both locales, and the link still reads left to right under the Arabic one.
test('the walk renders in arabic with the same two fields and the link still left to right', () => {
	loadLocale('ar');
	setLocale('ar');
	walk('name');

	expect(
		inputsOnScreen()
			.map((input) => input.getAttribute('name'))
			.sort()
	).toEqual(['name', 'password']);
	expect(screen.getByText(ar.organization.setup.nameLabel)).toBeDefined();
	expect(screen.getByRole('button', { name: ar.organization.setup.create })).toBeDefined();

	walk('done', {
		created: { organizationId: 'org-1', joinLink: 'rentable://join/abc', synced: true }
	});

	expect(document.querySelector('[data-join-link]')?.getAttribute('dir')).toBe('ltr');
	expect(screen.getByText(ar.organization.setup.doneTitle)).toBeDefined();

	setLocale('en');
});
