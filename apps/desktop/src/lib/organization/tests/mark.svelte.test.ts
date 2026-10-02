import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import OrganizationMark from '$lib/organization/component/mark.svelte';
import Providers from '#tests/providers.svelte';

/**
 * THE ORGANIZATION'S SIGNATURE OR SEAL, IN SETTINGS
 *
 * Ticket 15 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], criteria 13(b)
 * and 13(d): whoever holds `manageMark` chooses, replaces and removes the mark; a reader without
 * it sees the mark and no control; an image the host refuses is answered with the host's sentence.
 * And ticket 05 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]]: the mark
 * is a settings row, and its remove is the group's end row, confirmed.
 *
 * **What reaches Rust is stood in for**: the router's three mark procedures at the caller, and the
 * open dialog at `tauri`.
 */

const host = vi.hoisted(() => ({
	markGet: vi.fn(),
	markSet: vi.fn(),
	markClear: vi.fn(),
	openImage: vi.fn(),
	errors: [] as unknown[]
}));

vi.mock('$lib/platform/tauri', () => ({
	tauri: { dialog: { openImage: host.openImage } }
}));

// the mark goes through the router's procedures gated on `manageMark`, which hand it to the host.
vi.mock('$lib/api/caller', () => ({
	default: {
		organization: {
			mark: {
				get: () => host.markGet(),
				set: ({ path }: { path: string }) => host.markSet(path),
				clear: () => host.markClear()
			}
		}
	}
}));

// the refusal reaches the mutation capability's shared handler, which turns it into the reader's
// sentence here; what it was handed is what is read.
vi.mock('$lib/error/refusal', async (original) => {
	const refusal = await original<typeof import('$lib/error/refusal')>();

	return {
		...refusal,
		toRefusalText: (...args: Parameters<typeof refusal.toRefusalText>) => {
			host.errors.push(args[0]);

			return refusal.toRefusalText(...args);
		}
	};
});

const MARK = { mediaType: 'image/png', data: 'iVBORw0K' };

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	for (const call of [host.markGet, host.markSet, host.markClear, host.openImage]) call.mockReset();
	host.errors.length = 0;
});

afterEach(() => {
	document.body.innerHTML = '';
});

