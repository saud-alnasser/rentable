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
import type { HeldOrganization } from '$lib/organization/host.ts';
import { fakeSettings } from '$lib/settings/tests/testing.ts';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import Providers from '#tests/providers.svelte';
import { expectTheEye } from '#tests/password-eye.ts';

/**
 * THE WELCOME AND THE WALL, RENDERED
 *
 * What the first step of the way in puts in the document for each of its situations, in both
 * locales (effort 843, ticket 05). With no organization it is the welcome: the product's name, one
 * line, and two ways in of one size, and no switcher (effort 851, criterion 1). Locked, it is the
 * login page of the organization the record selects (effort 851, criterion 2): "sign in" as the
 * title, the organization switcher above a username and a password, one prominent "sign in", and
 * "can't sign in?" answered with a sentence. The switcher chooses another organization, adds one
 * through the welcome's two ways in, and removes one after the disconnect confirm (criteria 3 to
 * 6); the foot control carries the language and the appearance alone (criterion 15). The
 * no-workspace screen carries the same switcher (criterion 7).
 *
 * Rendered under the shared providers: the foot control reads the settings through a query, and
 * the remove's confirm is the design package's confirm dialog, which reads the string contract.
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

const acme = fakeHeldOrganization({ id: 'acme', name: 'Acme Rentals' });
const beta = fakeHeldOrganization({
	id: 'beta',
	name: 'Beta Lettings',
	holdsTursoAuthority: false
});

/** nothing held: the welcome's props. */
const nothingHeld = { organizations: [] as HeldOrganization[], selected: null };

const card = (
	situation: 'noOrganization' | 'locked' | 'signedOutElsewhere',
	overrides: Partial<Parameters<typeof render<typeof StartupSignIn>>[1]> = {}
) =>
	render(
		StartupSignIn,
		{
			situation,
			organizations: [acme],
			selected: 'acme',
			isSigningIn: false,
			errorMessage: null,
			onSignIn: noop,
			onSelect: noop,
			onRemove: noop,
			onSetUpOrganization: noop,
			onJoinByLink: noop,
			...overrides
		},
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

const switcher = () => document.querySelector<HTMLButtonElement>('[data-organization-switcher]');

/** open the switcher the way a pointer does. */
const openTheSwitcher = async () => {
	await fireEvent.click(switcher()!);
	await tick();
};

const inputsOnScreen = () =>
	Array.from(document.querySelectorAll<HTMLInputElement>('input, textarea, select'));

const dialog = () => document.querySelector('[data-slot="dialog-content"]');

const help = () => document.querySelector<HTMLButtonElement>('[data-sign-in-help]');

/** the buttons the step draws, which leaves out the foot control and what it opens. */
const stepButtons = () =>
	Array.from(document.querySelectorAll<HTMLButtonElement>('[data-way-in-content] button'));

/** open the foot control: the language and the appearance. */
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
		expect(screen.getByRole('button', { name: strings.common.actions.signIn })).toBeDefined();

		rendered.unmount();
	}

	// and the ordinary wall says nothing of the sort.
	loadLocale('en');
	setLocale('en');
	card('locked');

	expect(document.querySelector('[data-sign-in-signed-out-elsewhere]')).toBeNull();
});

