import { render, screen } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import JoinScreen from '$lib/organization/component/join-screen.svelte';
import type { JoinStep } from '$lib/organization/join';
import type { LinkFacts } from '$lib/platform/host';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import Providers from './providers.svelte';

/**
 * THE JOIN SCREEN, RENDERED
 *
 * `join.test.ts` drives the steps; this asserts over what each step puts in the document. What
 * is worth pinning: the field is the only input while there is no link, the password is the only
 * input once there is an open one, and a refused invitation names the organization and says
 * which of the three it is, in both locales.
 *
 * And since effort 824: every step carries exactly one way back, in the card's corner rather
 * than in its body, whose arrow mirrors for a reader going right to left; the unlock and restore
 * buttons carry their verb's glyph; and each field carries its subject's glyph, muted, ahead of
 * the input.
 *
 * **The subject needs two providers above it**, which is why `./providers.svelte` is the wrapper:
 * the corner control draws a tooltip, and the surface's spinner reads the string contract.
 */

const noop = () => {};
const facts = (standing: LinkFacts['standing']): LinkFacts => ({
	organizationId: 'org-1',
	organizationName: 'Acme Rentals',
	remoteUrl: 'libsql://org-1.turso.io',
	standing
});

/** the sentence naming the organization, as a locale's dictionary spells it with the name in. */
const found = (dictionary: typeof en) =>
	dictionary.organization.join.found.replace('{name}', 'Acme Rentals');

const joinScreen = (
	step: JoinStep,
	errorMessage: string | null = null,
	overrides: { onBack?: () => void; direction?: 'ltr' | 'rtl' } = {}
) =>
	render(
		JoinScreen,
		{
			step,
			isJoining: false,
			errorMessage,
			onOpenLink: noop,
			onJoin: noop,
			onRestore: noop,
			onBack: overrides.onBack ?? noop,
			onSignInInstead: noop
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

/** one of every step, each with a link where the step holds one. */
const everyStep: JoinStep[] = [
	{ kind: 'paste' },
	{ kind: 'unreadable', link: 'nope' },
	{ kind: 'inspecting', link: 'rentable://join/abc' },
	{ kind: 'unreachable', link: 'rentable://join/abc', message: 'offline' },
	{ kind: 'refused', link: 'rentable://join/abc', facts: facts('lapsed') },
	{ kind: 'password', link: 'rentable://join/abc', facts: facts('open') },
	{ kind: 'restore', link: 'rentable://join/abc', facts: facts('none') }
];

test('with no link there is one field, for the link, typed left to right', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen({ kind: 'paste' });

	const inputs = inputsOnScreen();

	expect(inputs.map((input) => input.getAttribute('name'))).toEqual(['link']);
	expect(inputs[0]?.getAttribute('dir')).toBe('ltr');
	expect(screen.getByRole('button', { name: en.organization.join.open })).toBeDefined();
	expect(screen.queryByText(en.organization.join.unreadable)).toBeNull();
});

test('text that was not a link keeps the field and says so', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen({ kind: 'unreadable', link: 'nope' });

	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual(['link']);
	expect(screen.getByText(en.organization.join.unreadable)).toBeDefined();
});

test('an open invitation names the organization and asks for the password, and nothing else', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen({ kind: 'password', link: 'rentable://join/abc', facts: facts('open') });

	const inputs = inputsOnScreen();

	expect(inputs.map((input) => input.getAttribute('name'))).toEqual(['password']);
	expect(inputs[0]?.type).toBe('password');
	expect(screen.getByText(found(en))).toBeDefined();
	expect(screen.getByRole('button', { name: en.organization.join.join })).toBeDefined();
});

test('a refused join stays on the password step with its sentence', () => {
	loadLocale('en');
	setLocale('en');
	joinScreen(
		{ kind: 'password', link: 'rentable://join/abc', facts: facts('open') },
		'the sealed value did not open'
	);

	expect(screen.getByText('the sealed value did not open')).toBeDefined();
	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual(['password']);
});

// requirement 23 from the screen: the organization is named and the reason is said, with no
// field, because there is nothing a password would open.
test('a lapsed, used or revoked invitation names the organization and says which, with no field', () => {
	loadLocale('en');
	setLocale('en');

	const reasons = {
		lapsed: en.organization.join.refusedLapsed,
		consumed: en.organization.join.refusedConsumed,
		revoked: en.organization.join.refusedRevoked
	} as const;

	for (const [standing, reason] of Object.entries(reasons) as [keyof typeof reasons, string][]) {
		const rendered = joinScreen({
			kind: 'refused',
			link: 'rentable://join/abc',
			facts: facts(standing)
		});

		expect(inputsOnScreen(), standing).toEqual([]);
		expect(screen.getByText(found(en))).toBeDefined();
		expect(screen.getByText(reason)).toBeDefined();
		rendered.unmount();
	}
});

