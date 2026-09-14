import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import JoinScreen from '$lib/organization/component/join-screen.svelte';
import { afterConnect, THE_WALL, type JoinStep } from '$lib/organization/join';
import { PASSWORD_FLOOR } from '$lib/organization/setup';
import type { LinkFacts } from '$lib/platform/host';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import Providers from './providers.svelte';

/**
 * THE CONNECT SCREEN, RENDERED
 *
 * `join.test.ts` drives the steps; this asserts over what each step puts in the document. What
 * is worth pinning: the one field takes both kinds of link and each lands where it should, a
 * link that admits nobody is refused by name, the password step asks for the two fields and
 * nothing else, and the sentences are said in both locales.
 *
 * **The landing of each kind of link is taken from `afterConnect`** rather than written out, so
 * the field, the read and the step a reader ends on are one chain here rather than three
 * assertions that could each be right about a different screen. An organization link is
 * `THE_WALL`, which this screen does not draw: the route navigates and the wall is the shell's.
 *
 * And since effort 824: every step carries exactly one way back, in the card's corner rather
 * than in its body, whose arrow mirrors for a reader going right to left; a primary carries its
 * verb's glyph; and the link field carries its subject's glyph, muted, ahead of the input.
 *
 * **The subject needs two providers above it**, which is why `./providers.svelte` is the wrapper:
 * the corner control draws a tooltip, and the surface's spinner reads the string contract.
 */

const noop = () => {};

const joinScreen = (
	step: JoinStep,
	overrides: {
		onConnect?: (link: string) => void;
		onJoin?: (link: string, password: string) => void;
		onSignIn?: () => void;
		onBack?: () => void;
		direction?: 'ltr' | 'rtl';
	} = {}
) =>
	render(
		JoinScreen,
		{
			step,
			onConnect: overrides.onConnect ?? noop,
			onJoin: overrides.onJoin ?? noop,
			onSignIn: overrides.onSignIn ?? noop,
			onBack: overrides.onBack ?? noop
		},
		{
			wrapper: Providers,
			wrapperProps: { strings, direction: overrides.direction ?? 'ltr' }
		}
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

const LINK = 'rentable://join/abc';

const facts = (overrides: Partial<LinkFacts> = {}): LinkFacts => ({
	organizationId: 'acme',
	organizationName: 'Acme Rentals',
	remoteUrl: 'libsql://acme.turso.io',
	standing: 'none',
	invitation: null,
	...overrides
});

/** where the link the field took lands, once the organization it names has answered. */
const landingOf = (overrides: Partial<LinkFacts> = {}) => afterConnect(LINK, facts(overrides));

/** the landing that stays on this screen, for the tests that render one. */
const stepOf = (overrides: Partial<LinkFacts>) => landingOf(overrides) as JoinStep;

const A_CHOSEN_PASSWORD = 'x'.repeat(PASSWORD_FLOOR);

/** one of every step, each with a link where the step holds one. */
const everyStep: JoinStep[] = [
	{ kind: 'paste' },
	{ kind: 'unreadable', link: 'nope' },
	{ kind: 'inspecting', link: LINK },
	{ kind: 'unreachable', link: LINK, message: 'offline' },
	{ kind: 'refused', link: LINK, refusal: 'lapsed', message: null },
	stepOf({ standing: 'open', invitation: { username: 'olivia' } })
];

test('with no link there is one field, for the link, typed left to right', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen({ kind: 'paste' });

	const inputs = inputsOnScreen();

	expect(inputs.map((input) => input.getAttribute('name'))).toEqual(['link']);
	expect(inputs[0]?.getAttribute('dir')).toBe('ltr');
	expect(screen.getByRole('button', { name: en.common.actions.connect })).toBeDefined();
	expect(screen.queryByText(en.organization.join.unreadable)).toBeNull();
});

// effort 824, requirement 18: a pasted link reaches the route as it was typed, and the route
// runs the connect; what a link is, and what wrapped it, are decided past this screen.
test('submitting the field calls onConnect with the link, and an empty field does not', async () => {
	loadLocale('en');
	setLocale('en');

	const onConnect = vi.fn();

	joinScreen({ kind: 'paste' }, { onConnect });

	const connect = screen.getByRole('button', { name: en.common.actions.connect });
	const form = connect.closest('form')!;

	expect(connect.hasAttribute('disabled')).toBe(true);
	await fireEvent.submit(form);
	expect(onConnect).not.toHaveBeenCalled();

	await fireEvent.input(document.querySelector('input[name="link"]')!, {
		target: { value: `  ${LINK}  ` }
	});

	expect(connect.hasAttribute('disabled')).toBe(false);
	await fireEvent.submit(form);
	expect(onConnect).toHaveBeenCalledWith(`  ${LINK}  `);
});

