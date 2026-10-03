import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeAll, expect, test } from 'vitest';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import type { MachineView } from '$lib/organization/host';
import Machines from '$lib/organization/session/component/machines.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { formatLocaleDate } from '$lib/platform/locale';
import Providers from '#tests/providers.svelte';

/**
 * THE READER'S MACHINES, RENDERED
 *
 * Criteria 9 to 11 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]] at the
 * interface: a row per machine signed in as the reader, this one first and marked, a machine with
 * no name of its own under its fallback and never its id, a sign-out in every row's menu, this
 * machine's handed to the section that asks about it, a machine that has not run this version
 * refused alone with the act that reaches it offered, and each confirmation naming the machine or
 * machines it ends. *Signing one machine out moved from an error-tone button on its row into the
 * row's menu on 2026-10-02, at the human's word ("Move it off the rows") (ticket 23). On 2026-10-03
 * this machine's sign-out joined its row's menu and signing every other machine out moved from the
 * card's end row to a red text in its header (ticket 46).* Which machines
 * are listed, and in what order, is Rust's (`organization/session/machine.rs`); this draws the
 * list it is given in that order.
 *
 * The block is props, so nothing here provides a query; what each act asks for is read off the
 * handlers it was given.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.now();
const ADDED = Date.UTC(2026, 8, 3, 12);

const machine = (overrides: Partial<MachineView>): MachineView => ({
	id: 'machine-desk',
	name: "Olivia's Desk",
	seenAt: NOW,
	createdAt: ADDED,
	isThisMachine: false,
	mayEndAlone: true,
	...overrides
});

/** this machine, a laptop seen three hours ago, one with no name seen a month ago, and one older than
 * this version. */
const MACHINES: MachineView[] = [
	machine({ id: 'machine-here', name: "Olivia's Desk", isThisMachine: true, mayEndAlone: false }),
	machine({ id: 'machine-laptop', name: "Olivia's Laptop", seenAt: NOW - 3 * HOUR }),
	machine({ id: 'machine-nameless', name: null, seenAt: NOW - 30 * DAY }),
	machine({ id: 'machine-old', name: 'Old Tower', mayEndAlone: false })
];

const draw = (locale: 'en' | 'ar' = 'en', machines = MACHINES) => {
	loadLocale(locale);
	setLocale(locale);

	const asked: string[] = [];

	render(
		Machines,
		{
			machines,
			onEndMachine: async (machineId: string) => {
				asked.push(`endMachine:${machineId}`);
			},
			onEndOtherSessions: async () => {
				asked.push('endOtherSessions');
			},
			onSignOut: () => {
				asked.push('signOut');
			}
		},
		{
			wrapper: Providers,
			wrapperProps: { strings, direction: locale === 'ar' ? 'rtl' : 'ltr' }
		}
	);

	return asked;
};

const group = () => document.querySelector<HTMLElement>('[data-machines] [data-settings-group]')!;

const rows = () => [...group().querySelectorAll<HTMLElement>('[data-settings-row]')];

/** a row's name, without the badge that may stand beside it. */
const nameOf = (row: Element) =>
	row.querySelector('[data-slot=item-title] > span:first-child')?.textContent?.trim();

/** the menu control a row carries, and nothing where it carries none. */
const menuOf = (row: Element) => row.querySelector<HTMLElement>('[data-machine-menu]');

/** open a row's menu and hand back its sign-out entry; the menu is portalled, so it is the document's. */
const openMenu = async (row: Element) => {
	await fireEvent.click(menuOf(row)!);

	return document.querySelector<HTMLElement>(
		'[data-slot=dropdown-menu-item][data-end-machine], [data-slot=dropdown-menu-item][data-sign-out-open]'
	)!;
};

/** the header's act that signs every other machine out. */
const others = () =>
	group().querySelector<HTMLElement>(
		'[data-settings-group-header] [data-settings-group-action] [data-end-other-sessions-open]'
	)!;

