import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, expect, test, vi } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { i18nObject } from '$lib/i18n/i18n-util';
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
 * THE FIRST RUN, FROM THE PRESS OF CREATE TO THE LOADING PASS
 *
 * Effort 832, requirement 18: creating an organization is the consent, then the name, then the
 * application, with one loading pass after the walk. `setup-walk.svelte.test.ts` holds the walk's
 * two steps as the screen draws them; this holds what the route does once the name step's create
 * answers, because the hand-over is the route's: **after the create, no second busy surface comes
 * before the loading pass**, the first workspace is made as that pass's first stage, named after
 * the organization, and the pass goes on into it.
 *
 * The route is rendered whole. What reaches Rust is stood in for at the query hooks, the address
 * and the navigation are mocked because this runner has no router, and the startup unit is a real
 * one, driven through the same harness `layout/tests/startup.test.ts` drives it with, so what the
 * loading surface would show is what the unit actually reported.
 */

const hooks = vi.hoisted(() => ({
	startup: null as unknown,
	events: [] as string[],
	createOrganization: vi.fn(),
	createWorkspace: vi.fn(),
	goto: vi.fn()
}));

vi.mock('$app/forms', async (original) => ({
	...(await original<Record<string, unknown>>()),
	applyAction: async () => {}
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

vi.mock('$lib/organization/query', async (original) => {
	const idle = { isPending: false, mutateAsync: async () => ({}) };

	return {
		...(await original<Record<string, unknown>>()),
		// a machine holding the Turso authority, with nobody in: the consent step opens granted.
		useFetchOrganizationState: () => ({
			data: {
				organization: null,
				session: null,
				holdsTursoAuthority: true,
				signedOutElsewhere: false
			},
			refetch: async () => ({ data: { holdsTursoAuthority: true } })
		}),
		useBeginConsent: () => idle,
		useConsentResult: () => ({ data: undefined }),
		useDisconnect: () => idle,
		useConnectExisting: () => idle,
		useInspectGroup: () => ({ isPending: false, mutateAsync: async () => ({ kind: 'empty' }) }),
		useCreateOrganization: () => ({ isPending: false, mutateAsync: hooks.createOrganization }),
		useCreateWorkspace: () => ({ isPending: false, mutateAsync: hooks.createWorkspace })
	};
});

afterEach(() => {
	hooks.events.length = 0;
	hooks.createOrganization.mockReset();
	hooks.createWorkspace.mockReset();
	hooks.goto.mockReset();
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
	render(Page, {}, { wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } });

	// the consent is already granted, so the way on is one press.
	expect(document.querySelector('[data-setup-position]')?.textContent?.trim()).toBe(
		i18nObject('en').organization.setup.position({ step: 1, total: 2 })
	);
	await fireEvent.click(screen.getByRole('button', { name: en.organization.setup.continue }));
	await waitFor(() => {
		expect(document.querySelector('[data-setup-step]')?.getAttribute('data-setup-step')).toBe(
			'name'
		);
	});
	expect(document.querySelector('[data-setup-position]')?.textContent?.trim()).toBe(
		i18nObject('en').organization.setup.position({ step: 2, total: 2 })
	);

	for (const [name, value] of [
		['name', 'Acme Rentals'],
		['username', 'olivia.owner'],
		['password', 'a long enough password']
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
