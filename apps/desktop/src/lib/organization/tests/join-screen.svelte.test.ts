import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import JoinScreen from '$lib/organization/component/join-screen.svelte';
import type { JoinStep } from '$lib/organization/join';
import type { LinkFacts } from '$lib/platform/host';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';

/**
 * THE JOIN SCREEN, RENDERED
 *
 * `join.test.ts` drives the steps; this asserts over what each step puts in the document. What
 * is worth pinning: the field is the only input while there is no link, the password is the only
 * input once there is an open one, and a refused invitation names the organization and says
 * which of the three it is, in both locales.
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

const joinScreen = (step: JoinStep, errorMessage: string | null = null) =>
	render(JoinScreen, {
		step,
		isJoining: false,
		errorMessage,
		onOpenLink: noop,
		onJoin: noop,
		onPasteAnother: noop,
		onSignInInstead: noop
	});

const inputsOnScreen = () =>
	Array.from(document.querySelectorAll<HTMLInputElement>('input, textarea, select'));

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
		revoked: en.organization.join.refusedRevoked,
		none: en.organization.join.refusedNone
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

test('the screen renders in arabic with the same one field and the same refusal by name', () => {
	loadLocale('ar');
	setLocale('ar');

	const password = joinScreen({
		kind: 'password',
		link: 'rentable://join/abc',
		facts: facts('open')
	});

	expect(inputsOnScreen().map((input) => input.getAttribute('name'))).toEqual(['password']);
	expect(screen.getByText(found(ar))).toBeDefined();
	password.unmount();

	joinScreen({ kind: 'refused', link: 'rentable://join/abc', facts: facts('lapsed') });

	expect(screen.getByText(ar.organization.join.refusedLapsed)).toBeDefined();
	expect(inputsOnScreen()).toEqual([]);
});
