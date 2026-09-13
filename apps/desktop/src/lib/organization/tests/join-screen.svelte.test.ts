import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import JoinScreen from '$lib/organization/component/join-screen.svelte';
import type { JoinStep } from '$lib/organization/join';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import Providers from './providers.svelte';

/**
 * THE CONNECT SCREEN, RENDERED
 *
 * `join.test.ts` drives the steps; this asserts over what each step puts in the document. What
 * is worth pinning: the link field is the only input on any step, no step asks for a password,
 * a pasted link reaches `onConnect` as it was typed, and the two refusals say their sentence in
 * both locales.
 *
 * And since effort 824: every step carries exactly one way back, in the card's corner rather
 * than in its body, whose arrow mirrors for a reader going right to left; the connect button
 * carries its verb's glyph; and the link field carries its subject's glyph, muted, ahead of the
 * input.
 *
 * **The subject needs two providers above it**, which is why `./providers.svelte` is the wrapper:
 * the corner control draws a tooltip, and the surface's spinner reads the string contract.
 */

const noop = () => {};

const joinScreen = (
	step: JoinStep,
	overrides: {
		onConnect?: (link: string) => void;
		onBack?: () => void;
		direction?: 'ltr' | 'rtl';
	} = {}
) =>
	render(
		JoinScreen,
		{
			step,
			onConnect: overrides.onConnect ?? noop,
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

/** one of every step, each with a link where the step holds one. */
const everyStep: JoinStep[] = [
	{ kind: 'paste' },
	{ kind: 'unreadable', link: 'nope' },
	{ kind: 'inspecting', link: 'rentable://join/abc' },
	{ kind: 'unreachable', link: 'rentable://join/abc', message: 'offline' }
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
		target: { value: '  rentable://join/abc  ' }
	});

	expect(connect.hasAttribute('disabled')).toBe(false);
	await fireEvent.submit(form);
	expect(onConnect).toHaveBeenCalledWith('  rentable://join/abc  ');
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
	joinScreen({ kind: 'inspecting', link: 'rentable://join/abc' });

	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getByText(en.organization.join.reading)).toBeDefined();
});

test('an organization that could not be reached says so, shows what the shell said, and offers the same link again', async () => {
	loadLocale('en');
	setLocale('en');

	const onConnect = vi.fn();

	joinScreen(
		{ kind: 'unreachable', link: 'rentable://join/abc', message: 'Acme could not be reached' },
		{ onConnect }
	);

	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getByText(en.organization.join.unreachable)).toBeDefined();
	expect(screen.getByText('Acme could not be reached')).toBeDefined();

	await fireEvent.click(screen.getByRole('button', { name: en.organization.join.tryAgain }));

	expect(onConnect).toHaveBeenCalledWith('rentable://join/abc');
});

// effort 824, requirement 18: a link carries no invitation half and a person is admitted at the
// wall, so no step here asks for a password.
test('no step renders a password field, or any field but the link', () => {
	loadLocale('en');
	setLocale('en');

	for (const step of everyStep) {
		const rendered = joinScreen(step);

		expect(document.querySelector('input[type="password"]'), step.kind).toBeNull();
		expect(
			inputsOnScreen().map((input) => input.getAttribute('name')),
			step.kind
		).toEqual(step.kind === 'paste' || step.kind === 'unreadable' ? ['link'] : []);
		rendered.unmount();
	}
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

test('the screen renders in arabic with the same one field and the same refusals', () => {
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

	joinScreen(
		{ kind: 'unreachable', link: 'rentable://join/abc', message: 'offline' },
		{ direction: 'rtl' }
	);

	expect(screen.getByText(ar.organization.join.unreachable)).toBeDefined();
	expect(inputsOnScreen()).toEqual([]);
	expect(screen.getAllByRole('button', { name: ar.organization.join.back })).toHaveLength(1);
});
