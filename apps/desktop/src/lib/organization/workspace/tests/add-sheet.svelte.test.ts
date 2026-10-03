import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { i18nObject } from '$lib/i18n/i18n-util';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import AddSheet, {
	type HolderCandidate
} from '$lib/organization/workspace/component/add-sheet.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { pastTheWait, typeSearch } from '$lib/list/tests/search';
import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import Providers from '#tests/providers.svelte';

/**
 * MEMBERS ARE ADDED TO A WORKSPACE FROM ONE CHECKLIST
 *
 * Ticket 52 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], at the
 * human's walk of 2026-10-03: "the add sheet desgin feels odd first when a member is choosen they
 * just removed from the dropdown added in a free from list yet the dropdown remains; try to find
 * the best way to add a member using the plus". The sheet holds one list: a search field over
 * every member not in the workspace, always shown and narrowed in place; a row pressed, or Space
 * on it, is checked where it stands; the one button counts the checked and hands them up in the
 * list's order. The sheet is read on its own here, so a refusal is the caller handing it back its
 * reason and the candidates without those already granted.
 */

const candidates: HolderCandidate[] = [
	{ id: 'sami', username: 'sami', role: 'member' },
	{ id: 'samira', username: 'samira', role: 'manager' },
	{ id: 'noura', username: 'noura', role: 'member' }
];

const sheet = (overrides: Record<string, unknown> = {}) => {
	const onSave = vi.fn();
	const props = {
		open: true,
		onOpenChange: () => {},
		workspaceName: 'Riyadh',
		candidates,
		isSaving: false,
		error: null as string | null,
		onSave,
		...overrides
	};
	const rendered = render(AddSheet, props, {
		wrapper: Providers,
		wrapperProps: { strings, direction: 'ltr' }
	});

	return { ...rendered, onSave };
};

const surface = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const listbox = () => document.querySelector<HTMLElement>('[role="listbox"]');
const row = (id: string) => document.querySelector<HTMLElement>(`[data-holder-candidate="${id}"]`);
const rowIds = () =>
	Array.from(document.querySelectorAll('[data-holder-candidate]')).map((item) =>
		item.getAttribute('data-holder-candidate')
	);
const checkedIds = () =>
	Array.from(document.querySelectorAll('[data-holder-candidate][aria-selected="true"]')).map(
		(item) => item.getAttribute('data-holder-candidate')
	);
const save = () => surface().querySelector<HTMLButtonElement>('button[type="submit"]')!;
const said = () => document.querySelector('[data-holders-add-error]')?.textContent ?? '';

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

// criterion: the list shows every member not in the workspace without opening anything; typing
// filters it by username in place; with nothing matching it says so; with nobody left it says so.
test('every member not in the workspace is listed at once, with nothing to open', () => {
	sheet();

	expect(listbox()?.getAttribute('aria-multiselectable')).toBe('true');
	expect(rowIds()).toEqual(['sami', 'samira', 'noura']);
	// each row is the person: the disc, the username and the role's badge, and an unticked check.
	expect(row('samira')?.textContent).toContain('SA');
	expect(row('samira')?.textContent).toContain('samira');
	expect(row('samira')?.querySelector('[data-slot="badge"]')?.textContent?.trim()).toBe('manager');
	expect(row('samira')?.querySelector('[data-holder-check]')).not.toBeNull();
	expect(checkedIds()).toEqual([]);
});

test('typing narrows the same list by username, in place', async () => {
	sheet();

	await typeSearch('sam');
	await pastTheWait();

	await waitFor(() => expect(rowIds()).toEqual(['sami', 'samira']));
	expect(listbox()).not.toBeNull();
});

test('a search that finds nobody says so, and the way out clears it', async () => {
	sheet();

	await typeSearch('zz');
	await pastTheWait();

	await waitFor(() => {
		expect(document.querySelector('[data-holder-no-match]')?.textContent).toContain(
			en.organization.workspacePage.noMatch
		);
	});

	const clear = document.querySelector<HTMLButtonElement>('[data-holder-no-match] button')!;

	await fireEvent.click(clear);

	await waitFor(() => expect(rowIds()).toEqual(['sami', 'samira', 'noura']));
});

test('with nobody left to add the sheet says so', () => {
	sheet({ candidates: [] });

	expect(listbox()).toBeNull();
	expect(document.querySelector('[data-holders-nobody-left]')?.textContent).toContain(
		en.organization.workspacePage.nobodyToAdd
	);
});

// criterion: pressing a row and pressing Space on it toggle its check, the row staying in the list
// and in place; arrow keys move between rows; no second list or dropdown exists.
test('pressing a row checks it where it stands, and pressing it again unchecks it', async () => {
	sheet();

	await fireEvent.click(row('samira')!);

	expect(checkedIds()).toEqual(['samira']);
	expect(rowIds()).toEqual(['sami', 'samira', 'noura']);
	expect(row('samira')?.querySelector('[data-holder-check] svg')).not.toBeNull();

	await fireEvent.click(row('samira')!);

	expect(checkedIds()).toEqual([]);
	expect(rowIds()).toEqual(['sami', 'samira', 'noura']);
});

