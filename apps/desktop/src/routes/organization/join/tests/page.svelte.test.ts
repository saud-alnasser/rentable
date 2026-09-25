import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, expect, test, vi } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import en from '$lib/i18n/en';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { harness, nowhereToGo } from '$lib/layout/tests/testing';
import Providers from '$lib/organization/tests/providers.svelte';
import {
	fakeOrganizationSession,
	fakeOrganizationState,
	fakeOrganizationWorkspace
} from '$lib/platform/tests/testing';
import Page from '../+page.svelte';

/**
 * JOINING, FROM THE PRESS OF JOIN TO THE LOADING PASS
 *
 * Effort 832, requirement 19: joining is the link and its code, then the password, then the
 * application, with one loading pass after the password. `connect-screen.svelte.test.ts` holds the
 * steps as the screen draws them; this holds what the route does once the accept answers, because
 * the hand-over is the route's: **after the accept, no busy surface of the screen's own comes
 * before the loading pass**, and the pass goes on into the workspace the accept admitted the
 * person to.
 *
 * Modelled on `routes/organization/new/tests/page.svelte.test.ts`. The route is rendered whole;
 * what reaches Rust is stood in for at `tauri`, the address and the navigation are mocked because
 * this runner has no router, and the startup unit is a real one, driven through the harness
 * `layout/tests/startup.test.ts` drives it with, so what the loading surface would show is what
 * the unit actually reported.
 */

const hooks = vi.hoisted(() => ({
	startup: null as unknown,
	events: [] as string[],
	linkRead: vi.fn(),
	accept: vi.fn(),
	goto: vi.fn()
}));

vi.mock('$app/navigation', async (original) => ({
	...(await original<Record<string, unknown>>()),
	goto: hooks.goto
}));

vi.mock('$app/paths', async (original) => ({
	...(await original<Record<string, unknown>>()),
	resolve: (path: string) => path
}));

vi.mock('$lib/layout/startup-context', () => ({
	useStartup: () => hooks.startup
}));

vi.mock('$lib/platform/tauri', () => ({
	tauri: {
		organization: {
			linkRead: hooks.linkRead,
			machineConnect: vi.fn(),
			invitation: { accept: hooks.accept }
		}
	}
}));

afterEach(() => {
	hooks.events.length = 0;
	hooks.linkRead.mockReset();
	hooks.accept.mockReset();
	hooks.goto.mockReset();
});

const LINK = 'rentable://join/abc';
const CODE = '7K4M9Q';

/** where the machine stands once the accept has recorded the organization and signed them in. */
const joined = () =>
	fakeOrganizationState({
		session: fakeOrganizationSession({
			workspaces: [fakeOrganizationWorkspace({ id: 'acme', name: 'Acme Rentals' })]
		})
	});

/** a startup at the wall with nothing on the machine, which is where a join starts. */
async function atTheWall() {
	const driven = harness({ organization: nowhereToGo(), afterBootstrap: joined() });

	await driven.startup.start();
	hooks.startup = driven.startup;

	driven.startup.observe((snapshot) => hooks.events.push(`state:${snapshot.state}`));

	return driven;
}

/**
 * Every surface the screen draws after the press, as the document shows it: its step, and whether
 * it is busy. A busy surface of its own would show here as a step other than the password one, or
 * as the reading step's wait.
 */
function watchTheScreen() {
	const watching = new MutationObserver(() => {
		const step = document.querySelector('[data-join-step]')?.getAttribute('data-join-step');

		hooks.events.push(`join:${step ?? 'gone'}`);
	});

	watching.observe(document.body, { childList: true, subtree: true, characterData: true });

	return watching;
}

/** from the form to a submitted password step, as a person walks it. */
async function walkToJoin() {
	render(Page, {}, { wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } });

	await fireEvent.input(document.querySelector('input[name="link"]')!, {
		target: { value: LINK }
	});
	await fireEvent.input(document.querySelector('input[name="code"]')!, {
		target: { value: CODE }
	});
	await fireEvent.submit(document.querySelector('form')!);

	await waitFor(() => {
		expect(document.querySelector('[data-join-step]')?.getAttribute('data-join-step')).toBe(
			'password'
		);
	});

	for (const name of ['password', 'confirmation']) {
		await fireEvent.input(document.querySelector(`input[name="${name}"]`)!, {
			target: { value: 'a long enough password' }
		});
	}

	await fireEvent.submit(document.querySelector('form')!);
}

