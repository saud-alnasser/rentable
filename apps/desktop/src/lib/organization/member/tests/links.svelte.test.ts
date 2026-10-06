import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeAll, expect, test } from 'vitest';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import type { OutstandingLink } from '$lib/organization/host';
import Links from '$lib/organization/member/component/links.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { formatLocaleTimeUntil } from '$lib/platform/locale';
import Providers from '#tests/providers.svelte';

/**
 * THE LINKS WAITING TO BE OPENED, RENDERED
 *
 * Effort 851, at the human's word: "there should be a menu to manage invites to revoke them from
 * the app for who has the permissions for it". A row per link, named for the member it is for as
 * they wrote their username, saying what opening it does, when it lapses in the reader's own words
 * and who made it where the row says; a revoke in each row's menu, asked first, naming the member
 * and saying a new link brings them in; and, with nothing waiting, the empty block saying where a
 * link comes from. Who is shown the card is the organization tab's (`app/tests/settings-area`), and
 * which links are listed is Rust's (`invitation/outstanding.rs`); this draws what it is given.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.now();

const link = (overrides: Partial<OutstandingLink>): OutstandingLink => ({
	id: 'link-sami',
	memberId: 'sami',
	username: 'sami.staff',
	purpose: 'join',
	madeBy: 'olivia',
	madeAt: NOW,
	expiresAt: NOW + 3 * DAY + HOUR,
	...overrides
});

/** one of each kind, newest first, as the shell answers them; the card shows the soonest first. */
const LINKS: OutstandingLink[] = [
	link({ id: 'link-rami', memberId: 'rami', username: 'rami.staff', purpose: 'reset' }),
	link({
		id: 'link-noor',
		memberId: 'noor',
		username: 'noor.staff',
		purpose: 'machine',
		madeBy: null,
		expiresAt: NOW + 5 * HOUR + 10 * 60 * 1000
	}),
	link({})
];

const draw = (locale: 'en' | 'ar' = 'en', links = LINKS) => {
	loadLocale(locale);
	setLocale(locale);

	const asked: string[] = [];
	const rendered = render(
		Links,
		{
			links,
			onRevoke: async (linkId: string) => {
				asked.push(`revoke:${linkId}`);
			}
		},
		{
			wrapper: Providers,
			wrapperProps: { strings, direction: locale === 'ar' ? 'rtl' : 'ltr' }
		}
	);

	return { asked, rendered };
};

const group = () => document.querySelector<HTMLElement>('[data-links] [data-settings-group]')!;

const rows = () => [...group().querySelectorAll<HTMLElement>('[data-settings-row]')];

const nameOf = (row: Element) =>
	row.querySelector('[data-slot=item-title] > span:first-child')?.textContent?.trim();

const metaOf = (row: Element) => row.querySelector('[data-row-meta]')?.textContent?.trim();

/** open a row's menu and hand back its revoke; the menu is portalled, so it is the document's. */
const openMenu = async (row: Element) => {
	await fireEvent.click(row.querySelector<HTMLElement>('[data-link-menu]')!);

	return await waitFor(() => {
		const entry = document.querySelector<HTMLElement>(
			'[data-slot=dropdown-menu-item][data-revoke-link]'
		);

		expect(entry).not.toBeNull();

		return entry!;
	});
};

const lapses = (locale: 'en' | 'ar', moment: number) => formatLocaleTimeUntil(locale, moment, NOW);

