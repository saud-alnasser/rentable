import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { toErrorText } from '$lib/error/message';
import type { Locales } from '$lib/i18n/i18n-types';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { i18nObject } from '$lib/i18n/i18n-util';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import type { OrganizationState } from '$lib/organization/host';
import {
	fakeHeldOrganization,
	fakeOrganizationSession,
	fakeOrganizationState,
	fakeOrganizationWorkspace
} from '$lib/organization/tests/testing';
import { fakeSettings } from '$lib/settings/tests/testing';
import StartupError from '$lib/startup/component/error.svelte';
import StartupSignIn from '$lib/startup/component/sign-in.svelte';
import StartupWorkspaceHeld from '$lib/startup/component/workspace-held.svelte';
import type { Startup } from '$lib/startup';
import { resetUpdater } from '$lib/update/updater.svelte';
import { fakeUpdateHost } from '$lib/update/tests/testing';
import Providers from '#tests/providers.svelte';

import { fakeRecovery, harness, refusal } from './harness';

/**
 * WHERE A PERSON THE VERSION HOLDS STANDS, DRAWN
 *
 * Ticket 11 of [[efforts/857-updating-never-locks-a-member-out/spec]], criteria 7 and 8. Each way in
 * (launch, resume, sign-in, switching workspace, joining) is driven through the real startup unit
 * with the shell's refusal in the reader's language, and the screen the unit then names is drawn
 * from what it wrote, in Arabic and in English: the organization's callout above it at the
 * switcher, with the update action where the version is the reason, and the workspace-held screen
 * in place of a workspace past reading. From each, switching to another organization or another
 * workspace is pressed and works.
 */

vi.mock('$app/forms', async (original) => ({
	...(await original<Record<string, unknown>>()),
	applyAction: async () => {}
}));

// the settings the wall's foot control reads, which a test has no shell to ask.
vi.mock('$lib/api/caller', () => ({
	default: { settings: { get: async () => fakeSettings(), set: async () => fakeSettings() } }
}));

beforeAll(() => {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	window.matchMedia = ((query: string) => ({
		matches: false,
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {}
	})) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
	// the update action is drawn and never pressed here; its host refuses by name if it were.
	resetUpdater({ host: fakeUpdateHost(), push: async () => {} });
});

afterEach(() => {
	document.body.innerHTML = '';
});

const LOCALES: Locales[] = ['en', 'ar'];

const acme = fakeHeldOrganization({ id: 'acme', name: 'Acme Rentals' });
const beta = fakeHeldOrganization({ id: 'beta', name: 'Beta Lettings' });
const north = fakeOrganizationWorkspace({ id: 'north', name: 'North Properties' });
const south = fakeOrganizationWorkspace({ id: 'south', name: 'South Properties' });

/** both organizations held, nobody in, `acme` chosen. */
const atTheWall = (overrides: Partial<OrganizationState> = {}) =>
	fakeOrganizationState({ organizations: [acme, beta], session: null, ...overrides });

/** in, on `acme`, holding both workspaces. */
const inWithTwo = () =>
	fakeOrganizationState({
		organizations: [acme, beta],
		session: fakeOrganizationSession({ workspaces: [north, south] })
	});

/** how a reader in `locale` reads a refusal: the application's own sentence for its reason. */
const readerIn = (locale: Locales) => {
	loadLocale(locale);
	setLocale(locale);
	const LL = i18nObject(locale);

	return {
		LL,
		describeError: (error: unknown) =>
			toErrorText(error, LL, LL.layout.startup.failedToStartFallback())
	};
};

const direction = (locale: Locales) => (locale === 'ar' ? 'rtl' : 'ltr');

const noop = () => {};

