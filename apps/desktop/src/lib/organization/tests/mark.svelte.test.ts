import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import OrganizationMark from '$lib/organization/component/mark.svelte';
import Providers from '#tests/providers.svelte';

/**
 * THE ORGANIZATION STAMP, IN SETTINGS
 *
 * Ticket 15 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], criteria 13(b)
 * and 13(d): whoever holds `manageMark` chooses, replaces and removes the mark; a reader without
 * it sees the mark and no control; an image the host refuses is answered with the host's sentence.
 * And tickets 05, 34 and 36 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]]:
 * the mark's preview replaces it, and its remove is an icon button on the preview's corner,
 * confirmed. And ticket 47: the preview sits in the card header's trailing edge with no row, and
 * the replace glyph and the remove are one matching pair inside its corners.
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

// the tooltip measures its content once it opens, which jsdom has nothing to do with.
beforeAll(() => {
	window.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

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

/** the hint a control's tooltip shows once it is focused. */
const hintOf = async (trigger: HTMLElement, mark: string) => {
	await fireEvent.focus(trigger);

	return waitFor(() => {
		const hint = document.querySelector<HTMLElement>(`[${mark}]`);

		expect(hint).not.toBeNull();

		return hint!.textContent?.trim();
	});
};

// effort 846 ticket 36, at the human's word of 2026-10-02 ("the remove ... needs to be integrated
// in into the part of the image not a separate thing maybe a button"): no remove row (and since
// ticket 47, no row at all; the picture is in the header). The remove is an icon button on the preview's corner, beside the preview and not
// inside it, named by its label and its tooltip, red on the button alone, and it asks first.
test('the stamp is removed from its picture, by an icon button on the corner, and no row', async () => {
	host.markGet.mockResolvedValue(MARK);
	shown(true);

	await waitFor(() => expect(image()).toBe('data:image/png;base64,iVBORw0K'));

	const action = document.querySelector<HTMLElement>('[data-settings-group-action]')!;

	// no rows, no end row, no separator, nothing in the error tone but the one button.
	expect(rows()).toHaveLength(0);
	expect(document.querySelector('[data-row-tone=error]')).toBeNull();
	expect(document.querySelector('[data-settings-group] [data-slot=item-separator]')).toBeNull();
	expect(action.querySelector('[data-organization-mark-image]')).not.toBeNull();

	const preview = within(action).getByRole('button', { name: en.organization.mark.replace });
	const remove = within(action).getByRole('button', { name: en.organization.mark.removeTitle });

	// on the picture: in the header's action slot with the preview, its sibling, never in it.
	expect(remove.closest('[data-settings-group-action]')).toBe(action);
	expect(remove.parentElement).toBe(preview.parentElement);
	expect(preview.contains(remove)).toBe(false);

	// a glyph and no words on screen; its name is its label and its tooltip.
	expect(remove.querySelector('svg')).not.toBeNull();
	expect(remove.textContent?.trim()).toBe('');
	expect(await hintOf(remove, 'data-organization-mark-remove-hint')).toBe(
		en.organization.mark.removeTitle
	);

	// red on the button alone: the one thing in the card in the error tone.
	expect(remove.className).toMatch(/text-destructive/);
	expect([
		...document.querySelectorAll<HTMLElement>('[data-organization-mark] [class*=text-destructive]')
	]).toEqual([remove]);

	// every button in the card carries a glyph, and there are the two.
	const buttons = [...document.querySelectorAll('[data-settings-group] button')];

	expect(buttons).toHaveLength(2);
	for (const button of buttons) expect(button.querySelector('svg')).not.toBeNull();

	// pressing it asks, and removes nothing yet.
	await fireEvent.click(remove);

	const dialog = await screen.findByRole('dialog');

	expect(dialog.textContent).toContain(en.organization.mark.removeDescription);
	expect(host.markClear).not.toHaveBeenCalled();
});

