import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeAll, expect, test, vi } from 'vitest';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { toTitleCase } from '@rentable/design/title-case.js';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import StartupNoWorkspace from '$lib/startup/component/no-workspace.svelte';
import StartupSignIn from '$lib/startup/component/sign-in.svelte';
import { fakeHeldOrganization } from '$lib/organization/tests/testing.ts';
import { fakeSettings } from '$lib/settings/tests/testing.ts';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import Providers from '#tests/providers.svelte';

/**
 * THE WELCOME AND THE WALL, RENDERED
 *
 * What the first step of the way in puts in the document for each of its situations, in both
 * locales (effort 843, ticket 05). With no organization it is the welcome: the product's name, one
 * line, and two ways in of one size. Locked, it is the login page of the one organization this
 * machine holds (effort 824, requirement 7): the name as the title, a username and a password, one
 * prominent "sign in", and "can't sign in?" answered with a sentence. The two ways out of a jam,
 * the link and disconnect, are in the foot control's popover, and disconnect asks once before it
 * forgets the organization (requirement 20).
 *
 * Rendered under the shared providers: the foot control reads the settings through a query, and
 * the disconnect's confirm is the design package's delete dialog, which reads the string contract.
 */

// the one piece of SvelteKit a superforms submit reaches that this runner cannot supply, as the
// walk's tests mock it: the no-workspace form is a superform.
vi.mock('$app/forms', async (original) => ({
	...(await original<Record<string, unknown>>()),
	applyAction: async () => {}
}));

// the settings the foot control reads, which a test has no shell to ask.
vi.mock('$lib/api/caller', () => ({
	default: { settings: { get: async () => fakeSettings(), set: async () => fakeSettings() } }
}));