test('after the accept, the loading pass is the next thing drawn, and it goes on into the workspace', async () => {
	loadLocale('en');
	setLocale('en');

	const { startup, journal } = await atTheWall();

	hooks.linkRead.mockResolvedValue({
		organizationId: 'acme',
		organizationName: 'Acme Rentals',
		kind: 'invitation',
		expiresAt: 1
	});
	hooks.accept.mockImplementation(async () => {
		hooks.events.push('accepted');

		return joined();
	});
	// the address takes a moment to move, as a real navigation does, so a pass that did not wait
	// for it would reach ready while the address was still this screen's, and draw it again.
	hooks.goto.mockImplementation(
		() =>
			new Promise<void>((arrive) =>
				setTimeout(() => {
					hooks.events.push('arrived');
					arrive();
				}, 20)
			)
	);

	await walkToJoin();

	const watching = watchTheScreen();

	await waitFor(() => expect(startup.snapshot.state).toBe('ready'));
	watching.disconnect();

	// what was typed is what was accepted, and nothing else was asked for.
	expect(hooks.accept).toHaveBeenCalledWith(LINK, CODE, 'a long enough password');

	// **the next surface after the accept is the loading surface.** Between the two the screen is
	// still the password step on its working line, the one busy surface it had while the accept
	// ran, and nothing of its own is drawn after it.
	const accepted = hooks.events.indexOf('accepted');
	const loading = hooks.events.indexOf('state:loading');

	expect(accepted).toBeGreaterThanOrEqual(0);
	expect(loading).toBeGreaterThan(accepted);
	expect(new Set(hooks.events.slice(accepted + 1, loading))).toEqual(
		new Set(loading > accepted + 1 ? ['join:password'] : [])
	);

	// no other step at any point after the press: the screen never went back to reading, to the
	// form, or to a step of its own.
	expect(
		hooks.events.filter((event) => event.startsWith('join:') && event !== 'join:password')
	).toEqual([]);

	// one loading pass, from the accept to ready, and into the workspace it admitted them to.
	expect([...new Set(hooks.events.filter((event) => event.startsWith('state:')))]).toEqual([
		'state:loading',
		'state:ready'
	]);
	expect(journal.stages.slice(-3)).toEqual(['workspace', 'changes', 'records']);
	expect(journal.workspacesOpened).toEqual(['acme']);

	// and the address moved to the way in under the loading surface, and had arrived before the
	// pass ended: the screen is never drawn again over a finished pass.
	expect(hooks.goto).toHaveBeenCalledWith('/');
	expect(hooks.events.indexOf('arrived')).toBeGreaterThan(loading);
	expect(hooks.events.indexOf('arrived')).toBeLessThan(hooks.events.indexOf('state:ready'));
});

test('an accept refused as lapsed stays on the screen, in one line, with no loading pass', async () => {
	loadLocale('en');
	setLocale('en');

	const { startup } = await atTheWall();

	hooks.linkRead.mockResolvedValue({
		organizationId: 'acme',
		organizationName: 'Acme Rentals',
		kind: 'invitation',
		expiresAt: 1
	});
	hooks.accept.mockRejectedValue({
		code: 'refused',
		reason: 'lapsed',
		message: 'the invitation lapsed at 2026-09-20T10:00:00Z'
	});

	await walkToJoin();

	await waitFor(() => {
		expect(document.querySelector('[data-join-step]')?.getAttribute('data-join-step')).toBe(
			'refused'
		);
	});

	expect(startup.snapshot.state).toBe('sign-in');
	expect(hooks.goto).not.toHaveBeenCalled();

	// the one line, and the shell's words kept closed behind the disclosure.
	expect(screen.getByText(en.organization.join.lapsed)).toBeDefined();
	expect(document.body.textContent).not.toContain('2026-09-20T10:00:00Z');
	expect(document.body.textContent?.split(en.organization.join.lapsed).length).toBe(2);
	expect(document.querySelectorAll('[data-slot=callout]')).toHaveLength(1);
	expect(document.querySelector('[data-error-detail="join"]')).not.toBeNull();
});
