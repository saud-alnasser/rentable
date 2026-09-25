import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import OrganizationMark from '$lib/organization/component/mark.svelte';
import QueryProviders from '#tests/query-providers.svelte';

/**
 * THE ORGANIZATION'S SIGNATURE OR SEAL, IN SETTINGS
 *
 * Ticket 15 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], criteria 13(b)
 * and 13(d): whoever holds `manageMark` chooses, replaces and removes the mark; a reader without
 * it sees the mark and no control; an image the host refuses is answered with the host's sentence.
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
		app: {
			organization: {
				mark: {
					get: () => host.markGet(),
					set: ({ path }: { path: string }) => host.markSet(path),
					clear: () => host.markClear()
				}
			}
		}
	}
}));

vi.mock('$lib/design/mutation', async (original) => ({
	...(await original<Record<string, unknown>>()),
	onMutationError: (_: unknown, error: unknown) => host.errors.push(error)
}));

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
		{ wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' } }
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

test('a holder of manageMark removes the mark', async () => {
	host.markGet.mockResolvedValue(MARK);
	host.markClear.mockResolvedValue(undefined);
	shown(true);

	await waitFor(() => expect(image()).toBe('data:image/png;base64,iVBORw0K'));
	await fireEvent.click(document.querySelector('[data-organization-mark-remove]')!);

	await waitFor(() => expect(image()).toBeUndefined());
	expect(host.markClear).toHaveBeenCalledOnce();
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