// effort 826, requirement 10: one field, two kinds of link, and each lands in its own place. The
// organization link's landing is the wall, which this screen does not draw.
test('an organization link pasted into the field lands on the wall and not on this screen', () => {
	loadLocale('en');
	setLocale('en');

	expect(landingOf()).toBe(THE_WALL);
});

test('an invitation link pasted into the field lands on the password step, naming both', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen(stepOf({ standing: 'open', invitation: { username: 'olivia' } }));

	expect(document.querySelector('[data-join-step]')?.getAttribute('data-join-step')).toBe(
		'password'
	);
	expect(screen.getByText('Acme Rentals')).toBeDefined();
	expect(screen.getByText('olivia')).toBeDefined();
	// named and not typed: the two facts the link carried are text, and the fields are the two
	// the person fills in.
	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual([
		'password',
		'confirmation'
	]);
	expect(screen.getByText(en.organization.join.passwordTitle)).toBeDefined();
});

test('the password step holds the floor and the confirmation, and only a matching pair joins', async () => {
	loadLocale('en');
	setLocale('en');

	const onJoin = vi.fn();

	joinScreen(stepOf({ standing: 'open', invitation: { username: 'olivia' } }), { onJoin });

	const join = screen.getByRole('button', { name: en.common.actions.join });
	const [password, confirmation] = inputsOnScreen();

	expect(password?.type).toBe('password');
	expect(confirmation?.type).toBe('password');
	// the floor is said before anything is typed, as the walk says it.
	expect(screen.getByText(en.organization.setup.passwordFloor)).toBeDefined();
	expect(join.hasAttribute('disabled')).toBe(true);

	// under the floor: the field marks itself and the primary stays shut.
	await fireEvent.input(password!, { target: { value: 'short' } });

	expect(screen.getByText(en.organization.setup.passwordTooShort)).toBeDefined();
	expect(password!.getAttribute('aria-invalid')).toBe('true');

	await fireEvent.input(password!, { target: { value: A_CHOSEN_PASSWORD } });
	await fireEvent.input(confirmation!, { target: { value: `${A_CHOSEN_PASSWORD}!` } });

	expect(screen.getByText(en.organization.join.mismatch)).toBeDefined();
	expect(join.hasAttribute('disabled')).toBe(true);

	await fireEvent.submit(join.closest('form')!);
	expect(onJoin).not.toHaveBeenCalled();

	await fireEvent.input(confirmation!, { target: { value: A_CHOSEN_PASSWORD } });

	expect(join.hasAttribute('disabled')).toBe(false);
	await fireEvent.submit(join.closest('form')!);

	expect(onJoin).toHaveBeenCalledWith(LINK, A_CHOSEN_PASSWORD);
});

// effort 826, requirement 14 of effort 824 still: the primary carries its verb, and the two
// password fields carry their subject.
test('the join carries a glyph and both password fields a muted leading one', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen(stepOf({ standing: 'open', invitation: { username: 'olivia' } }));

	expect(
		screen.getByRole('button', { name: en.common.actions.join }).querySelector('svg')
	).not.toBeNull();

	for (const name of ['password', 'confirmation']) {
		const addon = addonBefore(name);

		expect(addon.querySelector('svg'), name).not.toBeNull();
		expect(addon.getAttribute('class'), name).toContain('text-muted-foreground');
	}
});

test('while the accept is out the fields are held and the wait is said on the primary', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen({
		kind: 'password',
		link: LINK,
		organizationName: 'Acme Rentals',
		username: 'olivia',
		isJoining: true,
		errorMessage: null
	});

	for (const input of inputsOnScreen()) {
		expect(input.hasAttribute('disabled')).toBe(true);
	}

	expect(screen.getByRole('button', { name: en.common.actions.working })).toBeDefined();
});

test('an accept that was refused says what the shell said, over the fields', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen({
		kind: 'password',
		link: LINK,
		organizationName: 'Acme Rentals',
		username: 'olivia',
		isJoining: false,
		errorMessage: 'the invitation to Acme Rentals was already opened'
	});

	expect(screen.getByText('the invitation to Acme Rentals was already opened')).toBeDefined();
	expect(inputsOnScreen()).toHaveLength(2);
});

test('text that was not a link keeps the field and says so', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen({ kind: 'unreadable', link: 'nope' });

	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual(['link']);
	expect(screen.getByText(en.organization.join.unreadable)).toBeDefined();
});

