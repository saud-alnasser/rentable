import { DesignProvider } from '@rentable/design/strings.js';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { expect, test } from 'vitest';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import StartupNoWorkspace from '$lib/layout/component/startup-no-workspace.svelte';
import StartupSignIn from '$lib/layout/component/startup-sign-in.svelte';
import { fakeHeldOrganization } from '$lib/platform/tests/testing.ts';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

/**
 * THE WALL, RENDERED
 *
 * What the card puts in the document for each of its two situations, in both locales. A locked
 * machine is the login page of the one organization it holds (effort 824, requirement 7): the
 * name as a line, a username and a password and nothing else that takes input, and the way out
 * at the foot, which asks once before it forgets the organization (requirement 20).
 *
 * The wall is rendered under `DesignProvider` because the disconnect's confirm is the design
 * package's delete dialog, and that reads the string contract from context.
 */

const noop = () => {};

const card = (
	situation: 'noOrganization' | 'locked',
	overrides: Partial<Parameters<typeof render<typeof StartupSignIn>>[1]> = {}
) =>
	render(
		StartupSignIn,
		{
			situation,
			organization: fakeHeldOrganization(),
			isSigningIn: false,
			errorMessage: null,
			onSignIn: noop,
			onDisconnect: noop,
			onSetUpOrganization: noop,
			onJoinByLink: noop,
			...overrides
		},
		{ wrapper: DesignProvider, wrapperProps: { strings, direction: 'ltr' } }
	);

const inputsOnScreen = () =>
	Array.from(document.querySelectorAll<HTMLInputElement>('input, textarea, select'));

const dialog = () => document.querySelector('[data-slot="dialog-content"]');

const dialogFooter = () =>
	Array.from(document.querySelectorAll<HTMLButtonElement>('[data-slot="dialog-footer"] button'));

test('a locked machine names the organization and asks for a username and a password, and nothing else', () => {
	loadLocale('en');
	setLocale('en');
	card('locked');

	const inputs = inputsOnScreen();

	expect(inputs.map((input) => input.getAttribute('name'))).toEqual(['username', 'password']);
	expect(inputs[1]?.type).toBe('password');
	expect(screen.queryAllByRole('radio')).toEqual([]);
	expect(document.querySelector('select')).toBeNull();
	expect(document.querySelector('[data-slot=select-trigger]')).toBeNull();
	expect(screen.getByText('Acme Rentals')).toBeDefined();
	expect(screen.getByText(en.layout.signIn.username)).toBeDefined();
	expect(screen.getByRole('button', { name: en.layout.signIn.unlock })).toBeDefined();
	expect(screen.getByText(en.layout.signIn.organizationDescription)).toBeDefined();
});

test('one organization is named as a line of text, with no role on it', () => {
	loadLocale('en');
	setLocale('en');
	card('locked');

	const line = document.querySelector('[data-sign-in-organization="acme"]');

	expect(line?.tagName).toBe('P');
	expect(line?.textContent?.trim()).toBe('Acme Rentals');
	expect(screen.queryByText(en.layout.signIn.roleOwner)).toBeNull();
});

test('submitting hands the username and the password to the sign-in', async () => {
	loadLocale('en');
	setLocale('en');
	const asked: [string, string][] = [];
	card('locked', { onSignIn: (username, password) => void asked.push([username, password]) });

	const [username, password] = inputsOnScreen();

	await fireEvent.input(username!, { target: { value: 'olivia' } });
	await fireEvent.input(password!, { target: { value: 'a long enough password' } });
	await fireEvent.submit(document.querySelector('form')!);

	expect(asked).toEqual([['olivia', 'a long enough password']]);
});

test('a machine that has joined nothing asks for nothing and offers the first run', () => {
	loadLocale('en');
	setLocale('en');
	card('noOrganization', { organization: null });

	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getByText(en.layout.signIn.noOrganizationTitle)).toBeDefined();
	// two ways in, each carrying its verb's glyph, and nothing else to read.
	const setUp = screen.getByRole('button', { name: en.layout.signIn.setUp });
	const connect = screen.getByRole('button', { name: en.layout.signIn.connectByLink });

	expect(setUp.querySelector('svg')).not.toBeNull();
	expect(connect.querySelector('svg')).not.toBeNull();
	expect(screen.getAllByRole('button')).toHaveLength(2);
	// nothing to disconnect from.
	expect(screen.queryByRole('button', { name: en.layout.signIn.disconnect })).toBeNull();
});

test('a pair that did not open is said on the wall, with the one sentence allowed', () => {
	loadLocale('en');
	setLocale('en');
	card('locked', { errorMessage: 'the sealed value did not open' });

	expect(screen.getByText('the sealed value did not open')).toBeDefined();
});