test('space on a row checks and unchecks it', async () => {
	sheet();

	await fireEvent.keyDown(row('noura')!, { key: ' ' });
	expect(checkedIds()).toEqual(['noura']);

	await fireEvent.keyDown(row('noura')!, { key: ' ' });
	expect(checkedIds()).toEqual([]);
	expect(rowIds()).toEqual(['sami', 'samira', 'noura']);
});

test('one row is in the tab order and the arrows move between the rows', async () => {
	sheet();

	const stops = () =>
		Array.from(document.querySelectorAll('[data-holder-candidate][tabindex="0"]')).map((item) =>
			item.getAttribute('data-holder-candidate')
		);

	expect(stops()).toEqual(['sami']);

	row('sami')!.focus();
	await fireEvent.keyDown(row('sami')!, { key: 'ArrowDown' });
	expect(document.activeElement).toBe(row('samira'));

	await fireEvent.keyDown(row('samira')!, { key: 'End' });
	expect(document.activeElement).toBe(row('noura'));

	await fireEvent.keyDown(row('noura')!, { key: 'ArrowDown' });
	expect(document.activeElement).toBe(row('noura'));

	await fireEvent.keyDown(row('noura')!, { key: 'ArrowUp' });
	expect(document.activeElement).toBe(row('samira'));
	expect(stops()).toEqual(['samira']);

	await fireEvent.keyDown(row('samira')!, { key: 'Home' });
	expect(document.activeElement).toBe(row('sami'));
});

test('the down arrow in the search field reaches the list', async () => {
	sheet();

	const field = surface().querySelector<HTMLInputElement>('[data-search-field] input')!;

	field.focus();
	await fireEvent.keyDown(field, { key: 'ArrowDown' });

	expect(document.activeElement).toBe(row('sami'));
});

test('there is one list: no dropdown to open and no list of the chosen beside it', async () => {
	sheet();

	await fireEvent.click(row('sami')!);

	expect(document.querySelectorAll('[role="listbox"]').length).toBe(1);
	expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
	expect(document.querySelector('[data-slot="command"]')).toBeNull();
	expect(document.querySelector('[data-holder-pick]')).toBeNull();
	expect(document.querySelector('[data-holders-chosen]')).toBeNull();
	expect(surface().querySelectorAll('ul').length).toBe(1);
});

// criterion: the button counts the checked in both locales and is disabled at none; save grants
// each in order and closes; a refusal keeps the sheet with its reason, the granted gone and the
// rest checked.
test('the button counts the checked and cannot be pressed with none', async () => {
	const { onSave } = sheet();
	const t = i18nObject('en');

	expect(save().disabled).toBe(true);
	expect(save().textContent?.trim()).toBe(t.organization.workspacePage.addCount({ count: 0 }));

	await fireEvent.click(save());
	expect(onSave).not.toHaveBeenCalled();

	await fireEvent.click(row('sami')!);
	expect(save().disabled).toBe(false);
	expect(save().textContent?.trim()).toBe('add 1 member');

	await fireEvent.click(row('noura')!);
	expect(save().textContent?.trim()).toBe('add 2 members');
});

test('in arabic the button counts in its plural forms', async () => {
	loadLocale('ar');
	setLocale('ar');

	const t = i18nObject('ar');

	sheet({
		candidates: [
			...candidates,
			{ id: 'huda', username: 'huda', role: 'member' },
			{ id: 'lama', username: 'lama', role: 'member' }
		]
	});

	expect(surface().textContent).toContain(ar.organization.workspacePage.addMembers);
	expect(save().textContent?.trim()).toBe('أضف أعضاء');

	await fireEvent.click(row('sami')!);
	expect(save().textContent?.trim()).toBe('أضف عضوًا واحدًا');

	await fireEvent.click(row('noura')!);
	expect(save().textContent?.trim()).toBe('أضف عضوين');

	await fireEvent.click(row('huda')!);
	expect(save().textContent?.trim()).toBe('أضف 3 أعضاء');
	expect(save().textContent?.trim()).toBe(t.organization.workspacePage.addCount({ count: 3 }));
	expect(t.organization.workspacePage.addCount({ count: 11 })).toBe('أضف 11 عضوًا');

	setLocale('en');
});

test('the save hands up every checked member in the list order, not the order pressed', async () => {
	const { onSave } = sheet();

	await fireEvent.click(row('noura')!);
	await fireEvent.click(row('sami')!);
	await fireEvent.click(save());

	expect(onSave).toHaveBeenCalledWith(['sami', 'noura']);
});

test('a refusal stays in the sheet with its reason, the granted gone and the rest checked', async () => {
	const { onSave, rerender } = sheet();

	await fireEvent.click(row('sami')!);
	await fireEvent.click(row('samira')!);
	await fireEvent.click(row('noura')!);
	await fireEvent.click(save());
	expect(onSave).toHaveBeenCalledWith(['sami', 'samira', 'noura']);

	// sami went in before the refusal: the caller lists him no longer, and says why it stopped.
	await rerender({
		candidates: candidates.filter((candidate) => candidate.id !== 'sami'),
		error: 'refused'
	});

	expect(surface()).not.toBeNull();
	expect(said()).toContain('refused');
	expect(said()).toContain(en.organization.workspacePage.notAllAdded);
	expect(rowIds()).toEqual(['samira', 'noura']);
	expect(checkedIds()).toEqual(['samira', 'noura']);
	expect(save().textContent?.trim()).toBe('add 2 members');
});
