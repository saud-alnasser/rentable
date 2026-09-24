import Empty from '#lib/block/empty.svelte';
import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { expect, test } from 'vitest';

/**
 * The one treatment for a region with nothing to show.
 *
 * The block reads nothing from the string contract, so it renders without a provider: every word
 * is the caller's. What it owns is the arrangement and the mark saying which situation it is, and
 * the mark is what the list's and the record surface's own tests read.
 */
const act = createRawSnippet(() => ({
	render: () => '<button type="button">add a tenant</button>'
}));

test('it says what it was handed, under the kind it was given', () => {
	const { container } = render(Empty, {
		kind: 'nothing-yet',
		title: 'no tenants yet',
		description: 'tenants you add are listed here.'
	});

	const region = container.querySelector('[data-empty]');

	expect(region?.getAttribute('data-empty')).toBe('nothing-yet');
	expect(region?.textContent).toContain('no tenants yet');
	expect(region?.textContent).toContain('tenants you add are listed here.');
});

test('its one act is drawn beneath the words', () => {
	const { getByRole } = render(Empty, {
		kind: 'nothing-yet',
		title: 'no tenants yet',
		action: act
	});

	expect(getByRole('button', { name: 'add a tenant' })).toBeDefined();
});

test('with no act and no line, it draws the title alone', () => {
	const { container } = render(Empty, { kind: 'no-match', title: 'nothing matches' });

	expect(container.querySelector('button')).toBeNull();
	expect(container.querySelector('[data-slot="empty-description"]')).toBeNull();
	expect(container.querySelector('[data-slot="empty-title"]')?.textContent).toBe('nothing matches');
});

// ticket 33 of effort 832: the title is a heading and is raised to sentence case; the line under it
// is a description, and reads as written, in lower case, as every description does
// ([[rules/frontend]], *i18n*).
test('the title is raised to sentence case, and the line under it reads as written', () => {
	const { container } = render(Empty, {
		kind: 'not-found',
		title: 'this record does not exist',
		description: 'it may have been deleted.'
	});

	const title = container.querySelector('[data-slot="empty-title"]');
	const description = container.querySelector('[data-slot="empty-description"]');

	expect(title?.className).toContain('first-letter:uppercase');
	expect(description?.className).not.toMatch(/uppercase|capitalize/);
});
