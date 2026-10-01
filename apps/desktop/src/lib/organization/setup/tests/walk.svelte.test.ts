import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeAll, expect, test, vi } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { i18nObject } from '$lib/i18n/i18n-util';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import SetupWalk from '$lib/organization/setup/component/walk.svelte';
import { SETUP_STEPS, type SetupStep } from '$lib/organization/setup/setup';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { fakeSettings } from '$lib/settings/tests/testing.ts';
import Providers from '#tests/providers.svelte';

/**
 * THE WALK, RENDERED
 *
 * `setup.test.ts` asserts over the description the screen draws from. This asserts over what the
 * screen actually put in the document, which is the other half of effort 819's criterion 3: a
 * field that reached the DOM without going through the description would pass there and fail
 * here.
 *
 * And since effort 824: every step carries exactly one way back, whose arrow mirrors for a reader
 * going right to left; every step says where it is; a machine that already holds the authority
 * opens the connect step granted; the name step asks for the owner's username beside the name and
 * the password, refused under the one rule every username field reads. Since effort 832 the walk
 * is two steps. And since effort 843 it is on the way-in surface: one prominent action a step,
 * fields with no glyphs, the cursor in the first field on arrival, the connect step one line with
 * no facts, and the language and appearance control at the foot.
 *
 * **The subject needs two providers above it**, which is why `./providers.svelte` is the wrapper:
 * the corner control draws a tooltip, and the surface's spinner reads the string contract.
 *
 * **A submit is fired only where what it carries is the point**, which since effort 826's
 * correction to requirement 13 is the name step: where Turso has left the group to be asked for,
 * the name the person types is what the next create names, so a screen that collected it and did
 * not hand it on would pass every other assertion here. A superforms SPA submit reaches
 * SvelteKit's `applyAction` through
 * `use:enhance`, and `applyAction` reaches for a router root that a component test has none of,
 * so it is mocked away below: what it does is bring `$page` in line after a form action, and
 * there is no page and no action here. Everything else is asserted on its fields and on the
 * schemas `setup.test.ts` pins. A refusal is reached the way a person first meets it, by leaving
 * the field, which is client-side validation and needs no submit.
 */

// the one piece of SvelteKit a superforms submit reaches that this runner cannot supply. Mocked
// rather than avoided, so the submits below run the same code path the application runs.
vi.mock('$app/forms', async (original) => ({
	...(await original<Record<string, unknown>>()),
	applyAction: async () => {}
}));

// the settings the foot control reads, which a test has no shell to ask.
vi.mock('$lib/api/caller', () => ({
	default: { settings: { get: async () => fakeSettings(), set: async () => fakeSettings() } }
}));

