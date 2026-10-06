import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, expect, test, vi } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { i18nObject } from '$lib/i18n/i18n-util';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import en from '$lib/i18n/en';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { harness, nowhereToGo } from '$lib/startup/tests/harness';
import Providers from '#tests/providers.svelte';
import {
	fakeOrganizationSession,
	fakeOrganizationState,
	fakeOrganizationWorkspace
} from '$lib/organization/tests/testing';
import type { Startup } from '$lib/startup';
import type { Writable } from 'svelte/store';
import FirstRun from '../component/first-run.svelte';

/**
 * THE FIRST RUN, FROM THE PRESS OF CREATE TO THE LOADING PASS
 *
 * Effort 832, requirement 18: creating an organization is the consent, then the name, then the
 * application, with one loading pass after the walk. `walk.svelte.test.ts` holds the walk's
 * two steps as the screen draws them; this holds what the first run does once the name step's create
 * answers, because the hand-over is the first run's: **after the create, no second busy surface comes
 * before the loading pass**, the first workspace is made as that pass's first stage, named after
 * the organization, and the pass goes on into it.
 *
 * The first run is rendered whole, as its route draws it. What reaches Rust is stood in for at the query hooks, the address
 * and the navigation are mocked because this runner has no router, and the startup unit is a real
 * one, driven through the same harness `startup/tests/launch.test.ts` drives it with, so what the
 * loading surface would show is what the unit actually reported.
 */

const hooks = vi.hoisted(() => ({
	startup: null as Startup | null,
	events: [] as string[],
	createOrganization: vi.fn(),
	createWorkspace: vi.fn(),
	goto: vi.fn(),
	holdsTursoAuthority: true,
	selectedHolds: false,
	groupKind: 'empty' as 'empty' | 'held',
	connectExisting: vi.fn(),
	consentSession: null as (() => string | null) | null,
	page: null as Writable<Record<string, unknown>> | null
}));

// **The form's own answer to a submit is applied as SvelteKit applies it**: what `applyAction` does
// with a result that is not an error is set the page's `form` and `status`, and superforms reads
// the page and resets a valid form on a success. A no-op here skipped that, and with it the reset
// that cleared what the owner typed when Turso asked for the group (effort 851, requirement 30).
// The page is a store of this file's own, since this runner has no application root to hold one.
vi.mock('$app/stores', async (original) => {
	const { writable } = await import('svelte/store');

	hooks.page = writable<Record<string, unknown>>({});

	return { ...(await original<Record<string, unknown>>()), page: hooks.page };
});

vi.mock('$app/forms', async (original) => ({
	...(await original<Record<string, unknown>>()),
	applyAction: async (result: { type: string; status?: number; data?: unknown }) => {
		if (result.type === 'error' || result.type === 'redirect') return;

		hooks.page?.update((page) => ({ ...page, form: result.data, status: result.status }));
	}
}));

vi.mock('$app/navigation', async (original) => ({
	...(await original<Record<string, unknown>>()),
	goto: hooks.goto
}));

vi.mock('$app/paths', async (original) => ({
	...(await original<Record<string, unknown>>()),
	resolve: (path: string) => path
}));

vi.mock('$lib/organization/query', async (original) => ({
	...(await original<Record<string, unknown>>()),
	// a machine holding the Turso authority, with nobody in: the consent step opens granted.
	useFetchOrganizationState: () => ({
		data: {
			organization: null,
			session: null,
			holdsTursoAuthority: hooks.selectedHolds,
			setupConsented: hooks.holdsTursoAuthority,
			signedOutElsewhere: false
		},
		refetch: async () => ({ data: { holdsTursoAuthority: false, setupConsented: true } })
	})
}));

