import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import ConnectScreen from '$lib/organization/setup/component/connect-screen.svelte';
import { afterRead, pasting, THE_WALL, type JoinStep } from '$lib/organization/setup/connect';
import { PASSWORD_FLOOR } from '$lib/organization/setup/setup';
import type { LinkShape } from '$lib/organization/host';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import Providers from '#tests/providers.svelte';
import { expectTheEye } from '#tests/password-eye.ts';

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

/**
 * the message the field holding `name`'s input is marked with, or `null` where it carries none.
 *
 * Read off the field rather than off the document, because what the interface rule asks is which
 * control the sentence belongs to and a `getByText` is answered by a summary just as happily.
 */
const fieldErrorOn = (name: string) =>
	document
		.querySelector(`input[name=${name}]`)
		?.closest('[data-slot=field]')
		?.querySelector('[data-slot=field-error]')?.textContent ?? null;

/** every sentence the document draws in a callout, which is where a summary would be. */
const inCallouts = () =>
	[...document.querySelectorAll('[data-slot=callout]')].map((node) => node.textContent);

const joinScreen = (
	step: JoinStep,
	overrides: {
		onConnect?: (link: string, code: string) => void;
		onJoin?: (link: string, code: string, password: string) => void;
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
			onBack: overrides.onBack ?? noop
		},
		{
			wrapper: Providers,
			wrapperProps: { strings, direction: overrides.direction ?? 'ltr' }
		}
	);

const inputsOnScreen = () =>
	Array.from(document.querySelectorAll<HTMLInputElement>('input, textarea, select'));

/** the buttons a step draws, which leaves out back, the foot control and what it opens. */
const stepButtons = () =>
	Array.from(document.querySelectorAll<HTMLButtonElement>('[data-join-step] button'));

/** whether a button is drawn prominent: the filled primary variant. */
const isProminent = (button: HTMLElement) => button.className.includes('bg-primary');

const LINK = 'rentable://join/abc';

