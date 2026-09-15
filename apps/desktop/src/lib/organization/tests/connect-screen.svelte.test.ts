import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import ConnectScreen from '$lib/organization/component/connect-screen.svelte';
import { afterRead, pasting, THE_WALL, type JoinStep } from '$lib/organization/connect';
import { PASSWORD_FLOOR } from '$lib/organization/setup';
import type { LinkShape } from '$lib/platform/host';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import Providers from './providers.svelte';

/**
 * THE CONNECT SCREEN, RENDERED
 *
 * `connect.test.ts` drives the steps; this asserts over what each step puts in the document. What
 * is worth pinning: the one form takes the link and its code for all three kinds and each lands
 * where it should, a link that admits nobody is refused by name, each step asks for the fields it
 * needs and nothing else, a refusal marks the field it belongs to, and the sentences are said in
 * both locales.
 *
 * **The landing of each kind of link is taken from `afterRead`** rather than written out, so
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
		onConnect?: (link: string, code: string) => void;
		onJoin?: (link: string, code: string, password: string) => void;
		onSignIn?: () => void;
		onBack?: () => void;
		direction?: 'ltr' | 'rtl';
	} = {}
) =>
	render(
		ConnectScreen,
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

const shape = (overrides: Partial<LinkShape> = {}): LinkShape => ({
	organizationId: 'acme',
	organizationName: 'Acme Rentals',
	kind: 'organization',
	expiresAt: null,
	...overrides
});

const CODE = '7K4M9Q';

/** where the link the form took lands, once its text has been decoded. */
const landingOf = (overrides: Partial<LinkShape> = {}) => afterRead(LINK, CODE, shape(overrides));

/** the landing that stays on this screen, for the tests that render one. */
const stepOf = (overrides: Partial<LinkShape>) => landingOf(overrides) as JoinStep;

const A_CHOSEN_PASSWORD = 'x'.repeat(PASSWORD_FLOOR);

/** one of every step, each with a link where the step holds one. */
const everyStep: JoinStep[] = [
	pasting(),
	{ ...pasting('nope', CODE), isUnreadable: true },
	{ kind: 'reading', link: LINK, code: CODE },
	{ kind: 'unreachable', link: LINK, code: CODE, message: 'offline' },
	{ kind: 'refused', link: LINK, refusal: 'lapsed', message: null },
	stepOf({ kind: 'invitation', expiresAt: 1 })
];

/** the password step written out, for the assertions that set a refusal on it. */
const passwordStep = (overrides: Partial<Extract<JoinStep, { kind: 'password' }>> = {}) => ({
	...(stepOf({ kind: 'invitation', expiresAt: 1 }) as Extract<JoinStep, { kind: 'password' }>),
	...overrides
});

// effort 828, requirements 1 and 17, and criterion 17: every link needs the code that came with
// it, so the first step is one form of the two halves, before anything has been read.
test('before any link is read the form takes the link and the code, both typed left to right', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen(pasting());

	const inputs = inputsOnScreen();

	expect(inputs.map((input) => input.getAttribute('name'))).toEqual(['link', 'code']);
	expect(inputs.map((input) => input.getAttribute('dir'))).toEqual(['ltr', 'ltr']);
	expect(screen.getByText(en.organization.join.linkLabel)).toBeDefined();
	expect(screen.getByText(en.organization.join.codeLabel)).toBeDefined();
	expect(screen.getByRole('button', { name: en.common.actions.connect })).toBeDefined();
	expect(screen.queryByText(en.organization.join.unreadable)).toBeNull();
});

// a link the operating system handed over arrives in the field with the code still to type: the
// screen opens on what it was given rather than on an empty form.
test('a link the step arrived with is already in the field', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen(pasting(LINK, CODE));

	expect(document.querySelector<HTMLInputElement>('input[name=link]')?.value).toBe(LINK);
	expect(document.querySelector<HTMLInputElement>('input[name=code]')?.value).toBe(CODE);
});