// a menu and a tooltip are placed against their trigger, and jsdom implements no ResizeObserver.
beforeAll(() => {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

const added = (locale: 'en' | 'ar') => formatLocaleDate(locale, ADDED, { dateStyle: 'medium' });

test('this machine is listed first and marked, with when each machine was seen and added', () => {
	draw();

	const [here, laptop, nameless] = rows();

	expect(rows().map(nameOf)).toEqual([
		"Olivia's Desk",
		"Olivia's Laptop",
		en.settings.you.machines.unnamed.replace('{date:string}', added('en')),
		'Old Tower'
	]);

	expect(here.querySelector('[data-this-machine]')).not.toBeNull();
	// marked by a badge beside its name, as a passkey used from this device is (effort 846).
	expect(here.querySelector('[data-slot=item-title] [data-row-badge]')?.textContent?.trim()).toBe(
		en.settings.you.machines.thisMachine
	);
	expect(group().querySelectorAll('[data-this-machine]')).toHaveLength(1);
	expect(group().querySelectorAll('[data-row-badge]')).toHaveLength(1);

	// when it was seen and added is the line under the name, not a column at the row's end.
	expect(laptop.querySelector('[data-row-meta]')?.textContent).toContain('last seen 3 hours ago');
	expect(laptop.querySelector('[data-row-value]')).toBeNull();

	// the card says how many are signed in, at its header's end.
	expect(group().querySelector('[data-settings-group-value]')?.textContent?.trim()).toBe(
		en.settings.you.machines.signedIn.replace('{count:number}', '4')
	);

	// within a day it is said relative to now; further back, as a date, and still listed.
	expect(laptop.textContent).toContain('last seen 3 hours ago');
	expect(laptop.textContent).toContain(`added ${added('en')}`);
	expect(here.textContent).toContain('last seen now');
	expect(nameless.textContent).toContain(
		`last seen ${formatLocaleDate('en', NOW - 30 * DAY, { dateStyle: 'medium' })}`
	);

	for (const row of rows()) {
		expect(row.querySelector('[data-slot=item-media] svg')).not.toBeNull();
	}
});

test('a machine with no name of its own reads as a machine added on its date, never as its id', () => {
	draw();

	const nameless = rows()[2];

	expect(nameOf(nameless)).toBe(`a machine added ${added('en')}`);
	expect(group().textContent).not.toContain('machine-nameless');
});

test("every machine is signed out from its row's menu, and nothing on a row is red", () => {
	draw();

	expect(
		[...group().querySelectorAll<HTMLElement>('[data-machine-menu]')].map(
			(control) => control.dataset.machineMenu
		)
	).toEqual(['machine-here', 'machine-laptop', 'machine-nameless', 'machine-old']);

	// each menu is named for the machine it acts on, so a screen reader tells them apart.
	expect(
		screen.getByRole('button', {
			name: en.settings.you.machines.menu.replace('{machine:string}', "Olivia's Laptop")
		})
	).toBeDefined();

	// the card holds no end row: every row is a machine, and none is in the error tone.
	expect(rows()).toHaveLength(4);
	expect(rows().filter((row) => row.dataset.rowTone === 'error')).toEqual([]);
	expect(group().querySelector('[data-slot=item-separator]')).toBeNull();

	const errorText = /\btext-destructive\b/;

	for (const row of rows()) {
		for (const button of row.querySelectorAll('button')) {
			expect(button.className).not.toMatch(errorText);
		}
	}

	// the card's one red is the header's act, signing every other machine out.
	expect(others().textContent?.trim()).toBe(en.settings.you.sessions.short);
	expect(others().className).toMatch(errorText);
	expect(group().querySelectorAll('button[class*=text-destructive]')).toHaveLength(1);
});

// effort 846 ticket 46, at the human's word of 2026-10-03 ("merge them ... simpley an otpoin to
// login out of the mecahine"): this machine's own row menu holds its sign-out, which the section
// confirms.
test("this machine's row menu holds signing it out, and hands it to the section to ask", async () => {
	const asked = draw();

	const entry = await openMenu(rows()[0]);

	expect(entry.hasAttribute('data-sign-out-open')).toBe(true);
	expect(entry.textContent?.trim()).toBe(en.settings.you.thisMachine.signOut);
	expect(entry.getAttribute('aria-disabled')).not.toBe('true');

	await fireEvent.click(entry);

	await expect.poll(() => asked).toEqual(['signOut']);
});

test('a machine that has not run this version is refused alone, and signing every other one out is offered', async () => {
	const asked = draw();

	const old = rows()[3];

	expect(old.querySelector('[data-not-updated]')?.textContent?.trim()).toBe(
		en.settings.you.machines.notUpdated
	);

	const refused = await openMenu(old);

	expect(refused.textContent?.trim()).toBe(en.common.actions.signOut);
	expect(refused.getAttribute('aria-disabled')).toBe('true');
	expect(refused.hasAttribute('data-unavailable')).toBe(true);
	// reachable: the menu's own disabled mark is what would take it out of the keyboard's path.
	expect(refused.hasAttribute('data-disabled')).toBe(false);

	await fireEvent.focus(refused);

	const reason = await waitFor(() => {
		const drawn = document.querySelector('[data-unavailable-reason]');

		expect(drawn).not.toBeNull();

		return drawn;
	});

	expect(reason?.textContent).toBe(en.common.refusals.host.machineNotUpdated);
	expect(reason?.textContent).toContain(en.settings.you.sessions.short);

	await fireEvent.click(refused);

	expect(screen.queryByRole('dialog')).toBeNull();
	expect(asked).toEqual([]);

	await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

	// the act its reason names is right there, in the same card's header, and offered.
	expect(others().hasAttribute('aria-disabled')).toBe(false);
});

test('a machine that has run this version is not refused in its menu', async () => {
	draw();

	const entry = await openMenu(rows()[1]);

	expect(entry.getAttribute('aria-disabled')).not.toBe('true');
	expect(entry.hasAttribute('data-unavailable')).toBe(false);
});

test('signing one machine out from its menu asks first, naming the machine, and then ends that one', async () => {
	const asked = draw();

	await fireEvent.click(await openMenu(rows()[1]));

	const dialog = await screen.findByRole('dialog');

	expect(dialog.textContent).toContain("Olivia's Laptop");
	expect(dialog.textContent).toContain(en.settings.you.machines.confirmDescription);
	expect(asked).toEqual([]);

	await fireEvent.click(
		[...dialog.querySelectorAll('button')].find(
			(button) => button.textContent?.trim() === en.common.actions.signOut
		)!
	);

	await expect.poll(() => asked).toEqual(['endMachine:machine-laptop']);
});

test('a nameless machine is confirmed by its fallback', async () => {
	draw();

	await fireEvent.click(await openMenu(rows()[2]));

	const dialog = await screen.findByRole('dialog');

	expect(dialog.textContent).toContain(`a machine added ${added('en')}`);
	expect(dialog.textContent).not.toContain('machine-nameless');
});

test('signing every other machine out asks first, naming every other machine and not this one', async () => {
	const asked = draw();

	await fireEvent.click(others());

	const dialog = await screen.findByRole('dialog');

	for (const name of ["Olivia's Laptop", `a machine added ${added('en')}`, 'Old Tower']) {
		expect(dialog.textContent).toContain(name);
	}
	expect(dialog.textContent).not.toContain("Olivia's Desk");
	expect(dialog.textContent).toContain(en.settings.you.sessions.confirmDescription);

	await fireEvent.click(
		[...dialog.querySelectorAll('button')].find(
			(button) => button.textContent?.trim() === en.common.actions.signOut
		)!
	);

	await expect.poll(() => asked).toEqual(['endOtherSessions']);
});

test('and in arabic, this machine is marked and the fallback is written in its own words', () => {
	draw('ar');

	expect(rows()[0].querySelector('[data-row-badge]')?.textContent?.trim()).toBe(
		ar.settings.you.machines.thisMachine
	);
	expect(nameOf(rows()[2])).toBe(ar.settings.you.machines.unnamed.replace('{date}', added('ar')));
	expect(others().textContent?.trim()).toBe(ar.settings.you.sessions.short);
});

test('where no other machine is signed in, signing the others out is refused and says why', async () => {
	const asked = draw('en', [MACHINES[0]]);

	const act = others();

	expect(act.getAttribute('aria-disabled')).toBe('true');
	expect(act.hasAttribute('data-unavailable')).toBe(true);
	// never the platform's disabled, so the reason stays reachable.
	expect(act.hasAttribute('disabled')).toBe(false);
	expect(document.getElementById(act.getAttribute('aria-describedby')!)?.textContent).toBe(
		en.settings.you.sessions.noOthers
	);

	await fireEvent.focus(act);

	const reason = await waitFor(() => {
		const drawn = document.querySelector('[data-unavailable-reason]');

		expect(drawn?.textContent).toBe(en.settings.you.sessions.noOthers);

		return drawn;
	});

	expect(reason).not.toBeNull();

	await fireEvent.click(act);

	expect(screen.queryByRole('dialog')).toBeNull();
	expect(asked).toEqual([]);
});
