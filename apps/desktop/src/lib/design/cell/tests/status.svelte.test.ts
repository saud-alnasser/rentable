import { render } from '@testing-library/svelte';
import Providers from '#tests/providers.svelte';
import { layOutLists } from '#tests/permission.ts';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { beforeEach, expect, test } from 'vitest';
import * as Cell from '$lib/design/cell/index.ts';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';

/**
 * A STATUS ON A TILE CARRIES ITS WORD
 *
 * Requirement 19 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]]: on a card
 * in a grid a status reads as an icon and a word. Everywhere else it stays an icon whose word is
 * its accessible name ([[rules/interface]], *Status presentation*), and that form is unchanged.
 */

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	layOutLists();
});

const show = (props: { status: 'active' | 'overdue'; labelled?: boolean }) =>
	render(Cell.Status, props, { wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } });

test('labelled, a status shows its icon and its word, both in its tone', () => {
	const { container } = show({ status: 'overdue', labelled: true });
	const status = container.querySelector<HTMLElement>('[data-status-labelled]');

	expect(status?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
	expect(status?.textContent?.trim()).toBe('overdue');
	// the word is drawn, not kept for a screen reader alone.
	expect(status?.querySelector('.sr-only')).toBe(null);
	expect(status?.classList).toContain('text-destructive');
	// and the description is still a hover or a focus away.
	expect(status?.getAttribute('tabindex')).toBe('0');
});

test('unlabelled, a status is the bare icon, its word for a screen reader alone', () => {
	const { container } = show({ status: 'active' });

	expect(container.querySelector('[data-status-labelled]')).toBe(null);

	const word = container.querySelector('.sr-only');

	expect(word?.textContent).toBe('active');
	expect(word?.parentElement?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
	expect(word?.parentElement?.className).toBe('pointer-events-auto inline-flex shrink-0');
});