// effort 824, requirement 18: a pasted link reaches the route as it was typed, and the route
// runs the connect; what a link is, and what wrapped it, are decided past this screen.
test('submitting the form calls onConnect with the link and the code, and an empty field does not', async () => {
	loadLocale('en');
	setLocale('en');

	const onConnect = vi.fn();

	joinScreen(pasting(), { onConnect });

	const connect = screen.getByRole('button', { name: en.common.actions.connect });
	const form = connect.closest('form')!;

	expect(connect.hasAttribute('disabled')).toBe(true);
	await fireEvent.submit(form);
	expect(onConnect).not.toHaveBeenCalled();

	await fireEvent.input(document.querySelector('input[name="link"]')!, {
		target: { value: `  ${LINK}  ` }
	});

	const code = document.querySelector<HTMLInputElement>('input[name=code]')!;

	// half a code is a field to finish, not a round trip to the shell.
	await fireEvent.input(code, { target: { value: '7k4m9' } });
	expect(connect.hasAttribute('disabled')).toBe(true);

	// upper-cased as typed, and what a person reads out with spaces in is taken as the six.
	await fireEvent.input(code, { target: { value: '7k4 m9-q' } });

	expect(code.value).toBe(CODE);
	expect(connect.hasAttribute('disabled')).toBe(false);
	await fireEvent.submit(form);
	expect(onConnect).toHaveBeenCalledWith(`  ${LINK}  `, CODE);
});

// the organization's own link is the one link that still connects without a code (effort 828,
// requirement 16 retires it, and ticket 12 with it), so an empty code is not a half-typed one.
test('an empty code still continues, and the link alone is what the form needs', async () => {
	loadLocale('en');
	setLocale('en');

	const onConnect = vi.fn();

	joinScreen(pasting(), { onConnect });

	const connect = screen.getByRole('button', { name: en.common.actions.connect });

	await fireEvent.input(document.querySelector('input[name=link]')!, { target: { value: LINK } });

	expect(connect.hasAttribute('disabled')).toBe(false);
	await fireEvent.submit(connect.closest('form')!);
	expect(onConnect).toHaveBeenCalledWith(LINK, '');
});

// effort 826, requirement 10; effort 828, requirement 17 and criterion 17: one form, three kinds
// of link, and each lands in its own place. Two of the three are connected in the read's own wait
// and their landing is the wall, which this screen does not draw: the organization's own link, and
// a link a member made for this machine, connected with the code the form already took.
test('an organization link and a machine link connect with no further field, and land on the wall', () => {
	loadLocale('en');
	setLocale('en');

	expect(landingOf()).toBe(THE_WALL);
	expect(landingOf({ kind: 'machine', expiresAt: 1 })).toBe(THE_WALL);
});

// *Naming the invited person went with the read that reached the organization (effort 828,
// requirement 1): the username is sealed under the content key, the code is one half of what opens
// the vault that holds it, and nobody has typed one when a link is read. The organization is what
// the person recognises.*
test('an invitation link pasted into the field lands on the password step, naming the organization', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen(stepOf({ kind: 'invitation', expiresAt: 1 }));

	expect(document.querySelector('[data-join-step]')?.getAttribute('data-join-step')).toBe(
		'password'
	);
	expect(screen.getByText('Acme Rentals')).toBeDefined();
	expect(screen.queryByText('olivia')).toBeNull();
	// named and not typed: the facts the link carried are text, and the fields are the two the
	// person is choosing. The code was given on the form that took the link and is not asked twice.
	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual([
		'password',
		'confirmation'
	]);
	expect(screen.getByText(en.organization.join.passwordTitle)).toBeDefined();
});

// effort 828, criterion 1: every link carries a sealed credential now, so the code field is on
// the one form every link is read from, and on no step past it.
test('the code field is on the form every link is read from, and on no step after it', () => {
	loadLocale('en');
	setLocale('en');

	for (const step of everyStep) {
		const rendered = joinScreen(step);

		expect(document.querySelector('input[name=code]') !== null, step.kind).toBe(
			step.kind === 'paste'
		);
		rendered.unmount();
	}
});

