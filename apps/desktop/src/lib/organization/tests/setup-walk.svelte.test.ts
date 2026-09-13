import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { i18nObject } from '$lib/i18n/i18n-util';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import SetupWalk from '$lib/organization/component/setup-walk.svelte';
import { SETUP_STEPS, type SetupStep } from '$lib/organization/setup';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import Providers from './providers.svelte';

/**
 * THE WALK, RENDERED
 *
 * `setup.test.ts` asserts over the description the screen draws from. This asserts over what the
 * screen actually put in the document, which is the other half of effort 819's criterion 3: a
 * field that reached the DOM without going through the description would pass there and fail
 * here.
 *
 * And since effort 824: every step carries exactly one way back, in the card's corner, whose
 * arrow mirrors for a reader going right to left; every step says where it is; the connect step
 * is a list of three glyphed facts with the dashboard action inside the first; a machine that
 * already holds the authority opens the connect step granted; the name step asks for the
 * owner's username beside the name and the password, refused under the one rule every username
 * field reads; the third step is the shared workspace field; the primaries carry their verb and
 * the fields their subject.
 *
 * **The subject needs two providers above it**, which is why `./providers.svelte` is the wrapper:
 * the corner control draws a tooltip, and the surface's spinner reads the string contract.
 *
 * **No submit is fired here.** A superforms SPA submit under this runner reaches SvelteKit's
 * `applyAction` through `use:enhance`, which the vitest environment does not supply, so the
 * steps are asserted on their fields and on the schemas `setup.test.ts` pins, not on a rendered
 * create. A refusal is reached the way a person first meets it, by leaving the field, which is
 * client-side validation and needs no submit.
 */

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
			holdsTursoAuthority: false,
			isConnecting: false,
			isCreating: false,
			onOpenDashboard: noop,
			onConnect: noop,
			onDisconnect: noop,
			onContinue: noop,
			onBack: noop,
			onCreate: async () => {},
			onCreateWorkspace: async () => {},
			...overrides
		},
		{ wrapper: Providers, wrapperProps: { strings, direction } }
	);

const inputsOnScreen = () =>
	Array.from(document.querySelectorAll<HTMLInputElement>('input, textarea, select'));

/** the leading addon of the input with this name, as the group draws it ahead of the control. */
const addonBefore = (name: string) => {
	const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
	const addon = input?.previousElementSibling;

	expect(input, name).not.toBeNull();
	expect(addon?.getAttribute('data-slot'), name).toBe('input-group-addon');

	return addon as HTMLElement;
};

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
});

// criterion 21: the owner's username is refused on the field with the one sentence the invite
// and rename dialogs refuse with, since all three read `organization/username-form.ts`.
test('a username outside the rules is refused on the name step with the one sentence every form reads', async () => {
	loadLocale('en');
	setLocale('en');
	walk('name');

	const input = document.querySelector<HTMLInputElement>('input[name="username"]')!;

	await fireEvent.input(input, { target: { value: 'sa' } });
	await fireEvent.focusOut(input);

	await waitFor(() => {
		expect(screen.getByRole('alert').textContent).toBe(en.organization.dashboard.usernameRules);
	});
	expect(input.getAttribute('aria-invalid')).toBe('true');

	await fireEvent.input(input, { target: { value: 'sami staff' } });
	await fireEvent.focusOut(input);

	await waitFor(() => {
		expect(screen.getByRole('alert').textContent).toBe(en.organization.dashboard.usernameRules);
	});
});

test('the connect step asks for nothing and says what has to be known first', () => {
	loadLocale('en');
	setLocale('en');
	walk('connect');

	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getByText(en.organization.setup.groupCoverage, { exact: false })).toBeDefined();
	expect(screen.getByText(en.organization.setup.accountCreation)).toBeDefined();
	expect(screen.getByText(en.organization.setup.succession)).toBeDefined();
	expect(screen.getByRole('button', { name: en.organization.setup.connect })).toBeDefined();
	expect(screen.getByRole('button', { name: en.organization.setup.openDashboard })).toBeDefined();
});