// requirement 16: both locales, and the same two fields under the same title and line.
test('the wall renders in arabic with the same two fields', () => {
	loadLocale('ar');
	setLocale('ar');
	card('locked');

	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual([
		'username',
		'password'
	]);
	expect(screen.getByText(ar.layout.signIn.username)).toBeDefined();
	expect(screen.getByText(ar.layout.signIn.organizationDescription)).toBeDefined();
	expect(screen.getByRole('button', { name: ar.layout.signIn.unlock })).toBeDefined();
	expect(screen.getByRole('button', { name: ar.layout.signIn.disconnect })).toBeDefined();

	setLocale('en');
});

// requirements 14 and 15: the unlock carries its verb, and each field its subject, muted.
test('the unlock button carries a glyph and both fields a muted leading one', () => {
	loadLocale('en');
	setLocale('en');
	card('locked');

	expect(
		screen.getByRole('button', { name: en.layout.signIn.unlock }).querySelector('svg')
	).not.toBeNull();

	for (const name of ['username', 'password']) {
		const input = document.querySelector(`input[name=${name}]`);
		const group = input?.closest('[data-slot=input-group]');
		const addon = group?.querySelector('[data-slot=input-group-addon]');

		expect(addon?.querySelector('svg')).not.toBeNull();
		expect(addon!.compareDocumentPosition(input!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(addon?.className).toContain('text-muted-foreground');
	}
});

// requirement 20: the way out is a link at the foot, and it asks once before it runs.
test('disconnect asks once, naming the organization, and confirming runs it', async () => {
	loadLocale('en');
	setLocale('en');
	let disconnected = 0;
	card('locked', { onDisconnect: () => void disconnected++ });

	expect(dialog()).toBeNull();

	await fireEvent.click(screen.getByRole('button', { name: en.layout.signIn.disconnect }));
	await tick();

	expect(dialog()).not.toBeNull();
	expect(dialog()?.querySelector('[data-slot=dialog-title]')?.textContent).toBe(
		en.layout.signIn.disconnect
	);
	expect(dialog()?.textContent).toContain('Acme Rentals');
	expect(dialog()?.textContent).toContain(en.layout.signIn.disconnectDescription);
	// nothing ran on opening the question.
	expect(disconnected).toBe(0);

	const confirm = dialogFooter().find(
		(button) => button.textContent?.trim() === en.layout.signIn.disconnect
	);

	expect(confirm).toBeDefined();
	await fireEvent.click(confirm!);
	await tick();

	expect(disconnected).toBe(1);
});

test('and leaving the question runs nothing', async () => {
	loadLocale('en');
	setLocale('en');
	let disconnected = 0;
	card('locked', { onDisconnect: () => void disconnected++ });

	await fireEvent.click(screen.getByRole('button', { name: en.layout.signIn.disconnect }));
	await tick();

	const leave = dialogFooter().find(
		(button) => button.textContent?.trim() !== en.layout.signIn.disconnect
	);

	await fireEvent.click(leave!);
	await tick();

	expect(disconnected).toBe(0);
});

test('a member with no workspace is told so, by organization name', () => {
	loadLocale('en');
	setLocale('en');
	render(StartupNoWorkspace, {
		organizationName: 'Acme Rentals',
		canCreate: true,
		isCreating: false,
		onCreate: () => {}
	});

	expect(screen.getByText(en.layout.noWorkspace.title)).toBeDefined();
	expect(screen.getByText(en.layout.noWorkspace.description)).toBeDefined();
	expect(screen.getByText('Acme Rentals')).toBeDefined();
	// the owner is offered the one way past it: a name, and a create.
	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual(['name']);

	// requirement 15 of the redesign: the field leads with its subject's glyph inside the input
	// group, and the glyph is muted rather than as dark as the label.
	const addon = document.querySelector('[data-slot=input-group-addon]');

	expect(addon).not.toBeNull();
	expect(addon?.querySelector('svg')).not.toBeNull();
	expect(addon?.className).toContain('text-muted-foreground');
	expect(addon?.parentElement?.getAttribute('data-slot')).toBe('input-group');
	expect(addon?.parentElement?.querySelector('input[name=name]')).not.toBeNull();

	// requirement 14: the create carries its verb's glyph before its label.
	const create = screen.getByRole('button', { name: en.layout.noWorkspace.create });

	expect(create.querySelector('svg')).not.toBeNull();
});

test('and in arabic', () => {
	loadLocale('ar');
	setLocale('ar');
	render(StartupNoWorkspace, {
		organizationName: 'شركة',
		canCreate: false,
		isCreating: false,
		onCreate: () => {}
	});

	expect(screen.getByText(ar.layout.noWorkspace.title)).toBeDefined();
	expect(screen.getByText('شركة')).toBeDefined();
	// and a member who is not the owner is told whose act it is, with nothing to press.
	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getByText(ar.layout.noWorkspace.ownerOnly)).toBeDefined();

	setLocale('en');
});