vi.mock('$lib/organization/setup/query', async (original) => {
	const idle = { isPending: false, mutateAsync: async () => ({}) };

	return {
		...(await original<Record<string, unknown>>()),
		useBeginConsent: () => ({
			isPending: false,
			mutateAsync: async () => ({
				sessionId: 'consent-1',
				authorizationUrl: 'https://turso.example/consent'
			})
		}),
		// the poll, recorded by the session it asks after: `null` is a poll that has stopped.
		useConsentResult: (sessionId: () => string | null) => {
			hooks.consentSession = sessionId;

			return { data: undefined };
		},
		useDisconnect: () => idle,
		useConnectExisting: () => ({ isPending: false, mutateAsync: hooks.connectExisting }),
		useInspectGroup: () => ({
			isPending: false,
			mutateAsync: async () => ({ kind: hooks.groupKind })
		}),
		useCreateOrganization: () => ({ isPending: false, mutateAsync: hooks.createOrganization })
	};
});

vi.mock('$lib/organization/workspace/query', async (original) => ({
	...(await original<Record<string, unknown>>()),
	useCreateWorkspace: () => ({ isPending: false, mutateAsync: hooks.createWorkspace })
}));

afterEach(() => {
	hooks.events.length = 0;
	hooks.createOrganization.mockReset();
	hooks.createWorkspace.mockReset();
	hooks.goto.mockReset();
	hooks.holdsTursoAuthority = true;
	hooks.selectedHolds = false;
	hooks.groupKind = 'empty';
	hooks.connectExisting.mockReset();
	hooks.consentSession = null;
});

/** a startup at the wall with nothing on the machine, which is where the first run starts. */
async function atTheWall(afterBootstrap = founded()) {
	const driven = harness({ organization: nowhereToGo(), afterBootstrap });

	await driven.startup.start();
	hooks.startup = driven.startup;

	driven.startup.observe((snapshot) => hooks.events.push(`state:${snapshot.state}`));

	return driven;
}

/** where the machine stands once the organization and its first workspace exist. */
const founded = () =>
	fakeOrganizationState({
		session: fakeOrganizationSession({
			workspaces: [fakeOrganizationWorkspace({ id: 'acme', name: 'Acme Rentals' })]
		}),
		holdsTursoAuthority: true
	});