beforeAll(() => {
	// the popover's floating-ui measures with a `ResizeObserver`, and the appearance it opens reads
	// the system's through `matchMedia`; jsdom has neither.
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
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

const inputsOnScreen = () =>
	Array.from(document.querySelectorAll<HTMLInputElement>('input, textarea, select'));

const dialog = () => document.querySelector('[data-slot="dialog-content"]');

const help = () => document.querySelector<HTMLButtonElement>('[data-sign-in-help]');

/** the buttons the step draws, which leaves out the foot control and what it opens. */
const stepButtons = () =>
	Array.from(document.querySelectorAll<HTMLButtonElement>('[data-way-in-content] button'));

/** open the foot control, which on the wall is where both ways out of a jam are. */
const openTheFoot = async () => {
	await fireEvent.click(document.querySelector<HTMLElement>('[data-way-in-preferences]')!);
	await tick();
};

const dialogFooter = () =>
	Array.from(document.querySelectorAll<HTMLButtonElement>('[data-slot="dialog-footer"] button'));

/** whether a button is drawn prominent: the filled primary variant, which only one per step is. */
const isProminent = (button: HTMLElement) => button.className.includes('bg-primary');

// criterion 22 of effort 826: a machine somebody signed out from another one is the wall with the
// reason on it, in both locales. The way through is still the password, so the fields are the
// same fields.
test('a machine signed out from another one reads the same wall with the reason on it', () => {
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

	// and the ordinary wall says nothing of the sort.
	loadLocale('en');
	setLocale('en');
	card('locked');

	expect(document.querySelector('[data-sign-in-signed-out-elsewhere]')).toBeNull();
});

// effort 826, requirement 11 as corrected on 2026-09-15: the organization this machine holds is
// the title, drawn as it is written, with one line under it saying what to do.
test('the wall is headed by the organization it holds, and asks for a username and a password', () => {
	loadLocale('en');
	setLocale('en');
	card('locked');

	const inputs = inputsOnScreen();

	expect(inputs.map((input) => input.getAttribute('name'))).toEqual(['username', 'password']);
	expect(inputs[1]?.type).toBe('password');
	expect(screen.queryAllByRole('radio')).toEqual([]);
	expect(screen.getByRole('heading').textContent?.trim()).toBe('Acme Rentals');
	expect(
		document.querySelector('[data-way-in-title]')?.classList.contains('first-letter:uppercase')
	).toBe(false);
	expect(screen.getByText(en.layout.signIn.subtitle)).toBeDefined();
	expect(screen.getAllByText('Acme Rentals')).toHaveLength(1);
	expect(document.querySelector('[data-sign-in-organization="acme"]')).not.toBeNull();
	expect(screen.queryByText(en.layout.signIn.roleOwner)).toBeNull();
	expect(
		Array.from(document.querySelectorAll('label')).map((label) => label.textContent?.trim())
	).toEqual([en.layout.signIn.username, en.layout.signIn.password]);
});

test('the wall renders in arabic with the same two fields and its own line', () => {
	loadLocale('ar');
	setLocale('ar');
	card('locked');

	expect(screen.getByRole('heading').textContent?.trim()).toBe('Acme Rentals');
	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual([
		'username',
		'password'
	]);
	expect(screen.getByText(ar.layout.signIn.username)).toBeDefined();
	expect(screen.getByText(ar.layout.signIn.subtitle)).toBeDefined();
	expect(ar.layout.signIn.subtitle).not.toEqual(en.layout.signIn.subtitle);
	expect(screen.getByRole('button', { name: ar.common.actions.signIn })).toBeDefined();

	setLocale('en');
});

// requirement 8: arriving puts the cursor in the first field, Enter signs in, and no password is
// ever filled in for the person.
test('arriving at the wall focuses the username, the password is empty, and Enter signs in', async () => {
	loadLocale('en');
	setLocale('en');
	const asked: [string, string][] = [];
	card('locked', { onSignIn: (username, password) => void asked.push([username, password]) });
	await tick();
	await tick();

	const [username, password] = inputsOnScreen();

	expect(document.activeElement).toBe(username);
	expect(password?.value).toBe('');

	await fireEvent.input(username!, { target: { value: 'olivia' } });
	await fireEvent.input(password!, { target: { value: 'a long enough password' } });
	// what Enter in a field of a form with a submit button does.
	await fireEvent.submit(document.querySelector('form')!);

	expect(asked).toEqual([['olivia', 'a long enough password']]);
});

// requirements 2 and 3, and criteria 2 and 3: the welcome is the product's name as it is written,
// one line saying what it is for, and two ways in of one size, each a label over whose it is. A
// group, a database and a consent are the walk's own machinery and say nothing to somebody
// deciding which of the two is theirs.
test('the welcome offers two ways in, one size, each saying whose it is', () => {
	for (const [locale, strings, machinery] of [
		['en', en, ['group', 'database', 'consent']],
		['ar', ar, ['مجموع', 'قاعدة بيانات', 'موافق']]
	] as const) {
		loadLocale(locale);
		setLocale(locale);

		const rendered = card('noOrganization', { organization: null });

		expect(inputsOnScreen(), locale).toEqual([]);
		expect(screen.getByRole('heading').textContent?.trim(), locale).toBe('rentable');
		expect(
			document.querySelector('[data-way-in-title]')?.classList.contains('first-letter:uppercase'),
			locale
		).toBe(false);
		expect(screen.getByText(strings.layout.signIn.noOrganizationSubtitle), locale).toBeDefined();

		const setUp = document.querySelector<HTMLElement>('[data-sign-in-set-up]')!;
		const join = document.querySelector<HTMLElement>('[data-sign-in-join]')!;

		expect(stepButtons(), locale).toEqual([setUp, join]);
		expect(setUp.textContent, locale).toContain(strings.layout.signIn.setUp);
		expect(setUp.textContent, locale).toContain(strings.layout.signIn.setUpDescription);
		expect(join.textContent, locale).toContain(strings.layout.signIn.connectByLink);
		expect(join.textContent, locale).toContain(strings.layout.signIn.connectByLinkDescription);

		// one size, both stacked full width, and only the first prominent: the large size's padding,
		// grown to hold the line under the label, on both.
		for (const button of [setUp, join]) {
			expect(button.className, locale).toContain('px-4');
			expect(button.className, locale).toContain('h-auto w-full');
		}

		expect(stepButtons().filter(isProminent), locale).toEqual([setUp]);

		const said = (document.body.textContent ?? '').toLowerCase();

		for (const word of machinery) {
			expect(said, `${locale}: ${word}`).not.toContain(word);
		}

		rendered.unmount();
	}

	setLocale('en');
});

// criterion 5: one prominent button on each screen.
test('the welcome and the wall each draw exactly one prominent button', () => {
	loadLocale('en');
	setLocale('en');

	const welcome = card('noOrganization', { organization: null });

	expect(stepButtons().filter(isProminent)).toHaveLength(1);
	welcome.unmount();

	card('locked');

	const [signIn] = stepButtons().filter(isProminent);

	expect(stepButtons().filter(isProminent)).toHaveLength(1);
	expect(signIn?.textContent?.trim()).toBe(en.common.actions.signIn);
});

// requirement 8 of effort 843: a field is a label and its input, with no glyph inside it, and a
// button's glyph stays only where it is recognisable on its own, which none of these are.
test('neither screen draws a glyph in a field or on its buttons, nor a back or a position', () => {
	loadLocale('en');
	setLocale('en');

	for (const situation of ['noOrganization', 'locked'] as const) {
		const rendered = card(situation, situation === 'noOrganization' ? { organization: null } : {});

		expect(document.querySelector('[data-slot=input-group-addon]'), situation).toBeNull();
		expect(document.querySelector('[data-way-in-content] button svg'), situation).toBeNull();
		expect(document.querySelector('[data-back-control]'), situation).toBeNull();
		expect(document.querySelector('[data-way-in-position]'), situation).toBeNull();

		rendered.unmount();
	}
});

// at the human's word on 2026-10-01: "can't sign in?" is answered, in its place, with who can help.
test("pressing can't sign in? replaces it with the one sentence, said as a status", async () => {
	for (const [locale, strings] of [
		['en', en],
		['ar', ar]
	] as const) {
		loadLocale(locale);
		setLocale(locale);

		const rendered = card('locked');

		expect(help()?.textContent?.trim(), locale).toBe(strings.layout.signIn.help);
		expect(document.querySelector('[data-sign-in-help-answer]'), locale).toBeNull();

		await fireEvent.click(help()!);
		await tick();

		const answer = document.querySelector('[data-sign-in-help-answer]');

		expect(help(), locale).toBeNull();
		expect(answer?.getAttribute('role'), locale).toBe('status');
		expect(answer?.textContent?.trim(), locale).toBe(strings.layout.signIn.helpAnswer);

		rendered.unmount();
	}

	loadLocale('en');
	setLocale('en');
});

// criterion 10 of ticket 05: the foot control is the only thing at the foot, and the wall alone
// hands it the two ways out of a jam.
test('the foot is the preferences control, and only the wall hands it the link and disconnect', async () => {
	loadLocale('en');
	setLocale('en');

	const welcome = card('noOrganization', { organization: null });
	const welcomeFoot = document.querySelector('[data-way-in-foot]');

	expect(welcomeFoot?.querySelectorAll('button')).toHaveLength(1);
	expect(welcomeFoot?.querySelector('[data-way-in-preferences]')).not.toBeNull();

	await openTheFoot();

	expect(screen.queryByRole('button', { name: en.layout.signIn.useALink })).toBeNull();
	expect(screen.queryByRole('button', { name: en.layout.signIn.disconnect })).toBeNull();
	welcome.unmount();
	document.body.innerHTML = '';

	let joined = 0;

	card('locked', { onJoinByLink: () => void joined++ });

	const wallFoot = document.querySelector('[data-way-in-foot]');

	expect(wallFoot?.querySelectorAll('button')).toHaveLength(1);

	await openTheFoot();

	const link = screen.getByRole('button', { name: en.layout.signIn.useALink });

	expect(screen.getByRole('button', { name: en.layout.signIn.disconnect })).toBeDefined();
	// nothing about either is on the step itself.
	expect(document.querySelector('[data-way-in-content]')?.textContent).not.toContain(
		en.layout.signIn.useALink
	);

	await fireEvent.click(link);

	expect(joined).toBe(1);
});

test('a pair that did not open is said on the wall, with the one sentence allowed', () => {
	loadLocale('en');
	setLocale('en');
	card('locked', { errorMessage: 'the sealed value did not open' });

	expect(screen.getByText('the sealed value did not open')).toBeDefined();
});

// effort 832, requirement 23: a failure nobody can act on reads as its sentence, and what the
// shell said behind it is reachable only by asking for it.
test('what the shell said behind a failure is behind details, closed, in arabic', async () => {
	loadLocale('ar');
	setLocale('ar');

	const english = 'failed to read vault.json: permission denied';

	card('locked', { errorMessage: ar.common.errors.io, errorDetail: english });

	expect(screen.getByText(ar.common.errors.io)).toBeDefined();
	expect(document.querySelector('[data-error-detail="sign-in"]')).not.toBeNull();
	expect(document.body.textContent).not.toContain(english);

	await fireEvent.click(screen.getByRole('button', { name: ar.common.actions.details }));
	await tick();

	expect(document.querySelector('[data-error-detail-text="sign-in"]')?.textContent?.trim()).toBe(
		english
	);

	setLocale('en');
});

// effort 824, requirement 20: a person with neither a username nor a password still takes this
// machine out of the organization, from the foot control, and it asks once before it runs.
test('disconnect is in the foot, asks once naming the organization, and confirming runs it', async () => {
	loadLocale('en');
	setLocale('en');
	document.body.innerHTML = '';
	let disconnected = 0;
	card('locked', { onDisconnect: () => void disconnected++ });
	await openTheFoot();

	expect(dialog()).toBeNull();

	await fireEvent.click(screen.getByRole('button', { name: en.layout.signIn.disconnect }));
	await tick();

	expect(dialog()).not.toBeNull();
	expect(dialog()?.querySelector('[data-slot=dialog-title]')?.textContent).toBe(
		toTitleCase(en.layout.signIn.disconnect)
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
	document.body.innerHTML = '';
	let disconnected = 0;
	card('locked', { onDisconnect: () => void disconnected++ });
	await openTheFoot();

	await fireEvent.click(screen.getByRole('button', { name: en.layout.signIn.disconnect }));
	await tick();

	const leave = dialogFooter().find(
		(button) => button.textContent?.trim() !== en.layout.signIn.disconnect
	);

	await fireEvent.click(leave!);
	await tick();

	expect(disconnected).toBe(0);
});

/** the no-workspace screen, under the providers its foot control and surface read. */
const noWorkspace = (
	props: Partial<Parameters<typeof render<typeof StartupNoWorkspace>>[1]> = {}
) =>
	render(
		StartupNoWorkspace,
		{
			organizationName: 'Acme Rentals',
			canCreate: true,
			isCreating: false,
			onCreate: () => {},
			...props
		},
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

// effort 843, ticket 08: the no-workspace screen is the way in's last step, on its surface, with
// one prominent create for the owner and the field with no glyph.
test('a member with no workspace is told so, by organization name, on the way-in surface', () => {
	loadLocale('en');
	setLocale('en');
	noWorkspace();

	expect(document.querySelector('[data-way-in-surface]')).not.toBeNull();
	expect(screen.getByRole('heading').textContent?.trim()).toBe(en.layout.noWorkspace.title);
	expect(screen.getByText(en.layout.noWorkspace.description)).toBeDefined();
	expect(screen.getByText('Acme Rentals')).toBeDefined();
	// the owner is offered the one way past it: a name, and a create.
	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual(['name']);
	expect(document.querySelector('[data-slot=input-group-addon]')).toBeNull();

	const create = screen.getByRole('button', { name: en.layout.noWorkspace.create });

	expect(create.querySelector('svg')).toBeNull();
	expect(stepButtons().filter(isProminent)).toEqual([create]);
});

test('and in arabic, a member who is not the owner is told whose act it is', () => {
	loadLocale('ar');
	setLocale('ar');
	noWorkspace({ organizationName: 'شركة', canCreate: false });

	expect(screen.getByRole('heading').textContent?.trim()).toBe(ar.layout.noWorkspace.title);
	expect(screen.getByText('شركة')).toBeDefined();
	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getByText(ar.layout.noWorkspace.ownerOnly)).toBeDefined();
	expect(stepButtons()).toEqual([]);

	setLocale('en');
});

// requirement 8: arriving puts the owner's cursor in the name, and Enter creates.
test('for the owner, the name is focused on arrival and Enter creates', async () => {
	loadLocale('en');
	setLocale('en');

	const created: string[] = [];

	noWorkspace({ onCreate: (name) => void created.push(name) });

	const name = document.querySelector<HTMLInputElement>('input[name="name"]')!;

	await waitFor(() => expect(document.activeElement).toBe(name));

	await fireEvent.input(name, { target: { value: 'North Properties' } });
	await fireEvent.submit(document.querySelector('form')!);

	await waitFor(() => expect(created).toEqual(['North Properties']));
});

test('the no-workspace screen carries the preferences control at its foot, and nothing else there', () => {
	loadLocale('en');
	setLocale('en');
	noWorkspace();

	const foot = document.querySelector('[data-way-in-foot]');

	expect(foot?.querySelectorAll('button')).toHaveLength(1);
	expect(foot?.querySelector('[data-way-in-preferences]')).not.toBeNull();
});

// effort 838, criterion 18: where this machine's `app.db` holds the records of an earlier version,
// the way in says so in one quiet line, whichever situation the wall is in, and says nothing
// where it does not.
test('the earlier records are one line on the wall, and only where there are some', () => {
	const earlierLine = () => document.querySelector<HTMLElement>('[data-sign-in-earlier]');

	for (const [locale, strings] of [
		['en', en],
		['ar', ar]
	] as const) {
		loadLocale(locale);
		setLocale(locale);

		for (const situation of ['noOrganization', 'locked'] as const) {
			const without = card(situation);

			expect(earlierLine()).toBeNull();
			without.unmount();

			const withRecords = card(situation, { earlier: { version: '0.13.0' } });
			const line = earlierLine();

			expect(line?.textContent?.trim()).toBe(
				strings.earlier.wayIn.replace(/{version(:string)?}/, '0.13.0')
			);
			expect(line?.dataset.signInEarlier).toBe('0.13.0');
			// a line and nothing to press: the records are brought in from the settings area.
			expect(line?.querySelector('button, a')).toBeNull();
			withRecords.unmount();
		}
	}
});