test('while the link is read the field is gone and the wait is said', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen({ kind: 'inspecting', link: LINK });

	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getByText(en.organization.join.reading)).toBeDefined();
});

test('an organization that could not be reached says so, shows what the shell said, and offers the same link again', async () => {
	loadLocale('en');
	setLocale('en');

	const onConnect = vi.fn();

	joinScreen(
		{ kind: 'unreachable', link: LINK, message: 'Acme could not be reached' },
		{ onConnect }
	);

	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getByText(en.organization.join.unreachable)).toBeDefined();
	expect(screen.getByText('Acme could not be reached')).toBeDefined();

	await fireEvent.click(screen.getByRole('button', { name: en.organization.join.tryAgain }));

	expect(onConnect).toHaveBeenCalledWith(LINK);
});

// effort 826, requirement 10: a link that admits nobody is refused by name, and the four are
// named from the link rather than from prose the reader has to interpret.
test('each of the four refusals says its own sentence and asks for nothing', () => {
	loadLocale('en');
	setLocale('en');

	const refusals = [
		['lapsed', en.organization.join.lapsed],
		['consumed', en.organization.join.consumed],
		['revoked', en.organization.join.revoked],
		['anotherOrganization', en.organization.join.anotherOrganization]
	] as const;

	for (const [refusal, sentence] of refusals) {
		const rendered = joinScreen({ kind: 'refused', link: LINK, refusal, message: null });

		expect(screen.getByText(sentence), refusal).toBeDefined();
		expect(inputsOnScreen(), refusal).toEqual([]);
		rendered.unmount();
	}
});

test('a lapsed and a revoked link say the same thing about a new link, and neither offers a way on', () => {
	loadLocale('en');
	setLocale('en');

	for (const refusal of ['lapsed', 'revoked'] as const) {
		const rendered = joinScreen({ kind: 'refused', link: LINK, refusal, message: null });

		expect(screen.getByText(en.organization.join[refusal]).textContent, refusal).toContain(
			'ask whoever invited you for a new link'
		);
		expect(
			screen.queryByRole('button', { name: en.organization.join.toSignIn }),
			refusal
		).toBeNull();
		rendered.unmount();
	}
});

// a member signs in on as many machines as they like under one username, and the invitation is
// spent on the first: the second machine is connected by the same link and its way on is the
// wall, where the password they already chose admits them.
test('a link already opened offers the wall, and pressing it hands the shell back', async () => {
	loadLocale('en');
	setLocale('en');

	const onSignIn = vi.fn();

	joinScreen(stepOf({ standing: 'consumed' }), { onSignIn });

	expect(screen.getByText(en.organization.join.consumed)).toBeDefined();

	const toSignIn = screen.getByRole('button', { name: en.organization.join.toSignIn });

	expect(toSignIn.querySelector('svg')).not.toBeNull();
	await fireEvent.click(toSignIn);

	expect(onSignIn).toHaveBeenCalledTimes(1);
});

test('a link for another organization shows what the shell said under the sentence', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen({
		kind: 'refused',
		link: LINK,
		refusal: 'anotherOrganization',
		message: 'this machine already holds Beta; disconnect it before connecting another'
	});

	expect(screen.getByText(en.organization.join.anotherOrganization)).toBeDefined();
	expect(
		screen.getByText('this machine already holds Beta; disconnect it before connecting another')
	).toBeDefined();
});

// effort 824, requirement 1: one way back on every step, in the corner, and it is the only one.
test('every step carries exactly one back control in the corner, and pressing it calls onBack', () => {
	loadLocale('en');
	setLocale('en');

	for (const step of everyStep) {
		const onBack = vi.fn();
		const rendered = joinScreen(step, { onBack });
		const backs = screen.getAllByRole('button', { name: en.organization.join.back });

		expect(backs, step.kind).toHaveLength(1);
		// in the corner rather than in the body: the body is the one element that names the step.
		expect(document.querySelector('[data-join-step]')?.contains(backs[0]!), step.kind).toBe(false);
		expect(backs[0]!.querySelector('svg')?.getAttribute('class'), step.kind).toContain(
			'rtl:rotate-180'
		);

		backs[0]!.click();

		expect(onBack, step.kind).toHaveBeenCalledTimes(1);
		rendered.unmount();
	}
});

test('no step offers the paste-another link the corner control replaced', () => {
	loadLocale('en');
	setLocale('en');

	for (const step of everyStep) {
		const rendered = joinScreen(step);

		expect(screen.queryByRole('button', { name: /paste another/i }), step.kind).toBeNull();
		rendered.unmount();
	}
});

