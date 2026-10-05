import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import type { OrganizationSession } from '$lib/organization/host';
import OrganizationName from '$lib/organization/component/name.svelte';
import { ORGANIZATION_NAME_LIMIT } from '$lib/organization/setup/setup';
import { hostAnswers, resetHostAnswers } from '$lib/organization/tests/host-hooks';
import { fakeOrganizationSession } from '$lib/organization/tests/testing.ts';
import { BUILT_IN, EVERY_FLAG, maskOf } from '@rentable/workspace-permission';
import Providers from '#tests/providers.svelte';

/**
 * THE ORGANIZATION'S NAME, IN ITS TAB
 *
 * Effort 851, criteria 22, 23 and 25, at the card: the organization tab's first card names the
 * organization, and its owner alone meets the edit, which opens the light rename form. The form
 * holds the name to the walk's rules with the walk's two sentences, hands the procedure the name
 * trimmed, and closes with no write when the name did not change. Which card the tab draws first,
 * and for whom, is read with the tab in `app/tests/settings-area.svelte.test.ts`.
 *
 * **What reaches the shell is stood in for**: the rename's mutation, through the host's hooks
 * (`./host-hooks.ts`), which note what they were handed. The submit is a real one, through
 * superforms with `applyAction` off, as the complex form's test explains.
 */

vi.mock('$lib/organization/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

beforeAll(() => {
	Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
	resetHostAnswers();
	loadLocale('en');
	setLocale('en');
});

const OWNER = fakeOrganizationSession({ organizationName: 'Acme Rentals' });

const card = (session: OrganizationSession = OWNER, direction: 'ltr' | 'rtl' = 'ltr') =>
	render(
		OrganizationName,
		{ session },
		{ wrapper: Providers, wrapperProps: { strings, direction } }
	);

const edit = () => document.querySelector<HTMLButtonElement>('[data-organization-rename-open]');
const field = () => document.querySelector<HTMLInputElement>('[data-organization-name-field]');
const surface = () => document.querySelector<HTMLFormElement>('[data-slot=form-surface] form');
const renames = () =>
	hostAnswers.writes
		.filter(({ hook }) => hook === 'useRenameOrganization')
		.map(({ input }) => input);

/** the owner opens the form, types `name` and saves. */
const saved = async (name: string) => {
	await fireEvent.click(edit()!);
	await waitFor(() => expect(field()?.value).toBe('Acme Rentals'));
	await fireEvent.input(field()!, { target: { value: name } });
	await fireEvent.submit(surface()!);
};

test("the card names the organization under its tile, and the owner's edit opens the form on it", async () => {
	card();

	const group = document.querySelector<HTMLElement>(
		'[data-organization-name] [data-settings-group]'
	)!;

	expect(group.querySelector('h2')?.textContent?.trim()).toBe('Acme Rentals');
	expect(group.querySelector('[data-organization-tile]')?.textContent?.trim()).toBe('A');
	expect(group.querySelector('[data-settings-group-description]')?.textContent?.trim()).toBe(
		en.organization.name.description
	);

	// the card's one act, quiet words at its header's end, named for the whole act.
	const open = within(group).getByRole('button', { name: en.organization.name.edit });

	expect(open.textContent?.trim()).toBe(en.common.actions.edit);
	expect(open.querySelector('svg')).toBeNull();
	expect(surface()).toBeNull();

	await fireEvent.click(open);

	await waitFor(() => expect(field()?.value).toBe('Acme Rentals'));
	expect(screen.getByText(en.organization.name.renameDescription)).toBeDefined();
});

// criterion 22, at the card: no flag carries the rename, so a manager and a member holding every
// flag meet the name and a line saying who changes it, and no edit.
test('a manager and a member holding every flag meet the name and no edit', () => {
	for (const session of [
		fakeOrganizationSession({
			organizationName: 'Acme Rentals',
			role: 'manager',
			roleId: 'manager',
			permissions: BUILT_IN.manager.mask
		}),
		fakeOrganizationSession({
			organizationName: 'Acme Rentals',
			role: 'member',
			roleId: 'member',
			permissions: maskOf(...EVERY_FLAG)
		})
	]) {
		const { unmount } = card(session);
		const group = document.querySelector<HTMLElement>('[data-organization-name]')!;

		expect(group.querySelector('h2')?.textContent?.trim()).toBe('Acme Rentals');
		expect(edit()).toBeNull();
		expect(group.querySelectorAll('button')).toHaveLength(0);
		expect(group.textContent).toContain(en.organization.name.readOnly);

		unmount();
	}
});

// criterion 23: blank, whitespace and one character past the limit are refused on the field with
// the walk's two sentences, and nothing is written.
test("a name past the walk's rules is refused on the field with the walk's sentences", async () => {
	card();

	for (const [name, sentence] of [
		['', en.organization.setup.nameRequired],
		['   ', en.organization.setup.nameRequired],
		['n'.repeat(ORGANIZATION_NAME_LIMIT + 1), en.organization.setup.nameTooLong]
	]) {
		if (!surface()) {
			await fireEvent.click(edit()!);
		}

		await waitFor(() => expect(field()).not.toBeNull());
		await fireEvent.input(field()!, { target: { value: name } });
		await fireEvent.submit(surface()!);

		// each refusal replaces the one before it, so the sentence is what is waited on.
		await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(sentence));
		expect(field()?.getAttribute('aria-invalid')).toBe('true');
	}

	expect(renames()).toEqual([]);
	expect(surface()).not.toBeNull();
});

// criteria 23 and 25: a valid name reaches the procedure trimmed, and the form closes.
test('a new name is saved trimmed and the form closes', async () => {
	card();

	await saved('  Acme Holdings  ');

	await waitFor(() => expect(renames()).toEqual([{ name: 'Acme Holdings' }]));
	await waitFor(() => expect(surface()).toBeNull());
});

test('the name it already has closes the form with no write', async () => {
	card();

	await saved(' Acme Rentals ');

	await waitFor(() => expect(surface()).toBeNull());
	expect(renames()).toEqual([]);
});

test('and in arabic, the card and the refusal read right to left', async () => {
	loadLocale('ar');
	setLocale('ar');
	card(OWNER, 'rtl');

	expect(
		within(document.querySelector<HTMLElement>('[data-organization-name]')!).getByRole('button', {
			name: ar.organization.name.edit
		})
	).toBeDefined();

	await fireEvent.click(edit()!);
	await waitFor(() => expect(field()).not.toBeNull());
	await fireEvent.input(field()!, { target: { value: 'ن'.repeat(ORGANIZATION_NAME_LIMIT + 1) } });
	await fireEvent.submit(surface()!);

	await waitFor(() =>
		expect(screen.getByRole('alert').textContent).toBe(ar.organization.setup.nameTooLong)
	);
	expect(renames()).toEqual([]);

	setLocale('en');
});
