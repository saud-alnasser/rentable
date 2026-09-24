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
			onOpenDashboard: noop,
			onConnect: noop,
			onDisconnect: noop,
			onContinue: noop,
			onBack: noop,
			onCreate: async () => {},
			onConnectExisting: async () => {},
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
 * Effort 826's correction to requirement 13: a group that is not the one the consent is over is
 * refused by Rust before anything is created, by both names, and the consent is untouched. So it
 * reaches the walk the way every ordinary failed create does: the shared handler shows the
 * sentence, `refusalAfterFailedCreate` keeps the walk where it is, and what the person typed is
 * still in the fields for them to correct the one word that was wrong. This is that last half,
 * which is the only half this component owns; the sentence is Rust's and `setup.test.ts` pins it
 * to what `setup.rs` formats, both group names included, and pins the walk staying put.
 */
test('a create refused over the group leaves the name step filled in, so the group can be corrected', async () => {
	loadLocale('en');
	setLocale('en');

	// what the route hands in after a refused create: it caught the refusal, the shared handler
	// said it, and the walk was left on the step it was on with the field still asked for.
	const onCreate = vi.fn(async () => {});

	walk('name', { askGroup: true, onCreate });
	await fillAndCreate('rentabel');

	await waitFor(() => {
		expect(onCreate).toHaveBeenCalledWith(
			'Acme Rentals',
			'olivia.owner',
			'a long enough password',
			'rentabel'
		);
	});

	// the step is still the name step, with all four values where the person left them, so the
	// one word that was wrong is the only one they retype.
	expect(inputsOnScreen().map((input) => [input.getAttribute('name'), input.value])).toEqual([
		['name', 'Acme Rentals'],
		['username', 'olivia.owner'],
		['password', 'a long enough password'],
		['group', 'rentabel']
	]);
});

// criterion 21: the owner's username is refused on the field with the one sentence the invite
// dialog and the member's sheet refuse with, since all three read `organization/username-form.ts`.
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
	expect(screen.getByText(en.organization.setup.oneOrganization)).toBeDefined();
	expect(screen.getByText(en.organization.setup.accountCreation)).toBeDefined();
	expect(screen.getByText(en.organization.setup.succession)).toBeDefined();
	expect(screen.getByText(en.organization.setup.groupAskedOnce)).toBeDefined();
	expect(screen.getByRole('button', { name: en.organization.setup.connect })).toBeDefined();
	expect(screen.getByRole('button', { name: en.organization.setup.openDashboard })).toBeDefined();
});

// effort 824, requirement 5: the facts as a list, a glyph to each, the dashboard action inside
// the first, and no paragraph left outside the list (*Supercharge the defaults*, p.220). The
// fourth fact is effort 826's requirement 21: one group holds one organization. The fifth is
// requirement 13's fourth correction: a group holding nothing yet is asked its name once, said
// here so that the field on the next step is a step rather than the first news of a failure.
test('the connect step is a list of glyphed facts with the dashboard action in the first', () => {
	loadLocale('en');
	setLocale('en');

	const rendered = walk('connect');
	const body = document.querySelector('[data-setup-step="connect"]')!;
	const items = Array.from(body.querySelectorAll('ul > li'));

	expect(items).toHaveLength(5);
	expect(items.map((item) => item.getAttribute('data-setup-statement'))).toEqual([
		'groupCoverage',
		'oneOrganization',
		'accountCreation',
		'succession',
		'groupAskedOnce'
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
test('the name, username, password, group and workspace fields carry a muted leading glyph through the input group', () => {
	loadLocale('en');
	setLocale('en');

	const naming = walk('name', { askGroup: true });

	for (const name of ['name', 'username', 'password', 'group']) {
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

	walk('workspace', {}, 'rtl');

	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual(['name']);
	expect(screen.getByText(ar.organization.setup.workspaceTitle)).toBeDefined();
	expect(screen.getByRole('button', { name: ar.layout.noWorkspace.create })).toBeDefined();

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
	expect(document.querySelector('[data-setup-position]')?.textContent?.trim()).toBe(
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