// effort 826, requirement 10: the password is asked on the invitation's step and nowhere else,
// and no step asks for the link and the password at once.
test('only the password step takes a password, and only the field step takes a link', () => {
	loadLocale('en');
	setLocale('en');

	for (const step of everyStep) {
		const rendered = joinScreen(step);
		const names = inputsOnScreen().map((input) => input.getAttribute('name'));

		if (step.kind === 'paste' || step.kind === 'unreadable') {
			expect(names, step.kind).toEqual(['link']);
		} else if (step.kind === 'password') {
			expect(names, step.kind).toEqual(['password', 'confirmation']);
		} else {
			expect(names, step.kind).toEqual([]);
		}

		rendered.unmount();
	}
});

// effort 824, requirement 14: the primary carries its verb.
test('the connect button carries a glyph before its label', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen({ kind: 'paste' });

	expect(
		screen.getByRole('button', { name: en.common.actions.connect }).querySelector('svg')
	).not.toBeNull();
});

// effort 824, requirement 15: the field carries its subject ahead of the input, muted so it does
// not outweigh the label (*Balance weight and contrast*, Refactoring UI p.56).
test('the link field carries a muted leading glyph through the input group', () => {
	loadLocale('en');
	setLocale('en');

	for (const step of [{ kind: 'paste' }, { kind: 'unreadable', link: 'nope' }] as JoinStep[]) {
		const rendered = joinScreen(step);
		const addon = addonBefore('link');

		expect(addon.querySelector('svg'), step.kind).not.toBeNull();
		expect(addon.getAttribute('class'), step.kind).toContain('text-muted-foreground');
		rendered.unmount();
	}
});

test('the screen renders in arabic with the same one field, the same refusals and the same password step', () => {
	loadLocale('ar');
	setLocale('ar');

	const paste = joinScreen({ kind: 'paste' }, { direction: 'rtl' });

	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual(['link']);
	expect(screen.getByText(ar.organization.join.title)).toBeDefined();
	expect(screen.getByRole('button', { name: ar.common.actions.connect })).toBeDefined();
	expect(screen.getAllByRole('button', { name: ar.organization.join.back })).toHaveLength(1);
	paste.unmount();

	const unreadable = joinScreen({ kind: 'unreadable', link: 'nope' }, { direction: 'rtl' });

	expect(screen.getByText(ar.organization.join.unreadable)).toBeDefined();
	unreadable.unmount();

	const unreachable = joinScreen(
		{ kind: 'unreachable', link: LINK, message: 'offline' },
		{ direction: 'rtl' }
	);

	expect(screen.getByText(ar.organization.join.unreachable)).toBeDefined();
	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getAllByRole('button', { name: ar.organization.join.back })).toHaveLength(1);
	unreachable.unmount();

	for (const refusal of ['lapsed', 'consumed', 'revoked', 'anotherOrganization'] as const) {
		const rendered = joinScreen(
			{ kind: 'refused', link: LINK, refusal, message: null },
			{ direction: 'rtl' }
		);

		expect(screen.getByText(ar.organization.join[refusal]), refusal).toBeDefined();
		rendered.unmount();
	}

	const password = joinScreen(stepOf({ standing: 'open', invitation: { username: 'olivia' } }), {
		direction: 'rtl'
	});

	expect(screen.getByText(ar.organization.join.passwordTitle)).toBeDefined();
	expect(screen.getByText(ar.organization.join.confirmLabel)).toBeDefined();
	expect(screen.getByRole('button', { name: ar.common.actions.join })).toBeDefined();
	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual([
		'password',
		'confirmation'
	]);
	password.unmount();

	setLocale('en');
});

// requirement 20 of the spec: the arabic is written rather than copied, and the strings this
// screen added are the ones to read for it.
test('every sentence this screen added is written in both locales', () => {
	const written = [
		'description',
		'linkLabel',
		'lapsed',
		'consumed',
		'revoked',
		'anotherOrganization',
		'toSignIn',
		'passwordTitle',
		'passwordDescription',
		'organizationLabel',
		'usernameLabel',
		'confirmLabel',
		'mismatch'
	] as const;

	for (const key of written) {
		expect(ar.organization.join[key].length, key).toBeGreaterThan(0);
		expect(ar.organization.join[key], key).not.toEqual(en.organization.join[key]);
	}

	expect(ar.common.actions.join).not.toEqual(en.common.actions.join);
	expect(ar.layout.signIn.useALink).not.toEqual(en.layout.signIn.useALink);
});