const shape = (overrides: Partial<LinkShape> = {}): LinkShape => ({
	organizationId: 'acme',
	organizationName: 'Acme Rentals',
	kind: 'invitation',
	expiresAt: 1,
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
	{ kind: 'unreachable', link: LINK, code: CODE, detail: 'offline' },
	{ kind: 'refused', link: LINK, refusal: 'lapsed', detail: null },
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
	expect(screen.getByRole('button', { name: en.organization.join.continue })).toBeDefined();
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

	const connect = screen.getByRole('button', { name: en.organization.join.continue });
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

// effort 828, criterion 16: **there is no code-free path.** The organization's own link was the
// one kind that connected with no code, and it retired with requirement 16; every link left
// carries a payload nothing opens without the six characters, so a link with an empty code beside
// it is a form to finish rather than a continue the shell can only refuse. *The form admitted an
// empty code until ticket 20, which is a round trip whose answer was always the same.*
test('a link with no code does not continue, and the six characters are what release it', async () => {
	loadLocale('en');
	setLocale('en');

	const onConnect = vi.fn();

	joinScreen(pasting(), { onConnect });

	const connect = screen.getByRole('button', { name: en.organization.join.continue });

	await fireEvent.input(document.querySelector('input[name=link]')!, { target: { value: LINK } });

	expect(connect.hasAttribute('disabled')).toBe(true);
	await fireEvent.submit(connect.closest('form')!);
	expect(onConnect).not.toHaveBeenCalled();

	await fireEvent.input(document.querySelector('input[name=code]')!, { target: { value: CODE } });

	expect(connect.hasAttribute('disabled')).toBe(false);
	await fireEvent.submit(connect.closest('form')!);
	expect(onConnect).toHaveBeenCalledWith(LINK, CODE);
});

// effort 826, requirement 10; effort 828, requirements 16 and 17 and criteria 16 and 17: one form,
// two kinds of link, and each lands in its own place. A link a member made for this machine is
// connected in the read's own wait, with the code the form already took, and its landing is the
// wall, which this screen does not draw.
//
// **And there is no code-free path** (effort 828, criterion 16). A third kind, the organization's
// own link, carried a legible credential and connected with no code at all; it retired with
// requirement 16, so every landing this screen has is on the other side of a code the person typed.
test('a machine link connects with no further field, and lands on the wall', () => {
	loadLocale('en');
	setLocale('en');

	expect(landingOf({ kind: 'machine', expiresAt: 1 })).toBe(THE_WALL);
	// the two kinds are the whole of what a read can answer, and neither is reached without the
	// code: the form takes both halves before anything is read.
	expect(landingOf({ kind: 'invitation', expiresAt: 1 })).not.toBe(THE_WALL);
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
// with what the shell said kept behind a closed disclosure, and each marking the field the person
// answers it on. Effort 832, requirement 19: the field's sentence is the one line, and nothing
// beside it says it again.
// A wrong code comes back refused as `codeWrong` and a code nobody typed as `codeMissing`.
test('a wrong code and a missing one are each refused by name, and mark the code field', () => {
	loadLocale('en');
	setLocale('en');

	const wrong = joinScreen({
		...pasting(LINK, CODE),
		codeRefusal: 'wrong',
		detail: 'the seal did not open under that code'
	});

	expect(screen.getByText(en.organization.join.codeWrong)).toBeDefined();
	// the sentence sits on the code field and in no callout over the form: a validation error marks
	// its own field and no form places a summary ([[rules/interface]], *Validation errors*).
	expect(fieldErrorOn('code')).toBe(en.organization.join.codeWrong);
	expect(inCallouts()).toEqual([]);
	// what the shell said is behind the disclosure, closed, and not a second line on the screen.
	expect(document.querySelector('[data-error-detail="join"]')).not.toBeNull();
	expect(document.body.textContent).not.toContain('the seal did not open under that code');
	expect(document.querySelector('input[name=code]')?.getAttribute('aria-invalid')).toBe('true');
	// the link is the other half and nothing is wrong with it, so it is not marked and what was
	// typed is still there to try again with.
	expect(document.querySelector('input[name=link]')?.getAttribute('aria-invalid')).toBe('false');
	expect(document.querySelector<HTMLInputElement>('input[name=link]')?.value).toBe(LINK);
	wrong.unmount();

	joinScreen({ ...pasting(LINK, CODE), codeRefusal: 'missing' });

	expect(screen.getByText(en.organization.join.codeMissing)).toBeDefined();
	expect(fieldErrorOn('code')).toBe(en.organization.join.codeMissing);
	expect(inCallouts()).not.toContain(en.organization.join.codeMissing);
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

// effort 843, requirement 8: the password step's fields are labels and inputs, with no glyph.
test('the password step draws its two fields and its join with no glyph', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen(stepOf({ kind: 'invitation', expiresAt: 1 }));

	expect(
		screen.getByRole('button', { name: en.common.actions.join }).querySelector('svg')
	).toBeNull();
	// the one glyph a field carries is the password's eye at its trailing end, which is a control
	// rather than a decoration (effort 851, requirement 19); nothing leads a field.
	expect(
		document.querySelector('[data-slot=input-group-addon][data-align=inline-start]')
	).toBeNull();
	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual([
		'password',
		'confirmation'
	]);
});

// effort 851, criterion 19: both of the password step's fields carry the eye.
test('the password and its confirmation each carry the eye', async () => {
	loadLocale('en');
	setLocale('en');
	joinScreen(stepOf({ kind: 'invitation', expiresAt: 1 }));

	for (const id of ['#join-password', '#join-confirmation']) {
		await expectTheEye(document.querySelector<HTMLInputElement>(id), strings.showPassword);
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
	// on the link field, and nowhere else: the same rule as the code's refusal above.
	expect(fieldErrorOn('link')).toBe(en.organization.join.unreadable);
	expect(fieldErrorOn('code')).toBe(null);
	expect(inCallouts()).not.toContain(en.organization.join.unreadable);
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

// effort 843, ticket 14: a refused read hands the form back with no back pressed and the position
// unchanged, and the surface is told it is a return, so the change runs back rather than forward.
test.each([
	['text that was not a link', { ...pasting('nope', CODE), isUnreadable: true }],
	['a wrong code', { ...pasting(LINK, CODE), codeRefusal: 'wrong' as const }]
])('the form handed back after a refused read runs back: %s', async (_, handedBack) => {
	loadLocale('en');
	setLocale('en');

	const shifts: string[] = [];

	document.startViewTransition = ((update: () => void) => {
		shifts.push(document.documentElement.style.getPropertyValue('--way-in-shift'));
		update();

		const finished = Promise.resolve();

		return { finished, ready: finished, updateCallbackDone: finished, skipTransition: noop };
	}) as unknown as typeof document.startViewTransition;

	try {
		const { rerender } = joinScreen(pasting(LINK, CODE));

		await rerender({ step: { kind: 'reading', link: LINK, code: CODE } });
		await rerender({ step: handedBack });

		// into the wait is forward, and out of it to the form it was submitted from is back.
		expect(shifts).toEqual(['1', '-1']);
	} finally {
		delete (document as { startViewTransition?: unknown }).startViewTransition;
	}
});

test('an organization that could not be reached says so, shows what the shell said, and offers the same link again', async () => {
	loadLocale('en');
	setLocale('en');

	const onConnect = vi.fn();

	joinScreen(
		{ kind: 'unreachable', link: LINK, code: CODE, detail: 'Acme could not be reached' },
		{ onConnect }
	);

	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getByText(en.organization.join.unreachable)).toBeDefined();
	// the one line, and what the shell said behind the disclosure until somebody asks for it.
	expect(screen.queryByText('Acme could not be reached')).toBeNull();
	await fireEvent.click(screen.getByRole('button', { name: en.common.actions.details }));
	expect(screen.getByText('Acme could not be reached')).toBeDefined();

	await fireEvent.click(screen.getByRole('button', { name: en.organization.join.tryAgain }));

	// the same pair, since neither half was the reason: what went is the connection.
	expect(onConnect).toHaveBeenCalledWith(LINK, CODE);
});

// effort 826, requirement 10; effort 828, requirement 1: a link that admits nobody is refused by
// name, and the four are named from the code Rust rejected with rather than from prose the reader
// has to interpret. *There were five until effort 851 let a machine hold several organizations.*
test('each of the four refusals says its own sentence and asks for nothing', () => {
	loadLocale('en');
	setLocale('en');

	const refusals = [
		['lapsed', en.organization.join.lapsed],
		['consumed', en.organization.join.consumed],
		['revoked', en.organization.join.revoked],
		['replaced', en.organization.join.replaced]
	] as const;

	for (const [refusal, sentence] of refusals) {
		const rendered = joinScreen({
			kind: 'refused',
			link: LINK,
			refusal,
			detail: null
		});

		expect(screen.getByText(sentence), refusal).toBeDefined();
		expect(inputsOnScreen(), refusal).toEqual([]);
		rendered.unmount();
	}
});

test('a lapsed and a revoked link both send the reader for a new one, and neither offers a way on', () => {
	loadLocale('en');
	setLocale('en');

	for (const refusal of ['lapsed', 'revoked'] as const) {
		const rendered = joinScreen({
			kind: 'refused',
			link: LINK,
			refusal,
			detail: null
		});

		expect(screen.getByText(en.organization.join[refusal]).textContent, refusal).toContain(
			'ask whoever sent it for a new one'
		);
		expect(stepButtons().filter(isProminent), refusal).toEqual([]);
		rendered.unmount();
	}
});

// effort 851, requirement 10: **a link and its code admit one machine, once.** Neither kind of
// link records anything before its row is judged, so a link already used has nowhere to lead: the
// step says so in one sentence, sends the reader to the owner or a manager for a new one, and
// offers no way on. *It offered the wall where an invitation's accept had recorded the
// organization first, and said something else for a machine link, until effort 851.*
test('a link already used says to ask the owner or a manager for a new one, and offers no way on', () => {
	for (const [locale, strings, direction] of [
		['en', en, 'ltr'],
		['ar', ar, 'rtl']
	] as const) {
		loadLocale(locale);
		setLocale(locale);

		const rendered = joinScreen(
			{ kind: 'refused', link: LINK, refusal: 'consumed', detail: null },
			{ direction }
		);

		expect(inCallouts(), locale).toEqual([strings.organization.join.consumed]);
		expect(inputsOnScreen(), locale).toEqual([]);
		expect(stepButtons().filter(isProminent), locale).toEqual([]);
		rendered.unmount();
	}

	expect(en.organization.join.consumed).toContain('already used');
	expect(en.organization.join.consumed).toContain('ask the owner or a manager for a new one');
	setLocale('en');
});

test('a refused link keeps what the shell said behind the disclosure under the sentence', async () => {
	loadLocale('en');
	setLocale('en');
	joinScreen({
		kind: 'refused',
		link: LINK,
		refusal: 'consumed',
		detail: 'the invitation to Acme was already opened'
	});

	expect(inCallouts()).toEqual([en.organization.join.consumed]);
	expect(screen.queryByText('the invitation to Acme was already opened')).toBeNull();

	await fireEvent.click(screen.getByRole('button', { name: en.common.actions.details }));

	expect(screen.getByText('the invitation to Acme was already opened')).toBeDefined();
});

// effort 832, requirement 19 and ticket 23: **every refusal is one line, and it names the next
// step.** Before ticket 23 the screen drew its own sentence and the shell's translated one under
// it, which said the same thing twice, and the sentences ran to two or three clauses of
// explanation. Each of them is now what happened and what to do, short enough to sit on one
// line of the card, and it is the only line the step draws. *There were six until effort 851 took
// `anotherOrganization` away.*
test('each of the five refusals is one line, the only one drawn, and names the next step', () => {
	const five = [
		['lapsed', { kind: 'refused', refusal: 'lapsed' }],
		['consumed', { kind: 'refused', refusal: 'consumed' }],
		['revoked', { kind: 'refused', refusal: 'revoked' }],
		['replaced', { kind: 'refused', refusal: 'replaced' }],
		['unreachable', { kind: 'unreachable', code: CODE }]
	] as const;

	// what the reader does next, one of which each english sentence names.
	const nextSteps = ['ask whoever sent it', 'ask the owner or a manager', 'try again'];

	for (const [locale, strings, direction] of [
		['en', en, 'ltr'],
		['ar', ar, 'rtl']
	] as const) {
		loadLocale(locale);
		setLocale(locale);

		for (const [key, partial] of five) {
			const sentence = strings.organization.join[key];
			const named = `${locale}.${key}`;

			// one line: no break, and short enough for the card's measure.
			expect(sentence, named).not.toContain('\n');
			expect(sentence.length, named).toBeLessThanOrEqual(80);

			if (locale === 'en') {
				expect(
					nextSteps.some((next) => sentence.includes(next)),
					named
				).toBe(true);
			}

			const rendered = joinScreen(
				{ ...partial, link: LINK, detail: 'what the shell said' } as JoinStep,
				{ direction }
			);

			// the only sentence on the step is its own, once, with the detail closed under it.
			expect(inCallouts(), named).toEqual([sentence]);
			expect(document.body.textContent?.split(sentence).length, named).toBe(2);
			expect(document.body.textContent, named).not.toContain('what the shell said');
			expect(document.querySelector('[data-error-detail="join"]'), named).not.toBeNull();
			rendered.unmount();
		}
	}

	setLocale('en');
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

// effort 843, requirement 5: every step that offers an act offers one prominent one.
test('every step with an act draws exactly one prominent button', () => {
	loadLocale('en');
	setLocale('en');

	const steps: [string, JoinStep][] = [
		['paste', pasting(LINK, CODE)],
		['unreachable', { kind: 'unreachable', link: LINK, code: CODE, detail: null }],
		['password', stepOf({ kind: 'invitation', expiresAt: 1 })]
	];

	for (const [label, step] of steps) {
		const rendered = joinScreen(step);

		expect(stepButtons().filter(isProminent), label).toHaveLength(1);
		rendered.unmount();
	}
});

// effort 843, requirement 4: the join counts its steps as the first run does, in the small line
// above the title: the link and its code are the first, the password the second.
test('the link is step 1 of 2 and the password step 2 of 2, above the title', () => {
	loadLocale('en');
	setLocale('en');

	for (const [step, at] of [
		[pasting(), 1],
		[{ kind: 'reading', link: LINK, code: CODE }, 1],
		[stepOf({ kind: 'invitation', expiresAt: 1 }), 2]
	] as [JoinStep, number][]) {
		const rendered = joinScreen(step);
		const lines = document.querySelectorAll('[data-way-in-position]');

		expect(lines, step.kind).toHaveLength(1);
		expect(lines[0]?.textContent?.trim(), step.kind).toBe(`step ${at} of 2`);
		rendered.unmount();
	}
});

// effort 843, ticket 07: the words the human accepted on screen, and nothing on the way names Turso.
test('the join reads in the plain words, and names no Turso on any step', () => {
	for (const [locale, strings] of [
		['en', en],
		['ar', ar]
	] as const) {
		loadLocale(locale);
		setLocale(locale);

		const paste = joinScreen(pasting(), { direction: locale === 'ar' ? 'rtl' : 'ltr' });

		expect(screen.getByRole('heading').textContent?.trim(), locale).toBe(
			strings.organization.join.title
		);
		expect(screen.getByText(strings.organization.join.description), locale).toBeDefined();
		expect(screen.getByText(strings.organization.join.codeDescription), locale).toBeDefined();
		expect(
			screen.getByRole('button', { name: strings.organization.join.continue }),
			locale
		).toBeDefined();
		expect(document.body.textContent, locale).not.toMatch(/turso/i);
		paste.unmount();

		const choosing = joinScreen(stepOf({ kind: 'invitation', expiresAt: 1 }));

		expect(screen.getByRole('heading').textContent?.trim(), locale).toBe(
			strings.organization.join.passwordTitle
		);
		expect(screen.getByText(strings.organization.join.passwordDescription), locale).toBeDefined();
		expect(screen.getByText(strings.organization.join.confirmLabel), locale).toBeDefined();
		expect(document.body.textContent, locale).not.toMatch(/turso/i);
		choosing.unmount();
	}

	loadLocale('en');
	setLocale('en');
	expect(en.organization.join.title).toBe('join with a link');
	expect(en.organization.join.description).toBe(
		'paste the link and enter the code you were given.'
	);
	expect(en.organization.join.codeDescription).toBe('6 characters.');
	expect(en.organization.join.passwordTitle).toBe('choose a password');
	expect(en.organization.join.passwordDescription).toBe(
		"you'll use it to sign in. it can't be recovered."
	);
	expect(en.organization.join.confirmLabel).toBe('confirm password');
});

// requirement 8: arriving at a step that asks for typing puts the cursor in its first field.
test('arriving at the form focuses the link, and at the password step the password', async () => {
	loadLocale('en');
	setLocale('en');

	for (const [step, first] of [
		[pasting(), 'link'],
		[stepOf({ kind: 'invitation', expiresAt: 1 }), 'password']
	] as [JoinStep, string][]) {
		const rendered = joinScreen(step);

		await waitFor(() => expect(document.activeElement?.getAttribute('name'), first).toBe(first));
		rendered.unmount();
	}
});

// ticket 07, its last criterion: the foot of both steps is the language and appearance control,
// with no acts of its own.
test('both steps carry the preferences control at their foot, and nothing else there', () => {
	loadLocale('en');
	setLocale('en');

	for (const step of [pasting(), stepOf({ kind: 'invitation', expiresAt: 1 })] as JoinStep[]) {
		const rendered = joinScreen(step);
		const foot = document.querySelector('[data-way-in-foot]');

		expect(foot?.querySelectorAll('button'), step.kind).toHaveLength(1);
		expect(foot?.querySelector('[data-way-in-preferences]'), step.kind).not.toBeNull();
		rendered.unmount();
	}
});

// effort 843, requirement 8: the link and the code are labels and inputs with no glyph, typed left
// to right in both locales, and they take a paste.
test('the link and code fields draw no glyph, stay left to right, and take a paste', async () => {
	loadLocale('ar');
	setLocale('ar');

	joinScreen(pasting(), { direction: 'rtl' });

	expect(document.querySelector('[data-slot=input-group-addon]')).toBeNull();

	const link = document.querySelector<HTMLInputElement>('input[name="link"]')!;
	const code = document.querySelector<HTMLInputElement>('input[name="code"]')!;

	expect(link.getAttribute('dir')).toBe('ltr');
	expect(code.getAttribute('dir')).toBe('ltr');

	// a paste lands as input does: the field holds what was pasted.
	await fireEvent.input(link, { target: { value: LINK } });
	await fireEvent.input(code, { target: { value: '7k4-m9q' } });

	expect(link.value).toBe(LINK);
	expect(code.value).toBe(CODE);

	loadLocale('en');
	setLocale('en');
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
	expect(screen.getByRole('button', { name: ar.organization.join.continue })).toBeDefined();
	expect(screen.getAllByRole('button', { name: ar.organization.join.back })).toHaveLength(1);
	paste.unmount();

	const unreadable = joinScreen(
		{ ...pasting('nope', CODE), isUnreadable: true },
		{ direction: 'rtl' }
	);

	expect(screen.getByText(ar.organization.join.unreadable)).toBeDefined();
	unreadable.unmount();

	const unreachable = joinScreen(
		{ kind: 'unreachable', link: LINK, code: CODE, detail: 'offline' },
		{ direction: 'rtl' }
	);

	expect(screen.getByText(ar.organization.join.unreachable)).toBeDefined();
	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getAllByRole('button', { name: ar.organization.join.back })).toHaveLength(1);
	unreachable.unmount();

	for (const refusal of ['lapsed', 'consumed', 'revoked', 'replaced'] as const) {
		const rendered = joinScreen(
			{ kind: 'refused', link: LINK, refusal, detail: null },
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
		'unreachable',
		'lapsed',
		'consumed',
		'revoked',
		'replaced',
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
});