beforeAll(() => {
	// the foot control's appearance reads the system's through `matchMedia`, and a popover measures
	// with a `ResizeObserver`; jsdom has neither.
	window.matchMedia = ((query: string) => ({
		matches: false,
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {}
	})) as unknown as typeof window.matchMedia;
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

const noop = () => {};

type WalkProps = Parameters<typeof render<typeof SetupWalk>>[1];

const walk = (
	step: SetupStep,
	overrides: Partial<WalkProps> = {},
	direction: 'ltr' | 'rtl' = 'ltr'
) =>
	render(
		SetupWalk,
		{
			step,
			consent: { status: 'idle', error: null },
			refusal: null,
			holdsTursoAuthority: false,
			isConnecting: false,
			isCreating: false,
			onConnect: noop,
			onDisconnect: noop,
			onContinue: noop,
			onBack: noop,
			onCreate: async () => {},
			onConnectExisting: async () => {},
			...overrides
		},
		{ wrapper: Providers, wrapperProps: { strings, direction } }
	);

const inputsOnScreen = () =>
	Array.from(document.querySelectorAll<HTMLInputElement>('input, textarea, select'));

/** the buttons a step draws, which leaves out back, the foot control and what it opens. */
const stepButtons = () =>
	Array.from(document.querySelectorAll<HTMLButtonElement>('[data-setup-step] button'));

/** whether a button is drawn prominent: the filled primary variant. */
const isProminent = (button: HTMLElement) => button.className.includes('bg-primary');

test('the naming step presents exactly three fields: the name, a username and a password', () => {
	loadLocale('en');
	setLocale('en');
	walk('name');

	const inputs = inputsOnScreen();

	// in the order the description gives them, which is the order a person meets them.
	expect(inputs.map((input) => input.getAttribute('name'))).toEqual([
		'name',
		'username',
		'password'
	]);
	expect(inputs.find((input) => input.name === 'password')?.type).toBe('password');
	expect(screen.getByText(en.organization.setup.nameLabel)).toBeDefined();
	expect(screen.getByText(en.organization.setup.usernameLabel)).toBeDefined();
	expect(screen.getByText(en.organization.setup.passwordLabel)).toBeDefined();
	expect(screen.getByText(en.organization.setup.passwordFloor)).toBeDefined();
	expect(screen.getByRole('button', { name: en.organization.setup.create })).toBeDefined();
	expect(document.querySelector('[data-setup-fields]')?.getAttribute('data-setup-fields')).toBe(
		'name,username,password'
	);

	// and nothing on the step says a word about the Turso group, which is the whole of this
	// ticket: the create is tried three ways before anybody is asked for one.
	expect(document.querySelector('[data-setup-group]')).toBeNull();
	expect(screen.queryByText(en.organization.setup.groupLabel)).toBeNull();
	expect(screen.queryByText(en.organization.setup.groupNeeded)).toBeNull();
});

/** fill the name step in, as a person does, and press create. */
const fillAndCreate = async (group?: string) => {
	const typed: [string, string][] = [
		['name', 'Acme Rentals'],
		['username', 'olivia.owner'],
		['password', 'a long enough password']
	];

	if (group !== undefined) typed.push(['group', group]);

	for (const [name, value] of typed) {
		await fireEvent.input(document.querySelector(`input[name="${name}"]`)!, {
			target: { value }
		});
	}

	await fireEvent.submit(document.querySelector('form')!);
};

// the ordinary run: nothing is collected about the group, so nothing is handed on about it, and
// Rust is left to try the names it can work out.
test('the ordinary create carries no group at all', async () => {
	loadLocale('en');
	setLocale('en');

	const onCreate = vi.fn(async () => {});

	walk('name', { onCreate });
	await fillAndCreate();

	await waitFor(() => {
		expect(onCreate).toHaveBeenCalledWith(
			'Acme Rentals',
			'olivia.owner',
			'a long enough password',
			null
		);
	});
});

/** what Rust hands back after the phrase, which is Turso's own account of the refusal. */
const TURSO_SAID =
	'turso refused every group this application could name on its own, and said: 404 group `default` not found';

/**
 * Requirement 13's second correction: Turso would take none of the names the application could
 * work out, so the route hands `askGroup` and the step grows the one field left to ask for, with
 * the sentence above it saying what to type. The name typed into it is what the next create
 * carries, trimmed, because a name pasted out of Turso's own screen brings whatever came with it.
 *
 * And requirement 13's fourth correction: Turso's own account is under that sentence, muted, as
 * detail. It used to be the whole of what a person was shown, as the headline of a toast, which
 * made a step the connect screen had already foretold read as a failure.
 */
test('a walk asked for the group draws the field with the sentence above it, and sends what was typed', async () => {
	loadLocale('en');
	setLocale('en');

	const onCreate = vi.fn(async () => {});

	walk('name', { askGroup: true, groupDetail: TURSO_SAID, onCreate });

	expect(screen.getByText(en.organization.setup.groupNeeded)).toBeDefined();
	expect(screen.getByText(en.organization.setup.groupLabel)).toBeDefined();
	expect(screen.getByText(en.organization.setup.groupDescription)).toBeDefined();
	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual([
		'name',
		'username',
		'password',
		'group'
	]);

	// the sentence is above the field rather than under it: it says what to type, and a reader
	// meets it before the thing it is about.
	const block = document.querySelector('[data-setup-group]')!;
	const sentence = screen.getByText(en.organization.setup.groupNeeded);
	const field = document.querySelector('input[name="group"]')!;

	expect(block.contains(field)).toBe(true);
	expect(sentence.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

	// and Turso's own account sits between the two, behind a disclosure (effort 832, requirement
	// 23): closed, it is one quiet control, and opened it is Turso's words, quieter than the
	// sentence they explain.
	const disclosure = document.querySelector('[data-error-detail="group"]')!;

	expect(
		sentence.compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
	expect(disclosure.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	expect(screen.queryByText(TURSO_SAID)).toBeNull();

	await fireEvent.click(screen.getByRole('button', { name: en.common.actions.details }));

	const detail = await waitFor(() => document.querySelector('[data-error-detail-text="group"]')!);

	expect(detail.textContent?.trim()).toBe(TURSO_SAID);
	expect(detail.getAttribute('class')).toContain('text-muted-foreground');

	await fillAndCreate('  rentable-empty  ');

	await waitFor(() => {
		expect(onCreate).toHaveBeenCalledWith(
			'Acme Rentals',
			'olivia.owner',
			'a long enough password',
			'rentable-empty'
		);
	});
});

// a walk that was asked for the group and given no account of why draws no empty line where the
// detail would be: the sentence and the field are the whole of the step.
test('a walk asked for the group with nothing to quote draws no detail line', () => {
	loadLocale('en');
	setLocale('en');
	walk('name', { askGroup: true });

	expect(screen.getByText(en.organization.setup.groupNeeded)).toBeDefined();
	expect(document.querySelector('[data-error-detail="group"]')).toBeNull();
});

/**
 * Criterion 3 of this ticket: **the group is asked for without costing the person anything they
 * already typed.** The route keeps its own name, username and password state across the refused
 * create and hands `askGroup` on the props, so what this asserts is the walk under exactly that
 * hand: the three values are in the fields before, and they are still in them after, with the
 * fourth field added beside them.
 */
test('the fields the person already filled survive the group being asked for', async () => {
	loadLocale('en');
	setLocale('en');

	const onCreate = vi.fn(async () => {});
	const { rerender } = walk('name', { onCreate });

	await fillAndCreate();

	await waitFor(() => {
		expect(onCreate).toHaveBeenCalledWith(
			'Acme Rentals',
			'olivia.owner',
			'a long enough password',
			null
		);
	});

	// the route caught the refusal and handed the one prop that changed; nothing else about the
	// step was rebuilt.
	await rerender({ askGroup: true, groupDetail: TURSO_SAID });

	expect(inputsOnScreen().map((input) => [input.getAttribute('name'), input.value])).toEqual([
		['name', 'Acme Rentals'],
		['username', 'olivia.owner'],
		['password', 'a long enough password'],
		['group', '']
	]);
	expect(screen.getByText(en.organization.setup.groupNeeded)).toBeDefined();
	expect(document.querySelector('[data-error-detail="group"]')).not.toBeNull();
});

// the create it was asked for cannot be made without it, so the step refuses on the field before
// the round trip, in the person's own language, and nothing is created. Reached by leaving the
// field, which is how a person first meets it.
test('an empty group is refused on a step that asked for one, and nothing is created', async () => {
	loadLocale('en');
	setLocale('en');

	const onCreate = vi.fn(async () => {});

	walk('name', { askGroup: true, onCreate });

	const input = document.querySelector<HTMLInputElement>('input[name="group"]')!;

	await fireEvent.input(input, { target: { value: '   ' } });
	await fireEvent.focusOut(input);

	await waitFor(() => {
		expect(screen.getByRole('alert').textContent).toBe(en.organization.setup.groupRequired);
	});
	expect(input.getAttribute('aria-invalid')).toBe('true');
	expect(onCreate).not.toHaveBeenCalled();
});

/**
 * Effort 843, requirement 3: **the connect step is its title, one line, one "connect" and one line
 * under it.** The five facts that sat behind "before you connect" are gone, with the dashboard
 * action that sat in the first of them.
 */
test('the connect step says one line, one connect, and one line under it, and no facts', () => {
	for (const [locale, strings] of [
		['en', en],
		['ar', ar]
	] as const) {
		loadLocale(locale);
		setLocale(locale);

		const rendered = walk('connect', {}, locale === 'ar' ? 'rtl' : 'ltr');

		expect(inputsOnScreen(), locale).toEqual([]);
		expect(screen.getByRole('heading').textContent?.trim(), locale).toBe(
			strings.organization.setup.connectTitle
		);
		expect(screen.getByText(strings.organization.setup.connectDescription), locale).toBeDefined();

		const connect = screen.getByRole('button', { name: strings.organization.setup.connect });
		const hint = document.querySelector('[data-setup-connect-hint]');

		expect(hint?.textContent?.trim(), locale).toBe(strings.organization.setup.connectHint);
		expect(
			connect.compareDocumentPosition(hint!) & Node.DOCUMENT_POSITION_FOLLOWING,
			locale
		).toBeTruthy();
		expect(stepButtons(), locale).toEqual([connect]);
		expect(
			screen.queryByRole('button', { name: strings.organization.setup.openDashboard }),
			locale
		).toBeNull();
		expect(document.querySelector('[data-setup-facts]'), locale).toBeNull();

		rendered.unmount();
	}

	loadLocale('en');
	setLocale('en');
});

// effort 826, requirement 21: a run refused because the group already holds an organization
// comes back here saying so, with the consent on offer again rather than the way on: the
// authority the refusal gave back is gone, so there is nothing to continue with.
test('a refused run says so on the connect step and offers the consent again', () => {
	loadLocale('en');
	setLocale('en');

	// the sentence is the reader's, from the refusal's reason; what Rust said is behind a
	// disclosure under it (effort 832, requirement 23).
	const refusal = {
		sentence: en.common.refusals.host.groupHoldsOrganization,
		detail:
			'this group already holds the organization database `org-7f3a`; a group holds one organization, so pick another group or another Turso account'
	};

	walk('connect', { refusal });

	expect(screen.getByText(refusal.sentence)).toBeDefined();
	expect(screen.queryByText(refusal.detail)).toBeNull();
	expect(document.querySelector('[data-error-detail="consent"]')).not.toBeNull();
	expect(screen.getByRole('button', { name: en.organization.setup.connect })).toBeDefined();
	expect(screen.queryByRole('button', { name: en.organization.setup.continue })).toBeNull();
	// and it is said instead of the confirmation, never beside it.
	expect(screen.queryByText(en.organization.setup.connected)).toBeNull();
});

// effort 832, requirement 23: a consent the authorization server refused is said in the reader's
// language, and what the server said is behind a disclosure rather than spliced into the sentence.
test("a failed consent says so in the reader's language, with the server's words behind a disclosure", async () => {
	loadLocale('ar');
	setLocale('ar');
	walk('connect', { consent: { status: 'failed', error: 'invalid_scope' } }, 'rtl');

	expect(screen.getByText(ar.organization.setup.consentFailed)).toBeDefined();
	expect(screen.queryByText(/invalid_scope/)).toBeNull();

	await fireEvent.click(screen.getByRole('button', { name: ar.common.actions.details }));

	await waitFor(() => {
		expect(document.querySelector('[data-error-detail-text="consent"]')?.textContent?.trim()).toBe(
			'invalid_scope'
		);
	});
});

test('a granted consent offers the way on and the way to give the authority back', () => {
	loadLocale('en');
	setLocale('en');
	walk('connect', { consent: { status: 'granted', error: null } });

	expect(screen.getByText(en.organization.setup.connected)).toBeDefined();
	expect(screen.getByRole('button', { name: en.organization.setup.continue })).toBeDefined();
	const disconnect = screen.getByRole('button', { name: en.organization.dashboard.forgetAccount });

	expect(disconnect).toBeDefined();
	// a word and no glyph, quiet under the way on (effort 843, requirement 5).
	expect(disconnect.querySelector('svg')).toBeNull();
	expect(screen.queryByRole('button', { name: en.organization.setup.connect })).toBeNull();
});

// effort 824, requirement 6: a machine that holds the authority is not asked for it again.
test('a machine that already holds the authority opens the connect step granted, and no consent is begun', () => {
	loadLocale('en');
	setLocale('en');

	const onConnect = vi.fn();

	walk('connect', { holdsTursoAuthority: true, onConnect });

	expect(screen.getByText(en.organization.setup.connected)).toBeDefined();
	expect(screen.getByRole('button', { name: en.organization.setup.continue })).toBeDefined();
	expect(
		screen.getByRole('button', { name: en.organization.dashboard.forgetAccount })
	).toBeDefined();
	expect(screen.queryByRole('button', { name: en.organization.setup.connect })).toBeNull();
	expect(onConnect).not.toHaveBeenCalled();
});

test('an abandoned consent says nothing was created and offers the consent again', () => {
	loadLocale('en');
	setLocale('en');
	walk('connect', { consent: { status: 'abandoned', error: null } });

	expect(screen.getByText(en.organization.setup.consentAbandoned)).toBeDefined();
	expect(screen.getByRole('button', { name: en.organization.setup.connect })).toBeDefined();
});

/**
 * Effort 832, requirement 18 and its criterion (a): **the walk has two steps**, and the name step
 * is the last. It counts itself the second of two, it offers the create and nothing after it, and
 * no field on it asks for a workspace: the first workspace is made for the owner in the loading
 * pass that follows. While the create runs and until the loading surface is drawn over it, the
 * step says the organization is being created and nothing else, so no second working surface
 * comes between the walk and the loading pass.
 */
test('the walk is two steps, and the name step is the last, with no workspace asked for', () => {
	loadLocale('en');
	setLocale('en');

	expect([...SETUP_STEPS]).toEqual(['connect', 'name']);

	walk('name');

	expect(document.querySelector('[data-way-in-position]')?.textContent?.trim()).toBe(
		i18nObject('en').organization.setup.position({ step: 2, total: 2 })
	);
	expect(document.querySelector('[data-setup-fields]')?.getAttribute('data-setup-fields')).toBe(
		'name,username,password'
	);
	expect(screen.queryByText(en.layout.noWorkspace.nameLabel)).toBeNull();
	expect(screen.queryByRole('button', { name: en.layout.noWorkspace.create })).toBeNull();
	expect(document.querySelector('[data-join-link]')).toBeNull();
});

test('while the organization is created, the step says so and draws no workspace surface', () => {
	loadLocale('en');
	setLocale('en');
	walk('name', { isCreating: true });

	expect(document.querySelector('[data-setup-step]')?.getAttribute('data-setup-step')).toBe('name');
	expect(screen.getByText(en.organization.setup.creating)).toBeDefined();
	expect(screen.queryByText(en.layout.noWorkspace.creating)).toBeNull();
	expect(screen.queryByText(en.layout.noWorkspace.nameLabel)).toBeNull();
});

// effort 824, requirement 1, on the way-in surface: one way back on every step, in the corner of
// the content area rather than in the step, and it is the only one.
test('the steps before the organization exists carry exactly one back control in the corner, and pressing it calls onBack', () => {
	loadLocale('en');
	setLocale('en');

	for (const step of SETUP_STEPS) {
		const onBack = vi.fn();
		const rendered = walk(step, { onBack });
		const backs = screen.getAllByRole('button', { name: en.organization.setup.back });

		expect(backs, step).toHaveLength(1);
		expect(backs[0]!.closest('[data-back-control]') ?? backs[0], step).not.toBeNull();
		expect(document.querySelector('[data-setup-step]')?.contains(backs[0]!), step).toBe(false);
		expect(backs[0]!.querySelector('svg')?.getAttribute('class'), step).toContain('rtl:rotate-180');

		backs[0]!.click();

		expect(onBack, step).toHaveBeenCalledTimes(1);
		rendered.unmount();
	}
});

// effort 824, requirement 4, on the way-in surface: each step says where it is, in the small muted
// line above its title, with its own number.
test('every step renders the position line with its own number and the total, in both locales', () => {
	for (const locale of ['en', 'ar'] as const) {
		loadLocale(locale);
		setLocale(locale);

		const translations = i18nObject(locale);

		SETUP_STEPS.forEach((step, index) => {
			const rendered = walk(step, {}, locale === 'ar' ? 'rtl' : 'ltr');
			const lines = document.querySelectorAll('[data-way-in-position]');

			expect(lines, `${locale} ${step}`).toHaveLength(1);
			expect(lines[0]?.textContent?.trim(), `${locale} ${step}`).toBe(
				translations.organization.setup.position({ step: index + 1, total: SETUP_STEPS.length })
			);
			expect(document.querySelector('[data-setup-position]'), `${locale} ${step}`).toBeNull();
			rendered.unmount();
		});
	}

	setLocale('en');
});

// effort 843, requirement 5: each step has one prominent action, and "forget account" is quiet.
test('every step draws exactly one prominent button, and forgetting the account is quiet', () => {
	loadLocale('en');
	setLocale('en');

	const cases: [string, Parameters<typeof walk>][] = [
		['connect', ['connect']],
		['connect, granted', ['connect', { consent: { status: 'granted', error: null } }]],
		['name', ['name']],
		['existing', ['existing']]
	];

	for (const [label, args] of cases) {
		const rendered = walk(...args);

		expect(stepButtons().filter(isProminent), label).toHaveLength(1);
		rendered.unmount();
	}

	walk('connect', { consent: { status: 'granted', error: null } });

	const forget = screen.getByRole('button', { name: en.organization.dashboard.forgetAccount });

	expect(isProminent(forget)).toBe(false);
	expect(forget.className).not.toContain('border-input');
	expect(isProminent(screen.getByRole('button', { name: en.organization.setup.continue }))).toBe(
		true
	);
});

// effort 843, requirement 8: a field is its label and its input, with no glyph inside it, and no
// step's button carries one either.
test('no step draws a glyph in a field or on its buttons', () => {
	loadLocale('en');
	setLocale('en');

	const cases: Parameters<typeof walk>[] = [
		['connect'],
		['connect', { consent: { status: 'granted', error: null } }],
		['name', { askGroup: true }],
		['existing']
	];

	for (const args of cases) {
		const rendered = walk(...args);

		expect(document.querySelector('[data-slot=input-group-addon]'), args[0]).toBeNull();
		expect(document.querySelector('[data-setup-step] button svg'), args[0]).toBeNull();
		rendered.unmount();
	}
});

// requirement 8: arriving at a step that asks for typing puts the cursor in its first field, and
// no password is filled in for the person.
test('arriving at the name and existing steps puts focus in the first field, with no password filled', async () => {
	loadLocale('en');
	setLocale('en');

	for (const [step, first] of [
		['name', 'name'],
		['existing', 'username']
	] as const) {
		const rendered = walk(step);

		await waitFor(() => expect(document.activeElement?.getAttribute('name'), step).toBe(first));
		expect(document.querySelector<HTMLInputElement>('input[name="password"]')?.value, step).toBe(
			''
		);
		rendered.unmount();
	}
});

// ticket 06, its last criterion: the foot of every step is the language and appearance control,
// with no acts of its own.
test('every step carries the preferences control at its foot, and nothing else there', () => {
	loadLocale('en');
	setLocale('en');

	for (const step of [...SETUP_STEPS, 'existing'] as const) {
		const rendered = walk(step);
		const foot = document.querySelector('[data-way-in-foot]');

		expect(foot?.querySelectorAll('button'), step).toHaveLength(1);
		expect(foot?.querySelector('[data-way-in-preferences]'), step).not.toBeNull();
		rendered.unmount();
	}
});

// at the human's word on 2026-10-01: the foot holds the language and the appearance, and no way
// to all the settings, which are a workspace's and reached from the rail.
test('the foot of the walk offers the language and the appearance, and no way to all settings', async () => {
	loadLocale('en');
	setLocale('en');

	walk(SETUP_STEPS[0]);
	await fireEvent.click(document.querySelector<HTMLElement>('[data-way-in-preferences]')!);

	await waitFor(() => expect(document.querySelector('[data-language-choice]')).not.toBeNull());
	expect(document.querySelector('[data-appearance="dark"]')).not.toBeNull();
	expect(document.querySelector('a[href="/settings"]')).toBeNull();
});

test('no step carries the outline back button the corner control replaced', () => {
	loadLocale('en');
	setLocale('en');

	for (const step of SETUP_STEPS) {
		const rendered = walk(step);
		const inBody = document.querySelector('[data-setup-step]')!;

		expect(
			Array.from(inBody.querySelectorAll('button')).filter(
				(button) => button.textContent?.trim() === en.organization.setup.back
			),
			step
		).toEqual([]);
		rendered.unmount();
	}
});

// requirement 21 of effort 819: both locales, and the corner control is there under the Arabic one.
test('the walk renders in arabic with the same fields on each step', () => {
	loadLocale('ar');
	setLocale('ar');

	const naming = walk('name', { askGroup: true }, 'rtl');

	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual([
		'name',
		'username',
		'password',
		'group'
	]);
	expect(screen.getByText(ar.organization.setup.nameLabel)).toBeDefined();
	expect(screen.getByText(ar.organization.setup.usernameLabel)).toBeDefined();
	expect(ar.organization.setup.usernameLabel).not.toBe(en.organization.setup.usernameLabel);
	expect(screen.getByText(ar.organization.setup.groupNeeded)).toBeDefined();
	expect(ar.organization.setup.groupNeeded).not.toBe(en.organization.setup.groupNeeded);
	expect(screen.getByText(ar.organization.setup.groupLabel)).toBeDefined();
	expect(screen.getByText(ar.organization.setup.groupDescription)).toBeDefined();
	expect(ar.organization.setup.groupDescription).not.toBe(en.organization.setup.groupDescription);
	expect(screen.getByRole('button', { name: ar.organization.setup.create })).toBeDefined();
	expect(screen.getAllByRole('button', { name: ar.organization.setup.back })).toHaveLength(1);
	naming.unmount();

	// and the connect step's one line and the line under its button, in Arabic.
	walk('connect', {}, 'rtl');

	expect(screen.getByText(ar.organization.setup.connectDescription)).toBeDefined();
	expect(screen.getByText(ar.organization.setup.connectHint)).toBeDefined();

	setLocale('en');
});

/**
 * Effort 828, requirement 14: **the account that already holds an organization is connected to.**
 *
 * The step after the consent on that way in asks for the owner's username and their password, and
 * says in one sentence whose account this is and who signs in here. It is not a step of the walk
 * that creates, so `SETUP_WALK` does not carry it and the assertions over that walk above are
 * untouched; what it is, is what this renders.
 */
test('the existing step says one sentence and asks for the username and the password', () => {
	loadLocale('en');
	setLocale('en');
	walk('existing');

	expect(screen.getByText(en.organization.setup.existingTitle)).toBeDefined();
	expect(screen.getByText(en.organization.setup.existingDescription)).toBeDefined();

	const inputs = inputsOnScreen();

	expect(inputs.map((input) => input.getAttribute('name'))).toEqual(['username', 'password']);
	expect(inputs.find((input) => input.name === 'password')?.type).toBe('password');
	expect(screen.getByRole('button', { name: en.organization.setup.existingConnect })).toBeDefined();

	// nothing on it asks for a name, a workspace or a group: the organization is already there.
	expect(screen.queryByText(en.organization.setup.nameLabel)).toBeNull();
	expect(document.querySelector('[data-setup-group]')).toBeNull();

	// and it is the second of the two steps that way in has, said where every step says it.
	expect(document.querySelector('[data-way-in-position]')?.textContent?.trim()).toBe(
		i18nObject('en').organization.setup.position({ step: 2, total: 2 })
	);
});

// what the owner typed is handed on as they typed it, trimmed on the username the way the create
// trims it, and the password untouched.
test('connecting hands the owner username and password on', async () => {
	loadLocale('en');
	setLocale('en');

	const onConnectExisting = vi.fn(async () => {});

	walk('existing', { onConnectExisting });

	for (const [name, value] of [
		['username', ' olivia.owner '],
		['password', 'the owners password']
	]) {
		await fireEvent.input(document.querySelector(`input[name="${name}"]`)!, {
			target: { value }
		});
	}

	await fireEvent.submit(document.querySelector('form')!);

	await waitFor(() => {
		expect(onConnectExisting).toHaveBeenCalledWith('olivia.owner', 'the owners password');
	});
});

// a pair that opens nothing is said against the password, where the person just typed, and the
// field is marked: the sentence is the reader's, from the refusal's reason, and says nothing about
// which half was wrong. What Rust said is behind a disclosure under it.
test('a refused connect marks the password field and says why under it', () => {
	loadLocale('en');
	setLocale('en');

	const refused = {
		sentence: en.common.refusals.host.credentialsWrong,
		detail:
			'the username and password do not open a place in the organization this turso account holds'
	};

	walk('existing', { existingRefusal: refused });

	expect(screen.getByText(refused.sentence)).toBeDefined();
	expect(screen.queryByText(refused.detail)).toBeNull();
	expect(document.querySelector('[data-error-detail="existing"]')).not.toBeNull();
	expect(document.querySelector('input[name="password"]')?.getAttribute('aria-invalid')).toBe(
		'true'
	);
	expect(document.querySelector('input[name="username"]')?.getAttribute('aria-invalid')).toBeNull();

	// and nothing is said until something was refused.
	expect(document.querySelector('[data-setup-existing-refusal]')).not.toBeNull();
});

// it is one of the steps before the organization is this machine's, so it carries the one way back
// every such step carries.
test('the existing step carries the one back control', () => {
	loadLocale('en');
	setLocale('en');

	const onBack = vi.fn();

	walk('existing', { onBack });

	const backs = screen.getAllByRole('button', { name: en.organization.setup.back });

	expect(backs).toHaveLength(1);

	backs[0]!.click();

	expect(onBack).toHaveBeenCalledTimes(1);
});