// effort 851, criterion 2: with two held, the wall is titled "sign in", the switcher sits above
// the username naming the organization last signed in to, and that name is drawn once on the wall.
test('the wall is titled sign in, with the switcher above the username naming the chosen organization once', () => {
	loadLocale('en');
	setLocale('en');
	card('locked', { organizations: [acme, beta], selected: 'beta' });

	const inputs = inputsOnScreen();

	expect(inputs.map((input) => input.getAttribute('name'))).toEqual(['username', 'password']);
	expect(inputs[1]?.type).toBe('password');
	expect(screen.queryAllByRole('radio')).toEqual([]);
	expect(screen.getByRole('heading').textContent?.trim()).toBe(en.common.actions.signIn);
	// a phrase rather than a name, so it is raised to sentence case where it renders.
	expect(
		document.querySelector('[data-way-in-title]')?.classList.contains('first-letter:uppercase')
	).toBe(true);
	expect(document.querySelector('[data-way-in-description]')).toBeNull();

	// the switcher, above the username, naming the chosen organization and not the other.
	expect(switcher()).not.toBeNull();
	expect(
		switcher()!.compareDocumentPosition(inputs[0]!) & Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
	expect(switcher()?.textContent).toContain('Beta Lettings');
	expect(screen.getAllByText('Beta Lettings')).toHaveLength(1);
	expect(screen.queryByText('Acme Rentals')).toBeNull();
	expect(document.querySelector('[data-sign-in-organization="beta"]')).not.toBeNull();
	expect(screen.queryByText(en.layout.signIn.roleOwner)).toBeNull();
	expect(
		Array.from(document.querySelectorAll('label')).map((label) => label.textContent?.trim())
	).toEqual([en.layout.signIn.username, en.layout.signIn.password]);
});

test('the wall renders in arabic with the same two fields under its own title', () => {
	loadLocale('ar');
	setLocale('ar');
	card('locked');

	expect(screen.getByRole('heading').textContent?.trim()).toBe(ar.common.actions.signIn);
	expect(ar.common.actions.signIn).not.toEqual(en.common.actions.signIn);
	expect(switcher()?.textContent).toContain('Acme Rentals');
	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual([
		'username',
		'password'
	]);
	expect(screen.getByText(ar.layout.signIn.username)).toBeDefined();
	expect(screen.getByRole('button', { name: ar.common.actions.signIn })).toBeDefined();

	setLocale('en');
});

// effort 851, criteria 19 and 20: the wall's password carries the eye in both locales, named by
// the string contract's word for it, which the window supplies in the reader's language.
test("the wall's password field carries the eye, in both locales", async () => {
	for (const locale of ['en', 'ar'] as const) {
		loadLocale(locale);
		setLocale(locale);
		const rendered = card('locked');

		await expectTheEye(
			document.querySelector<HTMLInputElement>('#sign-in-password'),
			strings.showPassword
		);
		rendered.unmount();
	}

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

		const rendered = card('noOrganization', nothingHeld);

		expect(inputsOnScreen(), locale).toEqual([]);
		// nothing held, so nothing to switch between (effort 851, criterion 1).
		expect(switcher(), locale).toBeNull();
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

	const welcome = card('noOrganization', nothingHeld);

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
		const rendered = card(situation, situation === 'noOrganization' ? nothingHeld : {});

		// the one glyph a field carries is the password's eye at its trailing end, which is a
		// control rather than a decoration (effort 851, requirement 19); nothing leads a field. The
		// switcher's chevron says it opens a choice, as the workspace control's does.
		expect(
			document.querySelector('[data-slot=input-group-addon][data-align=inline-start]'),
			situation
		).toBeNull();
		expect(
			document.querySelector(
				'[data-way-in-content] button:not([data-password-eye]):not([data-organization-switcher]) svg'
			),
			situation
		).toBeNull();
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
		// centred under the fields, with the column (at the human's word on 2026-10-01).
		expect(answer?.className, locale).toContain('text-center');
		expect(answer?.textContent?.trim(), locale).toBe(strings.layout.signIn.helpAnswer);

		rendered.unmount();
	}

	loadLocale('en');
	setLocale('en');
});

// criterion 10 of ticket 05, and effort 851's criterion 15: the foot control is the only thing at
// the foot, and on the welcome and the wall alike it opens the language and the appearance and no
// other act. "Use a link" and "disconnect this machine" left it for the switcher.
test('the foot is the preferences control, and it opens the language and the appearance alone', async () => {
	loadLocale('en');
	setLocale('en');

	for (const situation of ['noOrganization', 'locked'] as const) {
		document.body.innerHTML = '';

		const rendered = card(situation, situation === 'noOrganization' ? nothingHeld : {});
		const foot = document.querySelector('[data-way-in-foot]');

		expect(foot?.querySelectorAll('button'), situation).toHaveLength(1);
		expect(foot?.querySelector('[data-way-in-preferences]'), situation).not.toBeNull();

		await openTheFoot();

		const content = document.querySelector('[data-slot=popover-content]');

		expect(content?.querySelector('[data-language-choice]'), situation).not.toBeNull();
		expect(content?.querySelector('[data-appearance="dark"]'), situation).not.toBeNull();
		expect(content?.textContent, situation).not.toContain(en.layout.signIn.disconnect);
		expect(content?.textContent, situation).not.toContain(en.layout.signIn.connectByLink);
		expect(content?.querySelector('[data-slot=separator]'), situation).toBeNull();

		rendered.unmount();
	}
});