/** from the consent to a submitted name step, as a person walks it. */
async function walkToCreate() {
	render(
		FirstRun,
		{ startup: hooks.startup!, wayIn: '/' },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

	// the consent is already granted, so the way on is one press.
	expect(document.querySelector('[data-way-in-position]')?.textContent?.trim()).toBe(
		i18nObject('en').organization.setup.position({ step: 1, total: 2 })
	);
	await fireEvent.click(screen.getByRole('button', { name: en.organization.setup.continue }));
	await waitFor(() => {
		expect(document.querySelector('[data-setup-step]')?.getAttribute('data-setup-step')).toBe(
			'name'
		);
	});
	expect(document.querySelector('[data-way-in-position]')?.textContent?.trim()).toBe(
		i18nObject('en').organization.setup.position({ step: 2, total: 2 })
	);

	for (const [name, value] of [
		['name', 'Acme Rentals'],
		['username', 'olivia.owner'],
		['password', 'a long enough password'],
		['confirmation', 'a long enough password']
	]) {
		await fireEvent.input(document.querySelector(`input[name="${name}"]`)!, {
			target: { value }
		});
	}

	await fireEvent.submit(document.querySelector('form')!);
}

/**
 * Every surface the walk draws after the press, as the document shows it: its step, and what its
 * working line says. A second busy surface would show here as a step other than `name`, or as the
 * no-workspace surface's working line.
 */
function watchTheWalk() {
	const watching = new MutationObserver(() => {
		const step = document.querySelector('[data-setup-step]')?.getAttribute('data-setup-step');

		hooks.events.push(`walk:${step ?? 'gone'}`);

		if (document.body.textContent?.includes(en.layout.noWorkspace.creating)) {
			hooks.events.push('walk:creating-a-workspace');
		}
	});

	watching.observe(document.body, { childList: true, subtree: true, characterData: true });

	return watching;
}

test('after the create, the loading pass is the next thing drawn, and it makes the first workspace', async () => {
	loadLocale('en');
	setLocale('en');

	const { startup, journal } = await atTheWall();

	hooks.createOrganization.mockImplementation(async () => {
		hooks.events.push('created');
	});
	hooks.createWorkspace.mockImplementation(async (variables: { name: string }) => {
		// the prepare runs under the loading surface, as its first stage.
		hooks.events.push(`prepare:${startup.snapshot.state}:${journal.stages.at(-1)}`);

		return variables;
	});

	await walkToCreate();

	const watching = watchTheWalk();

	await waitFor(() => expect(startup.snapshot.state).toBe('ready'));
	watching.disconnect();

	// what was typed is what was created, and the owner was not asked for anything else.
	expect(hooks.createOrganization).toHaveBeenCalledWith({
		name: 'Acme Rentals',
		username: 'olivia.owner',
		password: 'a long enough password',
		group: null
	});

	// the first workspace, named after the organization, through the create-workspace path.
	expect(hooks.createWorkspace).toHaveBeenCalledTimes(1);
	expect(hooks.createWorkspace).toHaveBeenCalledWith({ name: 'Acme Rentals' });

	// **the next surface after the create is the loading surface.** Between the two the walk is
	// still the name step on its working line, the one busy surface it had while the organization
	// was created, and the workspace is made under the loading surface as the pass's first stage.
	const created = hooks.events.indexOf('created');
	const loading = hooks.events.indexOf('state:loading');

	expect(created).toBeGreaterThanOrEqual(0);
	expect(loading).toBeGreaterThan(created);
	expect(new Set(hooks.events.slice(created + 1, loading))).toEqual(
		new Set(loading > created + 1 ? ['walk:name'] : [])
	);
	expect(hooks.events.indexOf('prepare:loading:prepare')).toBeGreaterThan(loading);

	// no second busy surface at any point: the walk never drew another step or the no-workspace
	// surface's working line.
	expect(
		hooks.events.filter((event) => event.startsWith('walk:') && event !== 'walk:name')
	).toEqual([]);

	// one loading pass, from the prepare to ready, and into the workspace it made.
	expect(journal.stages.slice(-4)).toEqual(['prepare', 'workspace', 'changes', 'records']);
	expect([...new Set(hooks.events.filter((event) => event.startsWith('state:')))]).toEqual([
		'state:loading',
		'state:ready'
	]);
	expect(journal.workspacesOpened).toEqual(['acme']);

	// and the address moved to the way in, before the standing was read.
	expect(hooks.goto).toHaveBeenCalledWith('/');
});

test('a first workspace that could not be made lands on the no-workspace surface, with the owner in', async () => {
	loadLocale('en');
	setLocale('en');

	const { startup } = await atTheWall(
		fakeOrganizationState({
			session: fakeOrganizationSession({ workspaces: [] }),
			holdsTursoAuthority: true
		})
	);

	hooks.createOrganization.mockImplementation(async () => {});
	hooks.createWorkspace.mockImplementation(async () => {
		throw new Error('turso could not be reached');
	});

	await walkToCreate();

	await waitFor(() => expect(startup.snapshot.state).toBe('no-workspace'));

	expect(hooks.createWorkspace).toHaveBeenCalledWith({ name: 'Acme Rentals' });
	expect(startup.snapshot.error).toBeNull();
	expect(startup.snapshot.railIsUp).toBe(true);
});

// effort 824, requirement 2, held through effort 843's transitions: back from a consent still open
// in the browser lets the poll go at once, before the address moves, so a navigation held inside
// a view transition does not keep it asking.
// effort 851, requirement 39, as the human found it on 2026-10-06: adding an organization on a
// machine whose selected one holds its own consent starts the walk from the setup's own consent,
// which is none, so the step asks for a connection rather than saying one is there.
test('adding an organization beside one that holds its own consent starts from no consent', async () => {
	hooks.holdsTursoAuthority = false;
	hooks.selectedHolds = true;
	await atTheWall();

	render(
		FirstRun,
		{ startup: hooks.startup!, wayIn: '/' },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

	expect(screen.getByRole('button', { name: en.organization.setup.connect })).toBeTruthy();
	expect(document.body.textContent).not.toContain(en.organization.setup.connected);
	expect(screen.queryByRole('button', { name: en.organization.setup.continue })).toBeNull();
});

test('back while a consent is pending stops the poll at once, even with the navigation still running', async () => {
	hooks.holdsTursoAuthority = false;
	// a navigation that never completes, as one held open by a transition is while it runs.
	hooks.goto.mockImplementation(() => new Promise(() => {}));
	await atTheWall();

	render(
		FirstRun,
		{ startup: hooks.startup!, wayIn: '/' },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

	await fireEvent.click(screen.getByRole('button', { name: en.organization.setup.connect }));
	await waitFor(() => expect(hooks.consentSession?.()).toBe('consent-1'));

	await fireEvent.click(screen.getByRole('button', { name: en.organization.setup.back }));

	expect(hooks.consentSession?.()).toBeNull();
	expect(hooks.goto).toHaveBeenCalledWith('/');
});

// review round two: the connect to an existing organization refetches where the machine stands
// before it answers, and the session it brings would send the walk's resume to the way in on the
// walk's own surface. So the walk holds the address as a create does, from the press until the
// loading surface is up, and lets go on a refusal.
test('connecting to an existing organization holds the walk until the loading, and lets go on a refusal', async () => {
	hooks.groupKind = 'held';

	let refuse: (reason: unknown) => void = () => {};

	hooks.connectExisting.mockImplementation(() => new Promise((_, reject) => (refuse = reject)));
	await atTheWall();

	render(
		FirstRun,
		{ startup: hooks.startup!, wayIn: '/' },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

	await fireEvent.click(screen.getByRole('button', { name: en.organization.setup.continue }));
	await waitFor(() =>
		expect(document.querySelector('[data-setup-step]')?.getAttribute('data-setup-step')).toBe(
			'existing'
		)
	);

	for (const [name, value] of [
		['username', 'olivia.owner'],
		['password', 'her own password']
	]) {
		await fireEvent.input(document.querySelector(`input[name="${name}"]`)!, {
			target: { value }
		});
	}

	await fireEvent.submit(document.querySelector('form')!);
	await waitFor(() => expect(hooks.connectExisting).toHaveBeenCalledTimes(1));

	// held: the step is working, as it is through a create, and nothing has moved the address.
	expect(screen.getByRole('button', { name: en.common.actions.working })).toBeDefined();
	expect(hooks.goto).not.toHaveBeenCalled();

	refuse(new Error('the pair opened nothing'));

	await waitFor(() =>
		expect(
			screen.getByRole('button', { name: en.organization.setup.existingConnect })
		).toBeDefined()
	);
	expect(hooks.goto).not.toHaveBeenCalled();
});

/**
 * Effort 851, requirement 30: **asking for the group costs the owner nothing they typed.** Driven
 * through the real create and its refusal rather than a rerender of the walk with new props,
 * because the rerender skips what the form does once its submit handler returns, and that is
 * where the fields were being cleared.
 */
test('a create refused for want of the group keeps what was typed, asks for the group, and sends all of it again', async () => {
	loadLocale('en');
	setLocale('en');

	await atTheWall();

	hooks.createOrganization.mockImplementationOnce(async () => {
		throw {
			code: 'refused',
			reason: 'groupNeeded',
			message: 'turso refused every group this application could name on its own'
		};
	});

	await walkToCreate();

	await waitFor(() => expect(document.querySelector('input[name="group"]')).not.toBeNull());

	const values = () =>
		[...document.querySelectorAll<HTMLInputElement>('form input')].map((input) => [
			input.getAttribute('name'),
			input.value
		]);

	// the four fields as typed, and the group beside them, empty and with the cursor in it.
	await waitFor(() => {
		expect(values()).toEqual([
			['name', 'Acme Rentals'],
			['username', 'olivia.owner'],
			['password', 'a long enough password'],
			['confirmation', 'a long enough password'],
			['group', '']
		]);
		expect(document.activeElement).toBe(document.querySelector('input[name="group"]'));
	});
	expect(screen.getByText(en.organization.setup.groupNeeded)).toBeDefined();

	// the group typed, and the create sent again with nothing retyped.
	hooks.createOrganization.mockImplementationOnce(async () => {});
	await fireEvent.input(document.querySelector('input[name="group"]')!, {
		target: { value: 'rentals' }
	});
	await fireEvent.submit(document.querySelector('form')!);

	await waitFor(() => expect(hooks.createOrganization).toHaveBeenCalledTimes(2));
	expect(hooks.createOrganization).toHaveBeenLastCalledWith({
		name: 'Acme Rentals',
		username: 'olivia.owner',
		password: 'a long enough password',
		group: 'rentals'
	});
});

/**
 * Effort 843, requirement 8, beside effort 851's requirement 30: **arriving at the name step puts
 * the cursor in its first field, even with the group already asked for.** The group field takes
 * the cursor when it appears on the step the owner is on, and not again when they go back to the
 * consent and on to the step.
 */
test('going back and on again after the group was asked for puts the cursor in the first field', async () => {
	loadLocale('en');
	setLocale('en');

	await atTheWall();

	hooks.createOrganization.mockImplementationOnce(async () => {
		throw {
			code: 'refused',
			reason: 'groupNeeded',
			message: 'turso refused every group this application could name on its own'
		};
	});

	await walkToCreate();

	await waitFor(() =>
		expect(document.activeElement).toBe(document.querySelector('input[name="group"]'))
	);

	await fireEvent.click(screen.getByRole('button', { name: en.organization.setup.back }));
	await waitFor(() => {
		expect(document.querySelector('[data-setup-step]')?.getAttribute('data-setup-step')).toBe(
			'connect'
		);
	});
	await fireEvent.click(screen.getByRole('button', { name: en.organization.setup.continue }));
	await waitFor(() => {
		expect(document.querySelector('[data-setup-step]')?.getAttribute('data-setup-step')).toBe(
			'name'
		);
	});

	// the group is still asked for, and the cursor is in the first field all the same.
	expect(document.querySelector('input[name="group"]')).not.toBeNull();
	await waitFor(() =>
		expect(document.activeElement).toBe(document.querySelector('input[name="name"]'))
	);
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(document.activeElement).toBe(document.querySelector('input[name="name"]'));
});

/**
 * Effort 851, requirement 40: **a refused connect to the organization the account holds costs the
 * owner nothing they typed.** Driven through the real connect and its refusal, as the group's test
 * above is, because the fields were cleared by what the form does once its submit handler returns.
 */
test('a connect to an existing organization that is refused keeps what was typed and says why', async () => {
	loadLocale('en');
	setLocale('en');

	hooks.groupKind = 'held';
	hooks.connectExisting.mockImplementationOnce(async () => {
		throw {
			code: 'refused',
			reason: 'credentialsWrong',
			message: 'the username or the password does not open this organization'
		};
	});
	await atTheWall();

	render(
		FirstRun,
		{ startup: hooks.startup!, wayIn: '/' },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

	await fireEvent.click(screen.getByRole('button', { name: en.organization.setup.continue }));
	await waitFor(() =>
		expect(document.querySelector('[data-setup-step]')?.getAttribute('data-setup-step')).toBe(
			'existing'
		)
	);

	for (const [name, value] of [
		['username', 'olivia.owner'],
		['password', 'her own password']
	]) {
		await fireEvent.input(document.querySelector(`input[name="${name}"]`)!, {
			target: { value }
		});
	}

	await fireEvent.submit(document.querySelector('form')!);
	await waitFor(() =>
		expect(hooks.connectExisting).toHaveBeenCalledWith({
			username: 'olivia.owner',
			password: 'her own password'
		})
	);

	// the refusal against the password, and both fields still holding what was typed.
	await waitFor(() =>
		expect(document.querySelector('[data-setup-existing-refusal]')?.textContent?.trim()).toBe(
			en.common.refusals.host.credentialsWrong
		)
	);
	await waitFor(() =>
		expect(
			[...document.querySelectorAll<HTMLInputElement>('form input')].map((input) => [
				input.getAttribute('name'),
				input.value
			])
		).toEqual([
			['username', 'olivia.owner'],
			['password', 'her own password']
		])
	);
	expect(document.querySelector('[data-setup-step]')?.getAttribute('data-setup-step')).toBe(
		'existing'
	);
});