/** the wall, drawn from what the unit wrote, wired back to the unit as the root wires it. */
function drawTheWall(startup: Startup, locale: Locales) {
	const snapshot = startup.snapshot;

	return render(
		StartupSignIn,
		{
			situation: snapshot.signInReason,
			organizations: snapshot.organization?.organizations ?? [],
			selected: snapshot.organization?.selected ?? null,
			isSigningIn: snapshot.isSigningIn,
			errorMessage: snapshot.error,
			refusals: snapshot.refusals,
			onSignIn: noop,
			onSelect: (organizationId: string) => void startup.select(organizationId),
			onRemove: noop,
			onSetUpOrganization: noop,
			onJoinByLink: noop
		},
		{ wrapper: Providers, wrapperProps: { strings, direction: direction(locale) } }
	);
}

/** the workspace-held screen, drawn from what the unit wrote, as the root draws it. */
function drawTheHold(startup: Startup, locale: Locales) {
	const { held, organization } = startup.snapshot;

	return render(
		StartupWorkspaceHeld,
		{
			workspaceId: held!.workspaceId,
			name: held!.name,
			sentence: held!.sentence,
			byVersion: held!.byVersion,
			workspaces: (organization?.session?.workspaces ?? []).filter(
				(workspace) => workspace.id !== held!.workspaceId
			),
			onSwitch: (workspaceId: string) => void startup.switchWorkspace(workspaceId),
			onRetry: () => void startup.switchWorkspace(held!.workspaceId)
		},
		{ wrapper: Providers, wrapperProps: { strings, direction: direction(locale) } }
	);
}

const callout = () => document.querySelector<HTMLElement>('[data-organization-refusal]');

/** the callout stands above the switcher's trigger, inside the same head. */
function expectTheCalloutAbove(organizationId: string, sentence: string, byVersion: boolean) {
	const drawn = callout();
	const trigger = document.querySelector('[data-organization-switcher]');

	expect(drawn?.getAttribute('data-organization-refusal')).toBe(organizationId);
	expect(drawn?.querySelector('[data-organization-refusal-sentence]')?.textContent?.trim()).toBe(
		sentence
	);
	expect(
		drawn!.compareDocumentPosition(trigger!) & Node.DOCUMENT_POSITION_FOLLOWING,
		'the callout is above the organization it is about'
	).toBeTruthy();
	expect(drawn?.querySelector('[data-update-action="notice"]') !== null).toBe(byVersion);
}

/** choose another organization at the switcher the way a pointer does, and let the unit run. */
async function chooseAtTheSwitcher(organizationId: string) {
	await fireEvent.click(document.querySelector<HTMLButtonElement>('[data-organization-switcher]')!);
	await tick();
	await fireEvent.click(
		document.querySelector<HTMLElement>(`[data-organization-switcher-row="${organizationId}"]`)!
	);
	await vi.waitFor(() => undefined);
}

