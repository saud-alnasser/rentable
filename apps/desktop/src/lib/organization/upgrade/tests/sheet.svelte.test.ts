import { fireEvent, render } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { i18nObject } from '$lib/i18n/i18n-util';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import type { UpgradePreview } from '$lib/organization/host';
import UpgradeSheet from '$lib/organization/upgrade/component/sheet.svelte';
import { formatLocaleDate } from '$lib/platform/locale';
import Providers from '#tests/providers.svelte';

/**
 * THE UPGRADE SHEET
 *
 * Ticket 08 of [[efforts/857-updating-never-locks-a-member-out/spec]], requirement 3 and criterion
 * 3: before an upgrade runs, the person upgrading sees what it changes, every machine seen in the
 * last seven days that it would stop or make read-only, by member, machine and the rentable it
 * runs, and, under a heading of its own, the machines not seen since, each with the date it last
 * was. Not yet closes it and changes nothing; upgrade now hands the run up, and the caller runs it
 * through the usual outcome (`./host.svelte.test.ts`).
 *
 * The sheet is the edge panel, the form surface at its heavy weight
 * ([[contexts/desktop/components]]).
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 7, 12);
const AWAY = NOW - 20 * DAY;

const PREVIEW: UpgradePreview = {
	steps: [{ describes: 'paymentDirection' }, { describes: 'workspaceOverride' }],
	stopped: [{ member: 'sami.staff', name: "Sami's Laptop", rentable: '0.20.0', seenAt: NOW - DAY }],
	readOnly: [{ member: 'ada.lead', name: null, rentable: null, seenAt: NOW - 2 * DAY }],
	unseen: [{ member: 'omar.away', name: 'Front Desk', rentable: '0.19.1', seenAt: AWAY }],
	needsOwner: false
};

let asked: string[];

beforeEach(() => {
	asked = [];
	document.body.innerHTML = '';
	loadLocale('en');
	setLocale('en');
});

const sheet = (overrides: Record<string, unknown> = {}, direction: 'ltr' | 'rtl' = 'ltr') =>
	render(
		UpgradeSheet,
		// under `props`: the sheet's `target` is also the name of a mount option.
		{
			props: {
				open: true,
				onOpenChange: (open: boolean) => asked.push(`open:${open}`),
				target: { workspace: 'north' },
				name: 'North',
				preview: PREVIEW,
				refusal: null,
				running: false,
				onUpgrade: () => asked.push('upgrade'),
				...overrides
			}
		},
		{ wrapper: Providers, wrapperProps: { strings, direction } }
	);

const surface = () => document.querySelector<HTMLElement>('[data-slot=form-surface]')!;
const list = (kind: string) => surface().querySelector(`[data-upgrade-list="${kind}"]`);
const machines = (kind: string) =>
	[...(list(kind)?.querySelectorAll<HTMLElement>('[data-upgrade-machine]') ?? [])].map(
		(machine) => ({
			member: machine.querySelector('[data-machine-member]')?.textContent?.trim(),
			name: machine.querySelector('[data-machine-name]')?.textContent?.trim(),
			version: machine.querySelector('[data-machine-version]')?.textContent?.trim(),
			seen: machine.querySelector('[data-machine-seen]')?.textContent?.trim()
		})
	);
const notYet = () => surface().querySelector<HTMLButtonElement>('[data-upgrade-not-yet]')!;
const now = () => surface().querySelector<HTMLButtonElement>('[data-upgrade-now]')!;

test('it is the edge panel, named for what it upgrades, listing what each step changes', () => {
	sheet();

	expect(surface().className).toContain('inset-y-0');
	expect(surface().textContent).toContain('Upgrade North');
	expect(surface().textContent).toContain(en.organization.upgrade.description);

	const steps = [...surface().querySelectorAll('[data-upgrade-steps] li')].map((step) =>
		step.textContent?.trim()
	);

	expect(steps).toEqual([
		en.organization.upgrade.steps.paymentDirection,
		en.organization.upgrade.steps.workspaceOverride
	]);
});

test('it lists the machines it stops and makes read-only by member, machine and rentable, and those not seen since apart, with the date', () => {
	sheet();

	const t = i18nObject('en');

	expect(list('stopped')?.querySelector('h3')?.textContent?.trim()).toBe(
		en.organization.upgrade.stopped
	);
	expect(machines('stopped')).toEqual([
		{ member: 'sami.staff', name: "Sami's Laptop", version: 'rentable 0.20.0', seen: undefined }
	]);

	// a machine that never said its name or its version reads as such, never blank.
	expect(list('readOnly')?.querySelector('h3')?.textContent?.trim()).toBe(
		en.organization.upgrade.readOnly
	);
	expect(machines('readOnly')).toEqual([
		{
			member: 'ada.lead',
			name: en.organization.upgrade.unnamedMachine,
			version: en.organization.upgrade.unknownVersion,
			seen: undefined
		}
	]);

	expect(list('unseen')?.querySelector('h3')?.textContent?.trim()).toBe(
		en.organization.upgrade.unseen
	);
	expect(machines('unseen')).toEqual([
		{
			member: 'omar.away',
			name: 'Front Desk',
			version: 'rentable 0.19.1',
			seen: t.organization.upgrade.lastSeen({
				date: formatLocaleDate('en', AWAY, { dateStyle: 'medium' })
			})
		}
	]);

	// a version is a machine's string: it reads left to right in either language.
	expect(list('stopped')?.querySelector('[data-machine-version]')?.getAttribute('dir')).toBe('ltr');
	expect(list('readOnly')?.querySelector('[data-machine-version]')?.getAttribute('dir')).not.toBe(
		'ltr'
	);
});

test('a list with nobody in it is not drawn, and with nobody affected it says so', () => {
	sheet({ preview: { ...PREVIEW, stopped: [], readOnly: [], unseen: [] } });

	expect(list('stopped')).toBeNull();
	expect(list('readOnly')).toBeNull();
	expect(list('unseen')).toBeNull();
	expect(surface().querySelector('[data-upgrade-nobody]')?.textContent?.trim()).toBe(
		en.organization.upgrade.nobodyAffected
	);
});

test('not yet closes it and runs nothing', async () => {
	sheet();

	expect(notYet().textContent?.trim()).toBe(en.organization.upgrade.notYet);
	await fireEvent.click(notYet());

	expect(asked).toEqual(['open:false']);
});

test('upgrade now hands the run up', async () => {
	sheet();

	expect(now().textContent?.trim()).toBe(en.organization.upgrade.now);
	await fireEvent.submit(surface().querySelector('form')!);

	expect(asked).toEqual(['upgrade']);
});

test('while it runs, and while who it affects is still being found, upgrade now waits', async () => {
	sheet({ running: true });

	await fireEvent.submit(surface().querySelector('form')!);
	expect(now().getAttribute('aria-disabled')).toBe('true');

	document.body.innerHTML = '';
	sheet({ preview: undefined });

	expect(surface().querySelector('[data-upgrade-finding]')?.textContent?.trim()).toBe(
		en.organization.upgrade.finding
	);
	await fireEvent.submit(surface().querySelector('form')!);

	expect(asked).toEqual([]);
});

test('an upgrade the reader may not run says why at upgrade now, and runs nothing', async () => {
	const reason = en.common.refusals.host.upgradeNeedsOwner;

	sheet({ refusal: reason });

	expect(now().getAttribute('aria-disabled')).toBe('true');
	expect(now().textContent).toContain(reason);
	await fireEvent.submit(surface().querySelector('form')!);

	expect(asked).toEqual([]);
});

test('the organization is named as such, and every sentence is there in arabic', () => {
	loadLocale('ar');
	setLocale('ar');
	sheet({ target: 'organization', name: '' }, 'rtl');

	expect(surface().textContent).toContain(ar.organization.upgrade.titleOrganization);
	expect(surface().textContent).toContain(ar.organization.upgrade.description);
	expect(list('stopped')?.querySelector('h3')?.textContent?.trim()).toBe(
		ar.organization.upgrade.stopped
	);
	expect(list('readOnly')?.querySelector('h3')?.textContent?.trim()).toBe(
		ar.organization.upgrade.readOnly
	);
	expect(list('unseen')?.querySelector('h3')?.textContent?.trim()).toBe(
		ar.organization.upgrade.unseen
	);
	expect(notYet().textContent?.trim()).toBe(ar.organization.upgrade.notYet);
	expect(now().textContent?.trim()).toBe(ar.organization.upgrade.now);
	expect(
		[...surface().querySelectorAll('[data-upgrade-steps] li')].map((step) =>
			step.textContent?.trim()
		)
	).toEqual([
		ar.organization.upgrade.steps.paymentDirection,
		ar.organization.upgrade.steps.workspaceOverride
	]);
});