const shown = (setsMark: boolean) =>
	render(
		OrganizationMark,
		{ setsMark },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

const image = () =>
	document.querySelector<HTMLImageElement>('[data-organization-mark-image]')?.getAttribute('src');

test('a holder of manageMark with no mark set chooses an image, and it is shown', async () => {
	host.markGet.mockResolvedValue(null);
	host.openImage.mockResolvedValue('C:/seal.png');
	host.markSet.mockResolvedValue(MARK);
	shown(true);

	await waitFor(() =>
		expect(document.querySelector('[data-organization-mark-none]')?.textContent?.trim()).toBe(
			en.organization.mark.none
		)
	);
	expect(document.querySelector('[data-organization-mark-remove]')).toBeNull();

	await fireEvent.click(document.querySelector('[data-organization-mark-choose]')!);

	await waitFor(() => expect(image()).toBe('data:image/png;base64,iVBORw0K'));
	expect(host.markSet).toHaveBeenCalledExactlyOnceWith('C:/seal.png');
});

// effort 846, criterion 2 for the mark: removing it ends something nothing but choosing it again
// brings back, so it asks first, and the question says what goes and what brings it back.
test('a holder of manageMark removes the mark, once the question is answered', async () => {
	host.markGet.mockResolvedValue(MARK);
	host.markClear.mockResolvedValue(undefined);
	shown(true);

	await waitFor(() => expect(image()).toBe('data:image/png;base64,iVBORw0K'));
	await fireEvent.click(document.querySelector('[data-organization-mark-remove]')!);

	const dialog = await screen.findByRole('dialog');

	// asked, and nothing removed yet.
	expect(host.markClear).not.toHaveBeenCalled();
	expect(dialog.textContent).toContain(en.organization.mark.removeDescription);

	await fireEvent.click(within(dialog).getByRole('button', { name: en.organization.mark.remove }));

	await waitFor(() => expect(image()).toBeUndefined());
	expect(host.markClear).toHaveBeenCalledOnce();
});

test('leaving the question removes nothing', async () => {
	host.markGet.mockResolvedValue(MARK);
	shown(true);

	await waitFor(() => expect(image()).toBe('data:image/png;base64,iVBORw0K'));
	await fireEvent.click(document.querySelector('[data-organization-mark-remove]')!);

	const dialog = await screen.findByRole('dialog');

	await fireEvent.click(within(dialog).getByRole('button', { name: strings.cancel }));

	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	expect(host.markClear).not.toHaveBeenCalled();
	expect(image()).toBe('data:image/png;base64,iVBORw0K');
});

/** the mark group's rows, in order. */
const rows = () => [...document.querySelectorAll<HTMLElement>('[data-settings-row]')];

// effort 846, criteria 1, 2 and 5 for the mark: one row with the preview as its value, and the
// remove as the group's end row, in the error tone, with its glyph; every button carries a glyph.
test('the mark is a row with its preview, and remove is the end row in the error tone', async () => {
	host.markGet.mockResolvedValue(MARK);
	shown(true);

	await waitFor(() => expect(image()).toBe('data:image/png;base64,iVBORw0K'));

	const [mark, remove] = rows();

	expect(rows()).toHaveLength(2);
	expect(mark.querySelector('[data-row-value] [data-organization-mark-image]')).not.toBeNull();
	expect(mark.dataset.rowTone).toBe('neutral');
	expect(remove.dataset.rowTone).toBe('error');
	expect(remove.querySelector('[data-slot=item-media] svg')).not.toBeNull();
	expect(remove.querySelector('[data-organization-mark-remove]')).not.toBeNull();
	// the end row is after the group's separator, so it is last.
	expect(remove.previousElementSibling?.getAttribute('data-slot')).toBe('item-separator');

	for (const row of rows()) expect(row.querySelector('[data-slot=item-media] svg')).not.toBeNull();

	const buttons = [...document.querySelectorAll('[data-settings-group] button')];

	expect(buttons).toHaveLength(2);
	for (const button of buttons) expect(button.querySelector('svg')).not.toBeNull();
});

test('with no mark set there is nothing to remove, and the group has no end row', async () => {
	host.markGet.mockResolvedValue(null);
	shown(true);

	await waitFor(() =>
		expect(document.querySelector('[data-organization-mark-none]')).not.toBeNull()
	);
	expect(rows()).toHaveLength(1);
	expect(document.querySelector('[data-row-tone=error]')).toBeNull();
});

test('a reader without manageMark sees the mark and is offered no way to change it', async () => {
	host.markGet.mockResolvedValue(MARK);
	shown(false);

	await waitFor(() => expect(image()).toBe('data:image/png;base64,iVBORw0K'));
	expect(document.querySelector('[data-organization-mark-choose]')).toBeNull();
	expect(document.querySelector('[data-organization-mark-remove]')).toBeNull();
	expect(document.querySelector('[data-organization-mark]')?.textContent).toContain(
		en.organization.mark.readOnly
	);
});

test('an image the host refuses is answered with its refusal, and nothing changes', async () => {
	const refusal = { code: 'refused', reason: 'markTooLarge', message: 'the image is 600 KB' };

	host.markGet.mockResolvedValue(null);
	host.openImage.mockResolvedValue('C:/huge.png');
	host.markSet.mockRejectedValue(refusal);
	shown(true);

	await waitFor(() =>
		expect(document.querySelector('[data-organization-mark-choose]')).not.toBeNull()
	);
	await fireEvent.click(document.querySelector('[data-organization-mark-choose]')!);

	await waitFor(() => expect(host.errors).toEqual([refusal]));
	expect(image()).toBeUndefined();
});