// effort 824, requirement 5: three facts as a list, a glyph to each, the dashboard action inside
// the first, and no paragraph left outside the list (*Supercharge the defaults*, p.220).
test('the connect step is a list of three glyphed facts with the dashboard action in the first', () => {
	loadLocale('en');
	setLocale('en');

	const rendered = walk('connect');
	const body = document.querySelector('[data-setup-step="connect"]')!;
	const items = Array.from(body.querySelectorAll('ul > li'));

	expect(items).toHaveLength(3);
	expect(items.map((item) => item.getAttribute('data-setup-statement'))).toEqual([
		'groupCoverage',
		'accountCreation',
		'succession'
	]);

	for (const item of items) {
		expect(item.querySelector('svg'), item.getAttribute('data-setup-statement')!).not.toBeNull();
	}

	const dashboard = screen.getByRole('button', { name: en.organization.setup.openDashboard });

	expect(items[0]!.contains(dashboard)).toBe(true);
	// the facts are the list and nothing else on the step is a paragraph, granted or not: the
	// position line and the working line are lines, and the callout is the primitive's own box.
	expect(body.querySelectorAll('p')).toHaveLength(0);
	rendered.unmount();

	walk('connect', { consent: { status: 'pending', error: null }, holdsTursoAuthority: true });

	expect(document.querySelector('[data-setup-step="connect"]')!.querySelectorAll('p')).toHaveLength(
		0
	);
});