// requirement 6: the organization's own link asks for the email and the password, and the email
// is optional, because an owner typed none at the first run.
test("the organization's own link asks for the email and the password to restore a place", () => {
	loadLocale('en');
	setLocale('en');
	joinScreen({ kind: 'restore', link: 'rentable://join/abc', facts: facts('none') });

	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual([
		'email',
		'password'
	]);
	expect(screen.getByText(found(en))).toBeDefined();
	expect(screen.getByText(en.organization.join.restoreDescription)).toBeDefined();
	expect(screen.getByText(en.organization.join.emailOptional)).toBeDefined();
	expect(screen.getByRole('button', { name: en.organization.join.restore })).toBeDefined();
});

test('a used invitation offers the sign-in instead, and a lapsed one does not', () => {
	loadLocale('en');
	setLocale('en');

	const used = joinScreen({
		kind: 'refused',
		link: 'rentable://join/abc',
		facts: facts('consumed')
	});

	expect(screen.getByRole('button', { name: en.organization.join.signInInstead })).toBeDefined();
	used.unmount();

	joinScreen({ kind: 'refused', link: 'rentable://join/abc', facts: facts('lapsed') });

	expect(screen.queryByRole('button', { name: en.organization.join.signInInstead })).toBeNull();
});

// effort 824, requirement 1: one way back on every step, in the corner, and it is the only one.
test('every step carries exactly one back control in the corner, and pressing it calls onBack', () => {
	loadLocale('en');
	setLocale('en');

	for (const step of everyStep) {
		const onBack = vi.fn();
		const rendered = joinScreen(step, null, { onBack });
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

// effort 824, requirement 14: the primary carries its verb.
test('the unlock and restore buttons carry a glyph before their label', () => {
	loadLocale('en');
	setLocale('en');

	const password = joinScreen({
		kind: 'password',
		link: 'rentable://join/abc',
		facts: facts('open')
	});

	expect(
		screen.getByRole('button', { name: en.organization.join.join }).querySelector('svg')
	).not.toBeNull();
	password.unmount();

	joinScreen({ kind: 'restore', link: 'rentable://join/abc', facts: facts('none') });

	expect(
		screen.getByRole('button', { name: en.organization.join.restore }).querySelector('svg')
	).not.toBeNull();
});

// effort 824, requirement 15: each field carries its subject ahead of the input, muted so it does
// not outweigh the label (*Balance weight and contrast*, Refactoring UI p.56).
test('the link, email and password fields carry a muted leading glyph through the input group', () => {
	loadLocale('en');
	setLocale('en');

	const fields: [JoinStep, string[]][] = [
		[{ kind: 'paste' }, ['link']],
		[{ kind: 'password', link: 'rentable://join/abc', facts: facts('open') }, ['password']],
		[{ kind: 'restore', link: 'rentable://join/abc', facts: facts('none') }, ['email', 'password']]
	];

	for (const [step, names] of fields) {
		const rendered = joinScreen(step);

		for (const name of names) {
			const addon = addonBefore(name);

			expect(addon.querySelector('svg'), name).not.toBeNull();
			expect(addon.getAttribute('class'), name).toContain('text-muted-foreground');
		}

		rendered.unmount();
	}
});

test('the screen renders in arabic with the same one field and the same refusal by name', () => {
	loadLocale('ar');
	setLocale('ar');

	const password = joinScreen(
		{
			kind: 'password',
			link: 'rentable://join/abc',
			facts: facts('open')
		},
		null,
		{ direction: 'rtl' }
	);

	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual(['password']);
	expect(screen.getByText(found(ar))).toBeDefined();
	expect(screen.getAllByRole('button', { name: ar.organization.join.back })).toHaveLength(1);
	password.unmount();

	joinScreen({ kind: 'refused', link: 'rentable://join/abc', facts: facts('lapsed') }, null, {
		direction: 'rtl'
	});

	expect(screen.getByText(ar.organization.join.refusedLapsed)).toBeDefined();
	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getAllByRole('button', { name: ar.organization.join.back })).toHaveLength(1);
});