// effort 826, requirement 23: the code field sits under the link it came with, is six characters,
// and is a machine string. Its sentence says what the six characters are and how long they last.
test('the code field is under the link, six characters, with its own sentence', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen(pasting());

	const link = document.querySelector<HTMLInputElement>('input[name=link]')!;
	const code = document.querySelector<HTMLInputElement>('input[name=code]')!;

	expect(code.getAttribute('maxlength')).toBe('6');
	expect(code.getAttribute('dir')).toBe('ltr');
	expect(screen.getByText(en.organization.join.codeDescription)).toBeDefined();
	// under the link, in the document's own order: the link is what a person pastes first.
	expect(link.compareDocumentPosition(code) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

// requirement 23's two refusals and criterion 17: each said by name in the reader's own language,
// with what the shell said kept under it, and each marking the field the person answers it on.
// A wrong code comes back `forbidden` and a code nobody typed `invalidInput`.
test('a wrong code and a missing one are each refused by name, and mark the code field', () => {
	loadLocale('en');
	setLocale('en');

	const wrong = joinScreen({
		...pasting(LINK, CODE),
		codeRefusal: 'wrong',
		errorMessage: 'the code is wrong; ask whoever sent you the link to read it out again'
	});

	expect(screen.getByText(en.organization.join.codeWrong)).toBeDefined();
	expect(document.querySelector('[data-join-detail]')?.textContent).toBe(
		'the code is wrong; ask whoever sent you the link to read it out again'
	);
	expect(document.querySelector('input[name=code]')?.getAttribute('aria-invalid')).toBe('true');
	// the link is the other half and nothing is wrong with it, so it is not marked and what was
	// typed is still there to try again with.
	expect(document.querySelector('input[name=link]')?.getAttribute('aria-invalid')).toBe('false');
	expect(document.querySelector<HTMLInputElement>('input[name=link]')?.value).toBe(LINK);
	wrong.unmount();

	joinScreen({ ...pasting(LINK, CODE), codeRefusal: 'missing' });

	expect(screen.getByText(en.organization.join.codeMissing)).toBeDefined();
	expect(en.organization.join.codeMissing).not.toBe(en.organization.join.codeWrong);
});

test('the password step holds the floor and the confirmation, and only a matching pair joins', async () => {
	loadLocale('en');
	setLocale('en');

	const onJoin = vi.fn();

	joinScreen(stepOf({ kind: 'invitation', expiresAt: 1 }), { onJoin });

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

	// the code the form took is handed back to the accept with the password, so the person gives
	// it once (effort 828, requirement 17).
	expect(onJoin).toHaveBeenCalledWith(LINK, CODE, A_CHOSEN_PASSWORD);
});

// effort 826, requirement 14 of effort 824 still: the primary carries its verb, and the two
// password fields carry their subject.
test('the join carries a glyph and both password fields a muted leading one', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen(stepOf({ kind: 'invitation', expiresAt: 1 }));

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
	joinScreen(passwordStep({ isJoining: true }));

	for (const input of inputsOnScreen()) {
		expect(input.hasAttribute('disabled')).toBe(true);
	}

	expect(screen.getByRole('button', { name: en.common.actions.working })).toBeDefined();
});

test('an accept that was refused says what the shell said, over the fields', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen(passwordStep({ errorMessage: 'the invitation to Acme Rentals was already opened' }));

	expect(screen.getByText('the invitation to Acme Rentals was already opened')).toBeDefined();
	expect(inputsOnScreen()).toHaveLength(2);
});

// criterion 17: the link is the half that is wrong, so the form comes back with the link field
// marked and the code the person typed still in it ([[rules/interface]], *Validation errors*).
test('text that was not a link keeps the form, says so, and marks the link field', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen({ ...pasting('nope', CODE), isUnreadable: true });

	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual(['link', 'code']);
	expect(screen.getByText(en.organization.join.unreadable)).toBeDefined();
	expect(document.querySelector('input[name=link]')?.getAttribute('aria-invalid')).toBe('true');
	expect(document.querySelector('input[name=code]')?.getAttribute('aria-invalid')).toBe('false');
	expect(document.querySelector<HTMLInputElement>('input[name=code]')?.value).toBe(CODE);
});

test('while the link is read the fields are gone and the wait is said', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen({ kind: 'reading', link: LINK, code: CODE });

	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getByText(en.organization.join.reading)).toBeDefined();
});

test('an organization that could not be reached says so, shows what the shell said, and offers the same link again', async () => {
	loadLocale('en');
	setLocale('en');

	const onConnect = vi.fn();

	joinScreen(
		{ kind: 'unreachable', link: LINK, code: CODE, message: 'Acme could not be reached' },
		{ onConnect }
	);

	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getByText(en.organization.join.unreachable)).toBeDefined();
	expect(screen.getByText('Acme could not be reached')).toBeDefined();

	await fireEvent.click(screen.getByRole('button', { name: en.organization.join.tryAgain }));

	// the same pair, since neither half was the reason: what went is the connection.
	expect(onConnect).toHaveBeenCalledWith(LINK, CODE);
});

