import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { harness, nowhereToGo } from '$lib/startup/tests/harness';
import Providers from '#tests/providers.svelte';
import {
	fakeHeldOrganization,
	fakeOrganizationSession,
	fakeOrganizationState,
	fakeOrganizationWorkspace
} from '$lib/organization/tests/testing';
import type { OrganizationHost } from '$lib/organization/host';
import type { Startup } from '$lib/startup';
import { resetUpdater } from '$lib/update/updater.svelte';
import { fakeUpdateHost } from '$lib/update/tests/testing';
import Join from '../component/join.svelte';
import { linkArrived } from '../connect';

/**
 * JOINING, FROM THE PRESS OF JOIN TO THE LOADING PASS
 *
 * Effort 832, requirement 19: joining is the link and its code, then the password, then the
 * application, with one loading pass after the password. `connect-screen.svelte.test.ts` holds the
 * steps as the screen draws them; this holds what the join screen does once the accept answers, because
 * the hand-over is the join screen's: **after the accept, no busy surface of the screen's own comes
 * before the loading pass**, and the pass goes on into the workspace the accept admitted the
 * person to.
 *
 * Modelled on `first-run.svelte.test.ts`. The screen is rendered whole, as its route draws it;
 * what reaches Rust is stood in for at the host, the address and the navigation are mocked because
 * this runner has no router, and the startup unit is a real one, driven through the harness
 * `startup/tests/launch.test.ts` drives it with, so what the loading surface would show is what
 * the unit actually reported.
 */