test('with no stamp set there is nothing to remove, and no remove button', async () => {
	host.markGet.mockResolvedValue(null);
	shown(true);

	await waitFor(() =>
		expect(document.querySelector('[data-organization-mark-none]')).not.toBeNull()
	);
	expect(rows()).toHaveLength(0);
	expect(document.querySelector('[data-organization-mark-remove]')).toBeNull();
	expect(screen.queryByRole('button', { name: en.organization.mark.removeTitle })).toBeNull();
	expect(document.querySelector('[data-row-tone=error]')).toBeNull();
});

// the card is named the organization stamp in both languages, and nothing it shows the reader
// says signature or seal (ticket 36: "it should be named ... organizations stamp").
test('the card is titled the organization stamp, and says signature or seal nowhere', async () => {
	host.markGet.mockResolvedValue(MARK);
	shown(true);

	await waitFor(() => expect(image()).toBe('data:image/png;base64,iVBORw0K'));

	const card = document.querySelector<HTMLElement>('[data-organization-mark]')!;

	expect(card.textContent?.toLowerCase()).toContain('organization stamp');
	expect(en.organization.mark.title).toBe('organization stamp');
	expect(ar.organization.mark.title).toBe('ختم المؤسسة');

	const said = [
		card.textContent ?? '',
		...[...card.querySelectorAll('[aria-label],[alt]')].map(
			(element) =>
				`${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('alt') ?? ''}`
		),
		...Object.values(en.organization.mark),
		...Object.values(ar.organization.mark)
	].join(' ');

	expect(said).not.toMatch(/signature|seal|توقيع/i);
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

// effort 846 ticket 34 ("the replace image button of seal; it should be the preview show if
// clicked it opens file system to replace it"): there is no replace image button. The preview is
// the button, named for replacing the image, and pressing it opens the file picker; with no image
// yet the empty preview chooses one; remove is still confirmed.
test('the preview is the control that replaces the image, and there is no replace button', async () => {
	host.markGet.mockResolvedValue(MARK);
	host.openImage.mockResolvedValue('C:/new-seal.png');
	host.markSet.mockResolvedValue({ mediaType: 'image/png', data: 'bmV3' });
	shown(true);

	await waitFor(() => expect(image()).toBe('data:image/png;base64,iVBORw0K'));

	const card = document.querySelector<HTMLElement>('[data-organization-mark]')!;
	const named = (name: string) =>
		within(document.body)
			.queryAllByRole('button')
			.filter((button) => button.textContent?.trim().toLowerCase() === name.toLowerCase());

	// no button reads replace image; the one named so is the preview, holding the image.
	expect(named(en.organization.mark.replace)).toEqual([]);

	const preview = within(card).getByRole('button', { name: en.organization.mark.replace });

	expect(preview.querySelector('[data-organization-mark-image]')).not.toBeNull();
	expect(preview.closest('[data-settings-group-action]')).not.toBeNull();
	// the preview and the remove, and nothing beside the preview.
	expect(card.querySelectorAll('button')).toHaveLength(2);

	await fireEvent.click(preview);

	await waitFor(() => expect(image()).toBe('data:image/png;base64,bmV3'));
	expect(host.openImage).toHaveBeenCalledOnce();
	expect(host.markSet).toHaveBeenCalledExactlyOnceWith('C:/new-seal.png');

	// remove is on the picture's corner, and asks before it takes anything.
	await fireEvent.click(
		within(card).getByRole('button', { name: en.organization.mark.removeTitle })
	);
	await screen.findByRole('dialog');
	expect(host.markClear).not.toHaveBeenCalled();
});

test('with no image, the empty preview is the control that chooses one', async () => {
	host.markGet.mockResolvedValue(null);
	host.openImage.mockResolvedValue(null);
	shown(true);

	const card = await waitFor(() => {
		const found = document.querySelector<HTMLElement>('[data-organization-mark]');

		expect(found?.querySelector('[data-organization-mark-none]')).not.toBeNull();

		return found!;
	});
	const preview = within(card).getByRole('button', { name: en.organization.mark.choose });

	expect(preview.querySelector('[data-organization-mark-none]')).not.toBeNull();

	await fireEvent.click(preview);

	await waitFor(() => expect(host.openImage).toHaveBeenCalledOnce());
	// the picker was left without a choice, so nothing was written.
	expect(host.markSet).not.toHaveBeenCalled();
});

test('a reader without manageMark meets the preview as a picture, not a button', async () => {
	host.markGet.mockResolvedValue(MARK);
	shown(false);

	await waitFor(() => expect(image()).toBe('data:image/png;base64,iVBORw0K'));
	expect(document.querySelector('[data-organization-mark-image]')?.closest('button')).toBeNull();
	expect(document.querySelectorAll('[data-organization-mark] button')).toHaveLength(0);
});

// effort 846 ticket 47, at the human's word of 2026-10-03 ("the image neexsc on the righrt side no
// need to be under"): the picture is not a row under the header. It sits in the header's trailing
// action slot, beside the title and the card's one line, and the card has no rows; its corners are
// placed by the logical edge, so Arabic mirrors it.
test.each([
	{ locale: 'en' as const, said: en, direction: 'ltr' as const, sets: true },
	{ locale: 'ar' as const, said: ar, direction: 'rtl' as const, sets: true },
	{ locale: 'en' as const, said: en, direction: 'ltr' as const, sets: false },
	{ locale: 'ar' as const, said: ar, direction: 'rtl' as const, sets: false }
])(
	'the picture sits in the header beside the title, and no row, in $locale (manageMark: $sets)',
	async ({ locale, said, direction, sets }) => {
		loadLocale(locale);
		setLocale(locale);
		host.markGet.mockResolvedValue(MARK);
		render(
			OrganizationMark,
			{ setsMark: sets },
			{ wrapper: Providers, wrapperProps: { strings, direction } }
		);

		await waitFor(() => expect(image()).toBe('data:image/png;base64,iVBORw0K'));

		const group = document.querySelector<HTMLElement>('[data-settings-group]')!;
		const header = group.querySelector<HTMLElement>('[data-settings-group-header]')!;
		const action = header.querySelector<HTMLElement>('[data-settings-group-action]')!;

		// no rows, no list, no separator, no footer: the header is the whole card.
		expect(rows()).toHaveLength(0);
		expect(group.querySelector('[data-slot=item-group], [data-slot=item-separator]')).toBeNull();
		expect(group.querySelector('[data-settings-group-footer]')).toBeNull();
		expect(group.lastElementChild).toBe(header);

		// the title and its line first, then the picture at the header's end.
		expect(header.querySelector('h2')?.textContent?.trim()).toBe(said.organization.mark.title);
		expect(header.lastElementChild).toBe(action);
		expect(action.querySelector('[data-organization-mark-image]')).not.toBeNull();

		if (!sets) {
			// a picture and nothing to press, with the sentence saying who can change it.
			expect(action.querySelector('button')).toBeNull();
			expect(header.textContent).toContain(said.organization.mark.readOnly);

			return;
		}

		// the picture and both its controls are in the action slot, the controls placed by the
		// logical end, never by left or right, and never past the picture's edge.
		const preview = within(action).getByRole('button', { name: said.organization.mark.replace });
		const remove = within(action).getByRole('button', {
			name: said.organization.mark.removeTitle
		});

		expect(preview.querySelector('[data-organization-mark-image]')).not.toBeNull();
		expect(remove.parentElement).toBe(preview.parentElement);
		for (const corner of action.querySelectorAll<HTMLElement>('[data-organization-mark-corner]')) {
			expect(corner.className).toMatch(/\bend-1\.5\b/);
			expect(corner.className).not.toMatch(/(^|\s)-|\b(left|right)-/);
		}
	}
);

// effort 846 ticket 47 ("the button of delete and add a littilbe bit needs to be worked on"): the
// replace glyph and the remove are one pair, the same disc inside the picture's two trailing
// corners. Replace is the picture itself and remove is beside it; each is named by its label and
// its tooltip and is reached by the keyboard; remove alone is red and asks first.
test('replace and remove are a matching pair, each named and reached by the keyboard', async () => {
	host.markGet.mockResolvedValue(MARK);
	host.openImage.mockResolvedValue(null);
	shown(true);

	await waitFor(() => expect(image()).toBe('data:image/png;base64,iVBORw0K'));

	const card = document.querySelector<HTMLElement>('[data-organization-mark]')!;
	const preview = within(card).getByRole('button', { name: en.organization.mark.replace });
	const remove = within(card).getByRole('button', { name: en.organization.mark.removeTitle });
	const glyph = preview.querySelector<HTMLElement>('[data-organization-mark-corner=replace]')!;

	// drawn alike: the same disc, at the top and the bottom of the same edge.
	expect(remove.dataset.organizationMarkCorner).toBe('remove');
	expect(glyph.getAttribute('aria-hidden')).toBe('true');

	const shape = (element: HTMLElement) =>
		element.className
			.split(/\s+/)
			.filter((name) =>
				/^(absolute|end-|size-|rounded-|border|bg-background|shadow-|backdrop-)/.test(name)
			)
			.filter((name) => !name.startsWith('border-destructive'))
			.sort();

	expect(shape(glyph)).toEqual(shape(remove));
	expect(shape(remove)).toEqual(expect.arrayContaining(['size-6', 'rounded-full']));
	expect(glyph.className).toMatch(/\bbottom-1\.5\b/);
	expect(remove.className).toMatch(/\btop-1\.5\b/);

	// each is named by its label and its tooltip, and each takes the keyboard's focus in turn.
	expect(await hintOf(preview, 'data-organization-mark-choose-hint')).toBe(
		en.organization.mark.replace
	);
	expect(await hintOf(remove, 'data-organization-mark-remove-hint')).toBe(
		en.organization.mark.removeTitle
	);
	for (const control of [preview, remove]) {
		expect(control.tagName).toBe('BUTTON');
		expect(control.hasAttribute('disabled')).toBe(false);
		expect(control.tabIndex).toBe(0);
		control.focus();
		expect(document.activeElement).toBe(control);
	}
	expect(preview.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

	// red on the remove alone, its glyph included; the replace glyph is not.
	expect(remove.className).toMatch(/text-destructive/);
	expect(glyph.className).not.toMatch(/destructive/);
	expect([...card.querySelectorAll<HTMLElement>('[class*=text-destructive]')]).toEqual([remove]);

	// pressing the picture still opens the picker.
	await fireEvent.click(preview);
	await waitFor(() => expect(host.openImage).toHaveBeenCalledOnce());

	// pressing remove asks, and takes nothing yet.
	await fireEvent.click(remove);

	const dialog = await screen.findByRole('dialog');

	expect(dialog.textContent).toContain(en.organization.mark.removeDescription);
	expect(host.markClear).not.toHaveBeenCalled();
});

test('with no stamp the replace glyph stands alone, and there is no remove', async () => {
	host.markGet.mockResolvedValue(null);
	shown(true);

	const card = await waitFor(() => {
		const found = document.querySelector<HTMLElement>('[data-organization-mark]');

		expect(found?.querySelector('[data-organization-mark-none]')).not.toBeNull();

		return found!;
	});

	expect(within(card).getByRole('button', { name: en.organization.mark.choose })).not.toBeNull();
	expect(card.querySelectorAll('[data-organization-mark-corner]')).toHaveLength(1);
	expect(card.querySelector('[data-organization-mark-corner=remove]')).toBeNull();
	expect(within(card).queryByRole('button', { name: en.organization.mark.removeTitle })).toBeNull();
});