test('a granted consent offers the way on and the way to give the authority back', () => {
	loadLocale('en');
	setLocale('en');
	walk('connect', { consent: { status: 'granted', error: null } });

	expect(screen.getByText(en.organization.setup.connected)).toBeDefined();
	expect(screen.getByRole('button', { name: en.organization.setup.continue })).toBeDefined();
	const disconnect = screen.getByRole('button', { name: en.organization.disconnectAction });

	expect(disconnect).toBeDefined();
	expect(disconnect.querySelector('svg')).not.toBeNull();
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
	expect(screen.getByRole('button', { name: en.organization.disconnectAction })).toBeDefined();
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

// effort 824, requirement 3: the last step names the first workspace on the shared field, and
// there is no step after it showing the link.
test('the last step presents the one shared workspace field and the create, and no link', () => {
	loadLocale('en');
	setLocale('en');
	walk('workspace');

	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual(['name']);
	expect(screen.getByText(en.organization.setup.workspaceTitle)).toBeDefined();
	expect(screen.getByText(en.organization.setup.workspaceDescription)).toBeDefined();
	expect(screen.getByText(en.layout.noWorkspace.nameLabel)).toBeDefined();
	expect(screen.getByRole('button', { name: en.layout.noWorkspace.create })).toBeDefined();
	expect(document.querySelector('[data-join-link]')).toBeNull();
	expect(document.querySelector('[data-setup-fields]')?.getAttribute('data-setup-fields')).toBe(
		'workspace'
	);
});

// effort 824, requirement 1: one way back on every step, in the corner, and it is the only one.
test('the steps before the organization exists carry exactly one back control in the corner, and pressing it calls onBack', () => {
	loadLocale('en');
	setLocale('en');

	for (const step of SETUP_STEPS.filter((step) => step !== 'workspace')) {
		const onBack = vi.fn();
		const rendered = walk(step, { onBack });
		const backs = screen.getAllByRole('button', { name: en.organization.setup.back });

		expect(backs, step).toHaveLength(1);
		// in the corner rather than in the body: the body is the one element that names the step.
		expect(document.querySelector('[data-setup-step]')?.contains(backs[0]!), step).toBe(false);
		expect(backs[0]!.querySelector('svg')?.getAttribute('class'), step).toContain('rtl:rotate-180');

		backs[0]!.click();

		expect(onBack, step).toHaveBeenCalledTimes(1);
		rendered.unmount();
	}
});

// the name step created the organization and signed the owner in, so nothing behind the third
// step can be re-entered; a back there with the name form still filled would make a second
// organization (the correctness review of 2026-09-12, decided 2026-09-13).
test('the third step carries no back control, since the organization already exists', () => {
	loadLocale('en');
	setLocale('en');
	walk('workspace', { onBack: vi.fn() });

	expect(screen.queryByRole('button', { name: en.organization.setup.back })).toBeNull();
});

// effort 824, requirement 4: each step says where it is, muted, with its own number.
test('every step renders the position line with its own number and the total, in both locales', () => {
	for (const locale of ['en', 'ar'] as const) {
		loadLocale(locale);
		setLocale(locale);

		const translations = i18nObject(locale);

		SETUP_STEPS.forEach((step, index) => {
			const rendered = walk(step, {}, locale === 'ar' ? 'rtl' : 'ltr');
			const line = document.querySelector('[data-setup-position]');

			expect(line?.textContent?.trim(), `${locale} ${step}`).toBe(
				translations.organization.setup.position({ step: index + 1, total: SETUP_STEPS.length })
			);
			expect(line?.getAttribute('class'), `${locale} ${step}`).toContain('text-muted-foreground');
			rendered.unmount();
		});
	}

	setLocale('en');
});

// effort 824, requirement 14: each primary carries its verb, and the arrow mirrors.
test('the connect, continue and create buttons carry a glyph before their label', () => {
	loadLocale('en');
	setLocale('en');

	const idle = walk('connect');

	expect(
		screen.getByRole('button', { name: en.organization.setup.connect }).querySelector('svg')
	).not.toBeNull();
	idle.unmount();

	const granted = walk('connect', { consent: { status: 'granted', error: null } });
	const arrow = screen
		.getByRole('button', { name: en.organization.setup.continue })
		.querySelector('svg');

	expect(arrow).not.toBeNull();
	expect(arrow?.getAttribute('class')).toContain('rtl:rotate-180');
	granted.unmount();

	const naming = walk('name');

	expect(
		screen.getByRole('button', { name: en.organization.setup.create }).querySelector('svg')
	).not.toBeNull();
	naming.unmount();

	walk('workspace');

	expect(
		screen.getByRole('button', { name: en.layout.noWorkspace.create }).querySelector('svg')
	).not.toBeNull();
});

// effort 824, requirement 15: each field carries its subject ahead of the input, muted so it does
// not outweigh the label (*Balance weight and contrast*, Refactoring UI p.56).
test('the name, username, password and workspace fields carry a muted leading glyph through the input group', () => {
	loadLocale('en');
	setLocale('en');

	const naming = walk('name');

	for (const name of ['name', 'username', 'password']) {
		const addon = addonBefore(name);

		expect(addon.querySelector('svg'), name).not.toBeNull();
		expect(addon.getAttribute('class'), name).toContain('text-muted-foreground');
	}

	naming.unmount();
	walk('workspace');

	const addon = addonBefore('name');

	expect(addon.querySelector('svg')).not.toBeNull();
	expect(addon.getAttribute('class')).toContain('text-muted-foreground');
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

	const naming = walk('name', {}, 'rtl');

	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual([
		'name',
		'username',
		'password'
	]);
	expect(screen.getByText(ar.organization.setup.nameLabel)).toBeDefined();
	expect(screen.getByText(ar.organization.setup.usernameLabel)).toBeDefined();
	expect(ar.organization.setup.usernameLabel).not.toBe(en.organization.setup.usernameLabel);
	expect(screen.getByRole('button', { name: ar.organization.setup.create })).toBeDefined();
	expect(screen.getAllByRole('button', { name: ar.organization.setup.back })).toHaveLength(1);
	naming.unmount();

	walk('workspace', {}, 'rtl');

	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual(['name']);
	expect(screen.getByText(ar.organization.setup.workspaceTitle)).toBeDefined();
	expect(screen.getByRole('button', { name: ar.layout.noWorkspace.create })).toBeDefined();

	setLocale('en');
});