for (const locale of LOCALES) {
	test(`${locale}: a launch on an organization a newer rentable upgraded lands on the switcher with the callout, and another opens`, async () => {
		const { LL, describeError } = readerIn(locale);
		const { startup, standWith } = harness({
			describeError,
			organization: atTheWall({
				heldByVersion: [
					{
						target: 'organization',
						standing: 'unreadable',
						reason: 'format 5 past 4'
					}
				]
			})
		});

		await startup.start();
		drawTheWall(startup, locale);

		expect(startup.snapshot.state).toBe('sign-in');
		expectTheCalloutAbove('acme', LL.common.refusals.host.organizationNewer(), true);

		// the other organization opens from here, and its wall carries no callout.
		standWith(atTheWall());
		await chooseAtTheSwitcher('beta');
		await vi.waitFor(() => expect(startup.snapshot.organization?.selected).toBe('beta'));

		document.body.innerHTML = '';
		drawTheWall(startup, locale);
		expect(callout()).toBeNull();
	});

	test(`${locale}: a resume the version refused on a retry stays on the switcher with the callout`, async () => {
		const { LL, describeError } = readerIn(locale);
		const { startup, standWith } = harness({ describeError, organization: inWithTwo() });

		await startup.start();
		expect(startup.snapshot.state).toBe('ready');

		// the organization was upgraded while the machine was away, and a resume meets it.
		standWith(
			atTheWall({
				heldByVersion: [{ target: 'organization', standing: 'unreadable', reason: 'format 5' }]
			})
		);
		await startup.retry();
		await startup.retry();
		drawTheWall(startup, locale);

		expect(startup.snapshot.state).toBe('sign-in');
		expectTheCalloutAbove('acme', LL.common.refusals.host.organizationNewer(), true);
	});

	test(`${locale}: a sign-in the organization refused says why above it, and any other refusal says its own`, async () => {
		const { LL, describeError } = readerIn(locale);
		let reason: 'organizationNewer' | 'organizationCredentialLapsed' = 'organizationNewer';
		const { startup } = harness({
			describeError,
			organization: atTheWall(),
			signInWith: async () => {
				throw refusal(reason);
			}
		});

		await startup.start();
		await startup.signIn('olivia', 'the password');
		drawTheWall(startup, locale);

		expectTheCalloutAbove('acme', LL.common.refusals.host.organizationNewer(), true);
		expect(document.querySelector('[data-slot=callout][data-organization-refusal]')).not.toBeNull();

		document.body.innerHTML = '';
		reason = 'organizationCredentialLapsed';
		await startup.signIn('olivia', 'the password');
		drawTheWall(startup, locale);

		expectTheCalloutAbove('acme', LL.common.refusals.host.organizationCredentialLapsed(), false);

		await chooseAtTheSwitcher('beta');
		await vi.waitFor(() => expect(startup.snapshot.organization?.selected).toBe('beta'));
	});

	test(`${locale}: a workspace a newer rentable upgraded stands on the workspace-held screen, and another opens from it`, async () => {
		const { LL, describeError } = readerIn(locale);
		const { startup, journal } = harness({
			describeError,
			organization: inWithTwo(),
			openWorkspace: async (id) => {
				if (id === 'south') throw refusal('workspaceNewer');
			}
		});

		await startup.start();
		await startup.switchWorkspace('south');
		expect(startup.snapshot.state).toBe('held');

		drawTheHold(startup, locale);

		expect(
			document.querySelector('[data-workspace-held]')?.getAttribute('data-workspace-held')
		).toBe('south');
		expect(document.querySelector('[data-workspace-held-name]')?.textContent?.trim()).toBe(
			'South Properties'
		);
		expect(document.querySelector('[data-workspace-held-reason]')?.textContent?.trim()).toBe(
			LL.common.refusals.host.workspaceNewer()
		);
		expect(document.querySelector('[data-update-action="screen"]')).not.toBeNull();
		expect(document.querySelector('[data-workspace-held-retry]')).toBeNull();
		expect(screen.getByText(LL.layout.startup.otherWorkspaces())).toBeTruthy();
		expect(document.querySelector('[data-workspace-held-switch="south"]')).toBeNull();

		await fireEvent.click(document.querySelector('[data-workspace-held-switch="north"]')!);
		await vi.waitFor(() => expect(startup.snapshot.state).toBe('ready'));
		expect(journal.workspacesOpened.at(-1)).toBe('north');
	});

	// ticket 25: a workspace refused for a reason that is not its version keeps the person in, on
	// the same screen saying that reason, with no update offered and a way to try it again.
	test(`${locale}: a workspace refused for another reason says it, offers to try again, and another opens`, async () => {
		const { LL, describeError } = readerIn(locale);
		let full = true;
		let opened = 'north';
		const { startup, journal } = harness({
			describeError,
			organization: inWithTwo(),
			openWorkspace: async (id) => void (opened = id),
			bootstrap: async () => {
				if (opened === 'south' && full) throw refusal('copyNotTaken');

				return fakeRecovery();
			}
		});

		await startup.start();
		await startup.switchWorkspace('south');
		expect(startup.snapshot.state).toBe('held');

		drawTheHold(startup, locale);

		expect(document.querySelector('[data-workspace-held-name]')?.textContent?.trim()).toBe(
			'South Properties'
		);
		expect(document.querySelector('[data-workspace-held-reason]')?.textContent?.trim()).toBe(
			LL.common.refusals.host.copyNotTaken()
		);
		expect(document.querySelector('[data-update-action]')).toBeNull();
		expect(document.querySelector('[data-workspace-held-switch="north"]')).not.toBeNull();

		// the space was cleared, and trying again opens it.
		full = false;
		await fireEvent.click(screen.getByText(LL.layout.startup.tryAgain()));
		await vi.waitFor(() => expect(startup.snapshot.state).toBe('ready'));
		expect(journal.workspacesOpened.at(-1)).toBe('south');
	});

	// ticket 40: a member with a read-only grant whose workspace is behind a step a reader needs
	// meets the same screen, saying it waits for somebody with full access to open it on the new
	// version, never the failure screen; the others stay reachable, and once a machine with full
	// access has brought it up, trying again opens it.
	test(`${locale}: a reader held behind a step waits for full access on the new version, and opens once it is up`, async () => {
		const { LL, describeError } = readerIn(locale);
		let broughtUp = false;
		let opened = 'north';
		const { startup, journal } = harness({
			describeError,
			organization: inWithTwo(),
			openWorkspace: async (id) => {
				if (id === 'south' && !broughtUp) throw refusal('workspaceBehind');
				opened = id;
			},
			bootstrap: async () => fakeRecovery()
		});

		await startup.start();
		await startup.switchWorkspace('south');
		expect(startup.snapshot.state).toBe('held');

		drawTheHold(startup, locale);

		const sentence = {
			en: 'this workspace is waiting for someone with full access to open it on the new version of rentable. try again later.',
			ar: 'مساحة العمل هذه بانتظار شخص لديه صلاحية كاملة ليفتحها على الإصدار الجديد من rentable. حاول مرة أخرى لاحقاً.'
		}[locale as 'en' | 'ar'];

		expect(LL.common.refusals.host.workspaceBehind()).toBe(sentence);
		expect(document.querySelector('[data-workspace-held-name]')?.textContent?.trim()).toBe(
			'South Properties'
		);
		expect(document.querySelector('[data-workspace-held-reason]')?.textContent?.trim()).toBe(
			sentence
		);
		expect(document.querySelector('[data-update-action]')).toBeNull();
		expect(document.querySelector('[data-workspace-held-switch="north"]')).not.toBeNull();
		expect(opened).toBe('north');

		// a machine with full access brought it up in the background, and trying again opens it.
		broughtUp = true;
		await fireEvent.click(screen.getByText(LL.layout.startup.tryAgain()));
		await vi.waitFor(() => expect(startup.snapshot.state).toBe('ready'));
		expect(journal.workspacesOpened.at(-1)).toBe('south');
	});

	test(`${locale}: a link refused because its organization cannot open returns to the switcher with the callout`, async () => {
		const { LL, describeError } = readerIn(locale);
		const { startup } = harness({ describeError, organization: atTheWall({ selected: 'beta' }) });

		await startup.start();
		expect(
			await startup.organizationRefused('acme', refusal('organizationNewer'), {
				arrive: async () => {}
			})
		).toBe(true);
		drawTheWall(startup, locale);

		expectTheCalloutAbove('acme', LL.common.refusals.host.organizationNewer(), true);

		await chooseAtTheSwitcher('beta');
		await vi.waitFor(() => expect(startup.snapshot.organization?.selected).toBe('beta'));
	});

	test(`${locale}: the failure screen keeps the reason it was given behind its details`, async () => {
		const { LL } = readerIn(locale);

		render(
			StartupError,
			{ message: 'the disk is full', detail: 'os error 28', onRetry: noop },
			{ wrapper: Providers, wrapperProps: { strings, direction: direction(locale) } }
		);

		expect(document.body.textContent).not.toContain('the disk is full');

		await fireEvent.click(screen.getByText(LL.common.actions.details()));

		const detail = document.querySelector('[data-error-detail-text="startup"]');

		expect(detail?.textContent).toContain('the disk is full');
		expect(detail?.textContent).toContain('os error 28');
	});
}
