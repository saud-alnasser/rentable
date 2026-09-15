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
 * name as the heading, a username and a password and nothing else that takes input, and one quiet
 * control at the foot holding both ways out of a jam (effort 826, requirement 11 as corrected on
 * 2026-09-15), one of which asks once before it forgets the organization (requirement 20).
 *
 * The wall is rendered under `DesignProvider` because the disconnect's confirm is the design
 * package's delete dialog, and that reads the string contract from context.
 */

const noop = () => {};

const card = (
	situation: 'noOrganization' | 'locked' | 'signedOutElsewhere',
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

const help = () => document.querySelector<HTMLButtonElement>('[data-sign-in-help]');

const disclosed = () => document.querySelector('[data-slot="collapsible-content"]');

/** open the foot's disclosure, which is where both ways out of a jam are. */
const openHelp = async () => {
	await fireEvent.click(help()!);
	await tick();
};

const dialogFooter = () =>
	Array.from(document.querySelectorAll<HTMLButtonElement>('[data-slot="dialog-footer"] button'));

// criterion 22 of effort 826: a machine somebody signed out from another one is the locked card
// with the reason on it, in both locales. The way through is still the password, so the fields
// are the same fields.
test('a machine signed out from another one reads the same card with the reason on it', () => {
	for (const [locale, strings] of [
		['en', en],
		['ar', ar]
	] as const) {
		loadLocale(locale);
		setLocale(locale);

		const rendered = card('signedOutElsewhere');

		expect(document.querySelector('[data-sign-in-signed-out-elsewhere]')?.textContent?.trim()).toBe(
			strings.layout.signIn.signedOutElsewhere
		);
		expect(
			inputsOnScreen().map((input) => input.getAttribute('name')),
			locale
		).toEqual(['username', 'password']);
		expect(screen.getByText(strings.common.actions.signIn)).toBeDefined();

		rendered.unmount();
	}

	// and the ordinary locked card says nothing of the sort.
	loadLocale('en');
	setLocale('en');
	card('locked');

	expect(document.querySelector('[data-sign-in-signed-out-elsewhere]')).toBeNull();
});

// effort 826, requirement 11 as corrected on 2026-09-15: the organization this machine holds is
// the card's heading, with one line under it saying what to do, and the fields are the only thing
// on the card that takes input.
test('a locked machine is headed by the organization it holds, and asks for a username and a password', () => {
	loadLocale('en');
	setLocale('en');
	card('locked');

	const inputs = inputsOnScreen();

	expect(inputs.map((input) => input.getAttribute('name'))).toEqual(['username', 'password']);
	expect(inputs[1]?.type).toBe('password');
	expect(screen.queryAllByRole('radio')).toEqual([]);
	expect(document.querySelector('select')).toBeNull();
	expect(document.querySelector('[data-slot=select-trigger]')).toBeNull();
	expect(screen.getByRole('heading').textContent?.trim()).toBe('Acme Rentals');
	expect(screen.getByText(en.layout.signIn.subtitle)).toBeDefined();
	expect(screen.getByText(en.layout.signIn.username)).toBeDefined();
	expect(screen.getByRole('button', { name: en.common.actions.signIn })).toBeDefined();
});

test('and the labelled organization line is gone, with no role in its place', () => {
	loadLocale('en');
	setLocale('en');
	card('locked');

	// the name is the heading and nothing else says it: a field labelled "organization" standing
	// over the same words was the card saying one thing twice, under a label answering a question
	// nobody standing here has.
	expect(screen.getAllByText('Acme Rentals')).toHaveLength(1);
	expect(document.querySelector('[data-sign-in-organization="acme"]')).not.toBeNull();
	expect(screen.queryByText(en.layout.signIn.roleOwner)).toBeNull();
	expect(document.querySelector('#sign-in-organization')).toBeNull();
	expect(
		Array.from(document.querySelectorAll('label')).map((label) => label.textContent?.trim())
	).toEqual([en.layout.signIn.username, en.layout.signIn.password]);
});

// the same card in arabic: a name is a name in either language, and the line under it and the
// disclosure at the foot are each written in their own.
test('and the heading and the line under it read the same way in arabic', () => {
	loadLocale('ar');
	setLocale('ar');
	card('locked');

	expect(screen.getByRole('heading').textContent?.trim()).toBe('Acme Rentals');
	expect(screen.getByText(ar.layout.signIn.subtitle)).toBeDefined();
	expect(ar.layout.signIn.subtitle).not.toEqual(en.layout.signIn.subtitle);

	setLocale('en');
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
	expect(screen.getByRole('heading').textContent?.trim()).toBe(
		en.layout.signIn.noOrganizationTitle
	);
	expect(screen.getByText(en.layout.signIn.noOrganizationSubtitle)).toBeDefined();
	// two ways in, each carrying its verb's glyph, and nothing else to read.
	const setUp = screen.getByRole('button', { name: en.layout.signIn.setUp });
	const connect = screen.getByRole('button', { name: en.layout.signIn.connectByLink });

	expect(setUp.querySelector('svg')).not.toBeNull();
	expect(connect.querySelector('svg')).not.toBeNull();
	expect(screen.getAllByRole('button')).toHaveLength(2);
	// nothing to disconnect from, and so nothing for a disclosure to hold.
	expect(help()).toBeNull();
	expect(screen.queryByRole('button', { name: en.layout.signIn.disconnect })).toBeNull();
});

// effort 826, requirement 11 as corrected on 2026-09-15: the two ways out of a jam sit behind one
// quiet control at the foot, so neither competes with the form, and a person who cannot sign in
// still reaches both. Neither is drawn until the control is opened.
test('the ways out of a jam are behind one disclosure, closed on every render, in both locales', async () => {
	for (const [locale, strings] of [
		['en', en],
		['ar', ar]
	] as const) {
		loadLocale(locale);
		setLocale(locale);

		const rendered = card('locked');

		expect(help()?.tagName, locale).toBe('BUTTON');
		expect(help()?.textContent?.trim(), locale).toBe(strings.layout.signIn.help);
		expect(help()?.getAttribute('aria-expanded'), locale).toBe('false');
		expect(screen.queryByText(strings.layout.signIn.useALink), locale).toBeNull();
		expect(screen.queryByText(strings.layout.signIn.disconnect), locale).toBeNull();

		await openHelp();

		expect(help()?.getAttribute('aria-expanded'), locale).toBe('true');

		const link = screen.getByRole('button', { name: strings.layout.signIn.useALink });
		const disconnect = screen.getByRole('button', { name: strings.layout.signIn.disconnect });

		// two rows and nothing else, reached by keyboard in the order they are read: the link
		// somebody was handed first, and taking this machine out of the organization second.
		expect(disclosed()?.querySelectorAll('button'), locale).toHaveLength(2);
		expect(link.tabIndex, locale).toBe(0);
		expect(disconnect.tabIndex, locale).toBe(0);
		expect(
			link.compareDocumentPosition(disconnect) & Node.DOCUMENT_POSITION_FOLLOWING,
			locale
		).toBeTruthy();

		rendered.unmount();
	}

	loadLocale('en');
	setLocale('en');
});

// a reset link is opened by somebody whose machine already holds the organization, so the locked
// wall has to reach the connect screen. The two fields and the unlock are untouched by it, which
// the first test reads.
test('the disclosed link row opens the connect screen', async () => {
	loadLocale('en');
	setLocale('en');

	let asked = 0;

	card('locked', { onJoinByLink: () => void asked++ });
	await openHelp();

	const useALink = screen.getByRole('button', { name: en.layout.signIn.useALink });

	// a text row rather than a second way in: the fields are the way in, and this is the
	// exception to them.
	expect(useALink.getAttribute('data-slot')).toBe('button');
	expect(useALink.className).toContain('underline-offset-4');

	await fireEvent.click(useALink);

	expect(asked).toBe(1);
});

// and it is the locked wall's alone: a machine that holds nothing is already offered the connect
// screen as one of its two ways in, and the count in that test is what keeps a third off it.
test('a machine that holds nothing does not repeat the link control', () => {
	loadLocale('en');
	setLocale('en');
	card('noOrganization', { organization: null });

	expect(screen.queryByRole('button', { name: en.layout.signIn.useALink })).toBeNull();
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
	expect(screen.getByText(ar.layout.signIn.subtitle)).toBeDefined();
	expect(screen.getByRole('button', { name: ar.common.actions.signIn })).toBeDefined();

	setLocale('en');
});

// requirements 14 and 15: the unlock carries its verb, and each field its subject, muted.
test('the unlock button carries a glyph and both fields a muted leading one', () => {
	loadLocale('en');
	setLocale('en');
	card('locked');

	expect(
		screen.getByRole('button', { name: en.common.actions.signIn }).querySelector('svg')
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

// requirement 20: the way out is a text row at the foot, and it asks once before it runs.
test('disconnect asks once, naming the organization, and confirming runs it', async () => {
	loadLocale('en');
	setLocale('en');
	let disconnected = 0;
	card('locked', { onDisconnect: () => void disconnected++ });
	await openHelp();

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
	await openHelp();

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