// a menu and a tooltip are placed against their trigger, and jsdom implements no ResizeObserver.
beforeAll(() => {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

test('each link is a row named for its member, saying what it does, when it lapses and who made it', () => {
	draw();

	expect(group().querySelector('h2')?.textContent?.trim()).toBe(en.organization.links.title);
	// the soonest to lapse first, and two lapsing together by username.
	expect(rows().map(nameOf)).toEqual(['noor.staff', 'rami.staff', 'sami.staff']);

	const [noor, rami, sami] = rows();

	expect(metaOf(rami)).toBe(
		`${en.organization.links.reset} · lapses ${lapses('en', LINKS[0].expiresAt)} · made by olivia`
	);
	// a machine link records nobody as its maker, and says nothing about one.
	expect(metaOf(noor)).toBe(`${en.organization.links.machine} · lapses in 5 hours`);
	expect(metaOf(sami)).toBe(`${en.organization.links.join} · lapses in 3 days · made by olivia`);

	// a username is drawn as its member wrote it: its first letter is not raised.
	expect(rami.querySelector('[data-slot=item-title] > span:first-child')?.className).not.toContain(
		'first-letter:uppercase'
	);

	// each row leads with its glyph, and the card says nothing is waiting only where nothing is.
	for (const row of rows()) {
		expect(row.querySelector('[data-slot=item-media] svg')).not.toBeNull();
	}
	expect(group().querySelector('[data-empty]')).toBeNull();
});

test("a revoke is in each row's menu, named for the member, in the menu's own tone", async () => {
	draw();

	expect(
		screen.getByRole('button', {
			name: en.organization.links.menu.replace('{username:string}', 'noor.staff')
		})
	).toBeDefined();

	const entry = await openMenu(rows()[0]);

	expect(entry.textContent?.trim()).toBe(en.organization.links.revoke);
	expect(entry.dataset.revokeLink).toBe('link-noor');
	expect(entry.dataset.variant).not.toBe('destructive');
});

test('revoking asks first, naming the member and what brings them in, then revokes and the row goes', async () => {
	const { asked, rendered } = draw();

	await fireEvent.click(await openMenu(rows()[2]));

	const dialog = await screen.findByRole('dialog');

	expect(dialog.textContent).toContain('sami.staff');
	expect(dialog.textContent).toContain(en.organization.links.confirmDescription);
	// nothing is revoked while the question stands.
	expect(asked).toEqual([]);

	await fireEvent.click(
		[...dialog.querySelectorAll('button')].find(
			(button) => button.textContent?.trim() === en.organization.links.confirmLabel
		)!
	);

	await expect.poll(() => asked).toEqual(['revoke:link-sami']);

	// the list is read again once it went, and the row is not in it.
	await rendered.rerender({ links: LINKS.slice(0, 2) });

	expect(rows().map(nameOf)).toEqual(['noor.staff', 'rami.staff']);
});

test('leaving the question revokes nothing', async () => {
	const { asked } = draw();

	await fireEvent.click(await openMenu(rows()[0]));

	const dialog = await screen.findByRole('dialog');

	await fireEvent.click(
		[...dialog.querySelectorAll('button')].find(
			(button) => button.textContent?.trim() !== en.organization.links.confirmLabel
		)!
	);

	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	expect(asked).toEqual([]);
	expect(rows()).toHaveLength(3);
});

test('with nothing waiting, the card says so and where a link comes from', () => {
	draw('en', []);

	expect(rows()).toEqual([]);

	const empty = group().querySelector<HTMLElement>('[data-empty]')!;

	expect(empty.dataset.empty).toBe('nothing-yet');
	expect(empty.textContent).toContain(en.organization.links.noneTitle);
	expect(empty.textContent).toContain(en.organization.links.noneDescription);
	// no act: a link is made from the member's card.
	expect(empty.querySelector('button')).toBeNull();
});

test('and in arabic, every line is written in its own words and the lapse is said the Arabic way', async () => {
	draw('ar');

	expect(group().querySelector('h2')?.textContent?.trim()).toBe(ar.organization.links.title);

	const [noor, rami, sami] = rows();

	// the username keeps its own direction inside the Arabic row.
	expect(sami.querySelector('[data-slot=item-title] bdi')?.textContent).toBe('sami.staff');
	expect(metaOf(sami)).toBe(
		[
			ar.organization.links.join,
			ar.organization.links.lapses.replace('{moment}', lapses('ar', LINKS[2].expiresAt)),
			ar.organization.links.madeBy.replace('{username}', 'olivia')
		].join(' · ')
	);
	expect(metaOf(noor)).toContain(ar.organization.links.machine);
	expect(metaOf(rami)).toContain(ar.organization.links.reset);
	expect(metaOf(sami)).not.toMatch(/lapses|made by/);

	await fireEvent.click(await openMenu(sami));

	const dialog = await screen.findByRole('dialog');

	expect(dialog.textContent).toContain(ar.organization.links.confirmDescription);
	expect(
		[...dialog.querySelectorAll('button')].some(
			(button) => button.textContent?.trim() === ar.organization.links.confirmLabel
		)
	).toBe(true);

	setLocale('en');
});

test('and in arabic, nothing waiting reads in its own words', () => {
	draw('ar', []);

	const empty = group().querySelector<HTMLElement>('[data-empty]')!;

	expect(empty.textContent).toContain(ar.organization.links.noneTitle);
	expect(empty.textContent).toContain(ar.organization.links.noneDescription);

	setLocale('en');
});

/** seven links, each lapsing an hour after the one before, handed over in no order at all. */
const MANY: OutstandingLink[] = [5, 2, 6, 0, 3, 1, 4].map((hour) =>
	link({
		id: `link-${hour}`,
		memberId: `member-${hour}`,
		username: `member${hour}.staff`,
		expiresAt: NOW + (hour + 1) * HOUR
	})
);

const scrollArea = () => group().querySelector<HTMLElement>('[data-settings-group-scroll]')!;
const searchInput = () => group().querySelector<HTMLInputElement>('[data-search-field] input');
const countOf = () => group().querySelector('[data-links-count]')?.textContent?.trim();

test('a long list shows four rows and scrolls the rest inside the card, soonest first', () => {
	draw('en', MANY);

	expect(rows().map(nameOf)).toEqual([0, 1, 2, 3, 4, 5, 6].map((hour) => `member${hour}.staff`));

	// every row is in the card's own scroll area, which shows four of them; jsdom lays nothing out,
	// so what is read is the area and the count it is bounded to.
	const area = scrollArea();

	expect(area.dataset.rowsInView).toBe('4');
	// a region named by the card's title, as a bounded directory's area is.
	expect(screen.getAllByRole('region', { name: en.organization.links.title })).toEqual([
		group(),
		area
	]);
	expect(area.className).toContain('overflow-y-auto');
	expect(rows().every((row) => area.contains(row))).toBe(true);
	// the header and the search stay outside it, so they never scroll away.
	expect(area.contains(group().querySelector('[data-settings-group-header]'))).toBe(false);
	expect(area.contains(searchInput())).toBe(false);
	// nothing in it holds the focus: the rows' own menus are the tab order, and the area is none.
	expect(area.hasAttribute('tabindex')).toBe(false);
	expect(rows().every((row) => row.querySelector('[data-link-menu]') !== null)).toBe(true);
});

test('the count is in the header, whatever the length, and the search only past four', () => {
	draw('en', LINKS);

	expect(countOf()).toBe('3 links');
	expect(searchInput()).toBeNull();
	// four or fewer read at a glance: the area is there and bounds nothing yet.
	expect(rows().every((row) => scrollArea().contains(row))).toBe(true);
});

test('four links are still read rather than searched', () => {
	draw('en', MANY.slice(0, 4));

	expect(countOf()).toBe('4 links');
	expect(searchInput()).toBeNull();
});

test('past four, the search finds a link by username, and a search finding none is cleared', async () => {
	draw('en', MANY);

	expect(countOf()).toBe('7 links');

	const input = searchInput()!;

	expect(input.placeholder).toBe(en.organization.links.searchPlaceholder);

	await fireEvent.input(input, { target: { value: 'MEMBER4' } });

	await waitFor(() => expect(rows().map(nameOf)).toEqual(['member4.staff']));
	expect(countOf()).toBe('1 link');

	await fireEvent.input(input, { target: { value: 'nobody' } });

	const noMatch = await waitFor(() => {
		const block = group().querySelector<HTMLElement>('[data-links-no-match] [data-empty]');

		expect(block).not.toBeNull();

		return block!;
	});

	expect(rows()).toEqual([]);
	expect(noMatch.dataset.empty).toBe('no-match');
	expect(noMatch.textContent).toContain(en.common.messages.noMatch);
	// the field is still there to change, and the count says what was found.
	expect(searchInput()).not.toBeNull();
	expect(countOf()).toBe('0 links');

	await fireEvent.click(
		[...noMatch.querySelectorAll('button')].find(
			(button) => button.textContent?.trim() === en.common.actions.clearSearch
		)!
	);

	await waitFor(() => expect(rows()).toHaveLength(7));
	expect(searchInput()!.value).toBe('');
	expect(group().querySelector('[data-links-no-match]')).toBeNull();
});

test('and in arabic, the count, the search and its no-match read in their own words', async () => {
	draw('ar', MANY);

	// the count's digits are the Western ones the application writes every number in.
	expect(countOf()).toBe(ar.organization.links.count.replace('{count|number}', '7'));

	const input = searchInput()!;

	expect(input.placeholder).toBe(ar.organization.links.searchPlaceholder);

	await fireEvent.input(input, { target: { value: 'nobody' } });

	const noMatch = await waitFor(() => {
		const block = group().querySelector<HTMLElement>('[data-links-no-match] [data-empty]');

		expect(block).not.toBeNull();

		return block!;
	});

	expect(noMatch.textContent).toContain(ar.common.messages.noMatch);
	expect(noMatch.textContent).toContain(ar.common.actions.clearSearch);

	setLocale('en');
});