const hooks = vi.hoisted(() => ({
	startup: null as Startup | null,
	events: [] as string[],
	linkRead: vi.fn(),
	accept: vi.fn(),
	machineConnect: vi.fn(),
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

/** the organization's commands the screen calls, handed over as its route hands the bound ones. */
const host = {
	linkRead: hooks.linkRead,
	machineConnect: hooks.machineConnect,
	invitation: { accept: hooks.accept }
} as unknown as OrganizationHost;

beforeEach(() => {
	// the update action is drawn and never pressed here; its host refuses by name if it were.
	resetUpdater({ host: fakeUpdateHost(), push: async () => {} });
});

afterEach(() => {
	hooks.events.length = 0;
	hooks.linkRead.mockReset();
	hooks.accept.mockReset();
	hooks.machineConnect.mockReset();
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

/** the form, filled with the link and its code and submitted, as a person walks it. */
async function submitTheForm(direction: 'ltr' | 'rtl' = 'ltr') {
	render(
		Join,
		{ startup: hooks.startup!, host, wayIn: '/' },
		{ wrapper: Providers, wrapperProps: { strings, direction } }
	);

	await fireEvent.input(document.querySelector('input[name="link"]')!, {
		target: { value: LINK }
	});
	await fireEvent.input(document.querySelector('input[name="code"]')!, {
		target: { value: CODE }
	});
	await fireEvent.submit(document.querySelector('form')!);
}

/** from the form to a submitted password step, as a person walks it. */
async function walkToJoin(direction: 'ltr' | 'rtl' = 'ltr') {
	await submitTheForm(direction);

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

// effort 851, the review of requirement 13: a link for an organization this machine holds selects
// it in the shell where nobody is in, and is then refused as already used. The refusal stays on
// the screen, and the startup unit reads the standing under it, so the wall the person goes back
// to names the link's organization rather than the one chosen before.
test('an accept refused for a held organization leaves the wall naming that organization', async () => {
	loadLocale('en');
	setLocale('en');

	const acme = fakeHeldOrganization({ id: 'acme', name: 'Acme Rentals' });
	const beta = fakeHeldOrganization({ id: 'beta', name: 'Beta Lettings' });
	const twoHeld = (selected: string) =>
		fakeOrganizationState({ organizations: [acme, beta], selected, session: null });
	const driven = harness({ organization: twoHeld('acme') });

	await driven.startup.start();
	hooks.startup = driven.startup;

	hooks.linkRead.mockResolvedValue({
		organizationId: 'beta',
		organizationName: 'Beta Lettings',
		kind: 'invitation',
		expiresAt: 1
	});
	hooks.accept.mockImplementation(async () => {
		driven.standWith(twoHeld('beta'));

		throw { code: 'refused', reason: 'consumed', message: 'the invitation was already opened' };
	});

	await walkToJoin();

	await waitFor(() => expect(driven.startup.snapshot.organization?.selected).toBe('beta'));

	expect(document.querySelector('[data-join-step]')?.getAttribute('data-join-step')).toBe(
		'refused'
	);
	expect(driven.startup.snapshot.state).toBe('sign-in');
	expect(hooks.goto).not.toHaveBeenCalled();
});

// effort 857, ticket 11: an accept refused because the organization it names cannot be opened by
// this version, where the machine holds that organization, goes back to the organization switcher
// on that organization's wall, with the reason recorded against it, rather than staying on a join
// screen that cannot act on it.
test('an accept refused because a newer rentable upgraded a held organization returns to its switcher', async () => {
	loadLocale('en');
	setLocale('en');

	const acme = fakeHeldOrganization({ id: 'acme', name: 'Acme Rentals' });
	const beta = fakeHeldOrganization({ id: 'beta', name: 'Beta Lettings' });
	const driven = harness({
		organization: fakeOrganizationState({
			organizations: [acme, beta],
			selected: 'acme',
			session: null
		})
	});

	await driven.startup.start();
	hooks.startup = driven.startup;

	hooks.linkRead.mockResolvedValue({
		organizationId: 'beta',
		organizationName: 'Beta Lettings',
		kind: 'invitation',
		expiresAt: 1
	});
	hooks.accept.mockRejectedValue({
		code: 'refused',
		reason: 'organizationNewer',
		message: 'the organization is at format 5'
	});

	await walkToJoin();

	await waitFor(() => expect(hooks.goto).toHaveBeenCalledWith('/'));
	await waitFor(() => expect(driven.startup.snapshot.organization?.selected).toBe('beta'));

	expect(driven.startup.snapshot.state).toBe('sign-in');
	expect(driven.startup.snapshot.refusals.beta).toEqual({
		sentence: 'refused: organizationNewer',
		detail: null,
		byVersion: true
	});
	expect(document.querySelector('[data-join-step]')?.getAttribute('data-join-step')).not.toBe(
		'refused'
	);
});

// effort 843, ticket 07: a `rentable://` link the operating system hands the running application
// while the join is open lands on the form, step 1 of 2, with the link filled and the code to type.
test('a link that arrives while the join is open lands on the form with the link filled', async () => {
	loadLocale('en');
	setLocale('en');
	await atTheWall();

	render(
		Join,
		{ startup: hooks.startup!, host, wayIn: '/' },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

	expect(document.querySelector<HTMLInputElement>('input[name="link"]')?.value).toBe('');

	linkArrived('rentable://join/handed-over');

	await waitFor(() =>
		expect(document.querySelector<HTMLInputElement>('input[name="link"]')?.value).toBe(
			'rentable://join/handed-over'
		)
	);
	expect(document.querySelector('[data-join-step]')?.getAttribute('data-join-step')).toBe('paste');
	expect(document.querySelector('[data-way-in-position]')?.textContent?.trim()).toBe('step 1 of 2');
	expect(document.querySelector<HTMLInputElement>('input[name="code"]')?.value).toBe('');
});

// effort 857, ticket 17 (requirements 7 and 8): a link for an organization this machine does not
// hold yet has no place at the switcher, so a refusal of it for its version stays on the join
// screen. The screen says the reason and carries the update action beside it, in the callout that
// says it, since updating is the one way past it; any other refusal is the reason alone.
const VERSION_REFUSALS = [
	['machine', 'organizationNewer'],
	['machine', 'workspaceNewer'],
	['invitation', 'organizationNewer'],
	['invitation', 'workspaceNewer'],
	['invitation', 'organizationReadOnlyByVersion']
] as const;

const LOCALES = [
	['en', en, 'ltr'],
	['ar', ar, 'rtl']
] as const;

/** a link of `kind` for an organization the machine does not hold, refused with `reason`. */
async function refusedFor(
	kind: 'machine' | 'invitation',
	reason: string,
	direction: 'ltr' | 'rtl'
) {
	hooks.linkRead.mockResolvedValue({
		organizationId: 'beta',
		organizationName: 'Beta Lettings',
		kind,
		expiresAt: 1
	});

	const refusal = { code: 'refused', reason, message: 'the organization is at format 5' };

	hooks.machineConnect.mockRejectedValue(refusal);
	hooks.accept.mockRejectedValue(refusal);

	if (kind === 'machine') {
		await submitTheForm(direction);
	} else {
		await walkToJoin(direction);
	}
}

/** the callout the reason is said in, once it has landed. */
const theCallout = async (sentence: string) => {
	await waitFor(() => {
		expect(
			[...document.querySelectorAll('[data-slot=callout]')].some((callout) =>
				callout.textContent?.includes(sentence)
			)
		).toBe(true);
	});

	const callouts = document.querySelectorAll('[data-slot=callout]');

	expect(callouts).toHaveLength(1);

	return callouts[0]!;
};

for (const [locale, strings_, direction] of LOCALES) {
	for (const [kind, reason] of VERSION_REFUSALS) {
		test(`${locale}: a ${kind} link refused as ${reason} for an organization not held offers the update beside the reason`, async () => {
			loadLocale(locale);
			setLocale(locale);
			await atTheWall();

			await refusedFor(kind, reason, direction);

			const sentence = strings_.common.refusals.host[reason];
			const callout = await theCallout(sentence);

			// the reason and the update action, together in the one callout.
			expect(callout.querySelector('[data-update-action="notice"]')).not.toBeNull();
			expect(callout.querySelector('[data-update-act]')).not.toBeNull();

			// it stays on the join screen: nothing moved the address, and the machine is still at the
			// wall it came from, so the corner's way back leads there.
			expect(hooks.goto).not.toHaveBeenCalled();
			expect(hooks.startup!.snapshot.state).toBe('sign-in');
			expect(screen.getByRole('button', { name: strings_.organization.join.back })).toBeDefined();
		});
	}

	test(`${locale}: a link refused for any other reason says the reason alone, with no update action`, async () => {
		loadLocale(locale);
		setLocale(locale);
		await atTheWall();

		await refusedFor('machine', 'organizationCredentialLapsed', direction);

		await theCallout(strings_.common.refusals.host.organizationCredentialLapsed);

		expect(document.querySelector('[data-update-action]')).toBeNull();
	});
}