// effort 851, criterion 6: while a sign-in runs the switcher is disabled, and opens nothing.
test('while a sign-in runs, the switcher is disabled and opens nothing', async () => {
	loadLocale('en');
	setLocale('en');
	document.body.innerHTML = '';

	card('locked', { organizations: [acme, beta], isSigningIn: true });

	expect(switcher()?.disabled).toBe(true);

	await openTheSwitcher();

	expect(document.querySelector('[role="menu"]')).toBeNull();
});

// review round 1 of effort 843: both fields are disabled while a sign-in runs, which drops the
// focus, so a failure puts the cursor back in the password rather than at the top of the window.
test('a sign-in that fails puts the cursor back in the password, with what was typed selected', async () => {
	loadLocale('en');
	setLocale('en');
	document.body.innerHTML = '';

	const rendered = card('locked', { isSigningIn: true });
	await tick();

	const password = document.querySelector<HTMLInputElement>('input[name="password"]')!;

	expect(document.activeElement).not.toBe(password);

	await fireEvent.input(password, { target: { value: 'a mistyped password' } });
	await rendered.rerender({ isSigningIn: false, errorMessage: 'that password did not open it' });

	await waitFor(() => expect(document.activeElement).toBe(password));
	expect(password.value).toBe('a mistyped password');
	expect([password.selectionStart, password.selectionEnd]).toEqual([0, password.value.length]);
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

// effort 851, criterion 3: choosing the other organization draws its wall, asking for its username
// and password. The choice is the record's, so the wall is drawn again from what the record says.
test('choosing the other organization draws its wall, asking for its username and password', async () => {
	loadLocale('en');
	setLocale('en');
	document.body.innerHTML = '';

	const chosen: string[] = [];
	const rendered = card('locked', {
		organizations: [acme, beta],
		onSelect: (id) => void chosen.push(id)
	});

	await fireEvent.input(inputsOnScreen()[0]!, { target: { value: 'olivia' } });
	await openTheSwitcher();
	await fireEvent.click(screen.getByRole('menuitemradio', { name: /Beta Lettings/ }));

	expect(chosen).toEqual(['beta']);

	// what the startup unit does with the choice: the record selects it, and the wall goes up anew.
	rendered.unmount();
	card('locked', { organizations: [acme, beta], selected: 'beta' });

	expect(switcher()?.textContent).toContain('Beta Lettings');
	expect(screen.getByRole('heading').textContent?.trim()).toBe(en.common.actions.signIn);
	expect(inputsOnScreen().map((input) => [input.getAttribute('name'), input.value])).toEqual([
		['username', ''],
		['password', '']
	]);
});

// effort 851, criterion 5, the component half: the x asks once, naming that row's organization, and
// only confirming removes it; the wall stays on the organization it was on.
test("a row's x asks once naming that organization, and confirming removes it alone", async () => {
	loadLocale('en');
	setLocale('en');
	document.body.innerHTML = '';

	const removed: string[] = [];
	const chosen: string[] = [];

	card('locked', {
		organizations: [acme, beta],
		onSelect: (id) => void chosen.push(id),
		onRemove: (id) => void removed.push(id)
	});
	await openTheSwitcher();

	expect(dialog()).toBeNull();

	await fireEvent.click(
		document.querySelector<HTMLElement>('[data-organization-switcher-remove="beta"]')!
	);
	await waitFor(() => expect(dialog()).not.toBeNull());

	expect(dialog()?.querySelector('[data-slot=dialog-title]')?.textContent).toBe(
		toTitleCase(en.layout.signIn.disconnect)
	);
	expect(dialog()?.textContent).toContain('Beta Lettings');
	// this machine holds no Turso consent for that one, so its line does not say one goes.
	expect(dialog()?.textContent).toContain(en.layout.signIn.disconnectDescriptionNoTurso);
	expect(removed).toEqual([]);
	expect(chosen).toEqual([]);

	const confirm = dialogFooter().find(
		(button) => button.textContent?.trim() === en.layout.signIn.disconnect
	);

	await fireEvent.click(confirm!);
	await waitFor(() => expect(removed).toEqual(['beta']));
	expect(chosen).toEqual([]);
	expect(switcher()?.textContent).toContain('Acme Rentals');
});

test('and leaving the question removes nothing', async () => {
	loadLocale('en');
	setLocale('en');
	document.body.innerHTML = '';

	const removed: string[] = [];

	card('locked', { onRemove: (id) => void removed.push(id) });
	await openTheSwitcher();
	await fireEvent.click(
		document.querySelector<HTMLElement>('[data-organization-switcher-remove="acme"]')!
	);
	await waitFor(() => expect(dialog()).not.toBeNull());

	// the one organization held is the chosen one, whose consent this machine holds.
	expect(dialog()?.textContent).toContain(en.layout.signIn.disconnectDescription);

	const leave = dialogFooter().find(
		(button) => button.textContent?.trim() !== en.layout.signIn.disconnect
	);

	await fireEvent.click(leave!);
	await tick();

	expect(removed).toEqual([]);
});

// effort 851, criterion 4: "add organization" shows set up and join by a link, and going back
// restores the wall of the organization that was chosen. Each way in goes where the welcome's does.
test('"add organization" shows set up and join, and back restores the wall it came from', async () => {
	loadLocale('en');
	setLocale('en');
	document.body.innerHTML = '';

	const went: string[] = [];

	card('locked', {
		organizations: [acme, beta],
		onSetUpOrganization: () => void went.push('set up'),
		onJoinByLink: () => void went.push('join')
	});
	await openTheSwitcher();
	await fireEvent.click(document.querySelector<HTMLElement>('[data-organization-switcher-add]')!);
	await tick();

	expect(screen.getByRole('heading').textContent?.trim()).toBe(en.organization.switcher.addTitle);
	expect(inputsOnScreen()).toEqual([]);
	expect(switcher()).toBeNull();

	const setUp = document.querySelector<HTMLElement>('[data-sign-in-set-up]')!;
	const join = document.querySelector<HTMLElement>('[data-sign-in-join]')!;

	expect(setUp.textContent).toContain(en.layout.signIn.setUp);
	expect(join.textContent).toContain(en.layout.signIn.connectByLink);

	await fireEvent.click(setUp);
	await fireEvent.click(join);

	expect(went).toEqual(['set up', 'join']);

	// back is the shared control, and it lands on the wall of the organization still chosen.
	await fireEvent.click(document.querySelector<HTMLElement>('[data-back-control]')!);
	await tick();

	expect(screen.getByRole('heading').textContent?.trim()).toBe(en.common.actions.signIn);
	expect(switcher()?.textContent).toContain('Acme Rentals');
	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual([
		'username',
		'password'
	]);
});

// effort 851, criterion 4: a finished add has selected the new organization in the record, so the
// wall that comes up after it is the new one's, with the earlier ones still in the switcher.
test("after a finished add, the wall is the new organization's, with every held one in the switcher", async () => {
	loadLocale('en');
	setLocale('en');
	document.body.innerHTML = '';

	const gamma = fakeHeldOrganization({ id: 'gamma', name: 'Gamma Homes' });

	card('locked', { organizations: [acme, beta, gamma], selected: 'gamma' });

	expect(switcher()?.textContent).toContain('Gamma Homes');

	await openTheSwitcher();

	expect(
		screen
			.getAllByRole('menuitemradio')
			.map((row) => [
				row.querySelector('span.truncate')?.textContent,
				row.getAttribute('aria-checked')
			])
	).toEqual([
		['Acme Rentals', 'false'],
		['Beta Lettings', 'false'],
		['Gamma Homes', 'true']
	]);
});

/** the no-workspace screen, under the providers its foot control and surface read. */
const noWorkspace = (
	props: Partial<Parameters<typeof render<typeof StartupNoWorkspace>>[1]> = {}
) =>
	render(
		StartupNoWorkspace,
		{
			organizations: [acme, beta],
			selected: 'acme',
			canCreate: true,
			isCreating: false,
			onCreate: () => {},
			onSelect: noop,
			onRemove: noop,
			onSetUpOrganization: noop,
			onJoinByLink: noop,
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
	expect(switcher()?.textContent).toContain('Acme Rentals');
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
	noWorkspace({
		organizations: [fakeHeldOrganization({ id: 'acme', name: 'شركة' })],
		canCreate: false
	});

	expect(screen.getByRole('heading').textContent?.trim()).toBe(ar.layout.noWorkspace.title);
	expect(switcher()?.textContent).toContain('شركة');
	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getByText(ar.layout.noWorkspace.ownerOnly)).toBeDefined();
	// the switcher is the one control on the step: nothing here is the member's to press but it.
	expect(stepButtons()).toEqual([switcher()]);

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

// at the human's word on 2026-10-01: neither screen's foot offers a way to all the settings.
test('the foot offers no way to all settings, on the welcome or the no-workspace screen', async () => {
	loadLocale('en');
	setLocale('en');
	document.body.innerHTML = '';

	const welcome = card('noOrganization', nothingHeld);
	await openTheFoot();

	expect(document.querySelector('[data-language-choice]')).not.toBeNull();
	expect(document.querySelector('a[href="/settings"]')).toBeNull();
	welcome.unmount();
	document.body.innerHTML = '';

	noWorkspace();
	await openTheFoot();

	expect(document.querySelector('[data-language-choice]')).not.toBeNull();
	expect(document.querySelector('a[href="/settings"]')).toBeNull();
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

// effort 851, criterion 7: the no-workspace screen carries the switcher for the owner and for every
// other member, with switch, add and remove; choosing and adding are handed back to the root, which
// signs out first, and removing another leaves the screen where it is.
test('the no-workspace screen carries the switcher with switch, add and remove, for the owner and a member', async () => {
	loadLocale('en');
	setLocale('en');

	for (const canCreate of [true, false]) {
		document.body.innerHTML = '';

		const asked: string[] = [];
		const rendered = noWorkspace({
			canCreate,
			onSelect: (id) => void asked.push(`select:${id}`),
			onRemove: (id) => void asked.push(`remove:${id}`),
			onSetUpOrganization: () => void asked.push('set up'),
			onJoinByLink: () => void asked.push('join')
		});

		expect(switcher(), `${canCreate}`).not.toBeNull();

		await openTheSwitcher();
		await fireEvent.click(screen.getByRole('menuitemradio', { name: /Beta Lettings/ }));

		await openTheSwitcher();
		await fireEvent.click(
			document.querySelector<HTMLElement>('[data-organization-switcher-remove="beta"]')!
		);
		await waitFor(() => expect(dialog()).not.toBeNull());
		await fireEvent.click(
			dialogFooter().find((button) => button.textContent?.trim() === en.layout.signIn.disconnect)!
		);
		await waitFor(() => expect(asked).toContain('remove:beta'));
		await waitFor(() => expect(dialog()).toBeNull());

		await openTheSwitcher();
		await fireEvent.click(document.querySelector<HTMLElement>('[data-organization-switcher-add]')!);
		await tick();

		expect(screen.getByRole('heading').textContent?.trim()).toBe(en.organization.switcher.addTitle);

		await fireEvent.click(document.querySelector<HTMLElement>('[data-sign-in-set-up]')!);
		await fireEvent.click(document.querySelector<HTMLElement>('[data-sign-in-join]')!);

		expect(asked, `${canCreate}`).toEqual(['select:beta', 'remove:beta', 'set up', 'join']);

		// back is the screen it came from.
		await fireEvent.click(document.querySelector<HTMLElement>('[data-back-control]')!);
		await tick();

		expect(screen.getByRole('heading').textContent?.trim()).toBe(en.layout.noWorkspace.title);

		rendered.unmount();
	}
});

// effort 851, criterion 6: while a workspace is being created the switcher is disabled.
test('while a workspace is being created, the no-workspace switcher is disabled', async () => {
	loadLocale('en');
	setLocale('en');
	document.body.innerHTML = '';

	noWorkspace({ isCreating: true });

	expect(switcher()?.disabled).toBe(true);

	await openTheSwitcher();

	expect(document.querySelector('[role="menu"]')).toBeNull();
});