// effort 826, requirement 10; effort 828, requirement 1: a link that admits nobody is refused by
// name, and the five are named from the code Rust rejected with rather than from prose the reader
// has to interpret.
test('each of the five refusals says its own sentence and asks for nothing', () => {
	loadLocale('en');
	setLocale('en');

	const refusals = [
		['lapsed', en.organization.join.lapsed],
		['consumed', en.organization.join.consumed],
		['revoked', en.organization.join.revoked],
		['replaced', en.organization.join.replaced],
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
// wall, where the password they already chose admits them. *Which act answers the consumed
// standing is ticket 05's; what the step draws is this one's, so the step is written out here
// rather than taken from a read that no longer judges rows.*
test('a link already opened offers the wall, and pressing it hands the shell back', async () => {
	loadLocale('en');
	setLocale('en');

	const onSignIn = vi.fn();

	joinScreen({ kind: 'refused', link: LINK, refusal: 'consumed', message: null }, { onSignIn });

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

// effort 826, requirement 10; effort 828, requirement 17: the link and its code are one form, the
// password is asked on the invitation's step and nowhere else, and no step asks for all four.
test('only the password step takes a password, and only the form takes the link and the code', () => {
	loadLocale('en');
	setLocale('en');

	for (const step of everyStep) {
		const rendered = joinScreen(step);
		const names = inputsOnScreen().map((input) => input.getAttribute('name'));

		if (step.kind === 'paste') {
			expect(names, step.kind).toEqual(['link', 'code']);
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
	joinScreen(pasting());

	expect(
		screen.getByRole('button', { name: en.common.actions.connect }).querySelector('svg')
	).not.toBeNull();
});

// effort 824, requirement 15: the field carries its subject ahead of the input, muted so it does
// not outweigh the label (*Balance weight and contrast*, Refactoring UI p.56).
test('the link field carries a muted leading glyph through the input group', () => {
	loadLocale('en');
	setLocale('en');

	for (const step of [pasting(), { ...pasting('nope', CODE), isUnreadable: true }] as JoinStep[]) {
		const rendered = joinScreen(step);

		for (const name of ['link', 'code']) {
			const addon = addonBefore(name);

			expect(addon.querySelector('svg'), name).not.toBeNull();
			expect(addon.getAttribute('class'), name).toContain('text-muted-foreground');
		}

		rendered.unmount();
	}
});

test('the screen renders in arabic with the same one form, the same refusals and the password step', () => {
	loadLocale('ar');
	setLocale('ar');

	const paste = joinScreen(pasting(), { direction: 'rtl' });

	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual(['link', 'code']);
	expect(screen.getByText(ar.organization.join.title)).toBeDefined();
	expect(screen.getByText(ar.organization.join.codeLabel)).toBeDefined();
	expect(ar.organization.join.codeLabel).not.toBe(en.organization.join.codeLabel);
	// a machine string, read left to right whatever the sentence around it does.
	expect(document.querySelector('input[name=code]')?.getAttribute('dir')).toBe('ltr');
	expect(screen.getByRole('button', { name: ar.common.actions.connect })).toBeDefined();
	expect(screen.getAllByRole('button', { name: ar.organization.join.back })).toHaveLength(1);
	paste.unmount();

	const unreadable = joinScreen(
		{ ...pasting('nope', CODE), isUnreadable: true },
		{ direction: 'rtl' }
	);

	expect(screen.getByText(ar.organization.join.unreadable)).toBeDefined();
	unreadable.unmount();

	const unreachable = joinScreen(
		{ kind: 'unreachable', link: LINK, code: CODE, message: 'offline' },
		{ direction: 'rtl' }
	);

	expect(screen.getByText(ar.organization.join.unreachable)).toBeDefined();
	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getAllByRole('button', { name: ar.organization.join.back })).toHaveLength(1);
	unreachable.unmount();

	for (const refusal of [
		'lapsed',
		'consumed',
		'revoked',
		'replaced',
		'anotherOrganization'
	] as const) {
		const rendered = joinScreen(
			{ kind: 'refused', link: LINK, refusal, message: null },
			{ direction: 'rtl' }
		);

		expect(screen.getByText(ar.organization.join[refusal]), refusal).toBeDefined();
		rendered.unmount();
	}

	const password = joinScreen(stepOf({ kind: 'invitation', expiresAt: 1 }), {
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
		'reading',
		'lapsed',
		'consumed',
		'revoked',
		'replaced',
		'anotherOrganization',
		'toSignIn',
		'passwordTitle',
		'passwordDescription',
		'codeLabel',
		'codeDescription',
		'organizationLabel',
		'codeMissing',
		'codeWrong',
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
