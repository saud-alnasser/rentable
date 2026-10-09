import Empty from '#lib/block/empty.svelte';
import { DesignProvider, type DesignStrings } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet, type ComponentProps } from 'svelte';
import { expect, test, vi } from 'vitest';

/**
 * The one treatment for a region with nothing to show.
 *
 * Three of its four kinds take every word from the caller; the failed kind takes its words from
 * the string contract, since a read that failed reads the same wherever it fails. So it renders
 * under the provider, and the words a test asserts are the ones it supplied. What the block owns
 * is the arrangement and the mark saying which situation it is, and the mark is what the list's
 * and the record surface's own tests read.
 */
const act = createRawSnippet(() => ({
	render: () => '<button type="button">add a tenant</button>'
}));

const empty = (props: ComponentProps<typeof Empty>, strings: Partial<DesignStrings> = {}) =>
	render(Empty, props, {
		wrapper: DesignProvider,
		wrapperProps: { strings: suppliedStrings(strings), direction: 'ltr' }
	});

test('it says what it was handed, under the kind it was given', () => {
	const { container } = empty({
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
	const { getByRole } = empty({
		kind: 'nothing-yet',
		title: 'no tenants yet',
		action: act
	});

	expect(getByRole('button', { name: 'add a tenant' })).toBeDefined();
});

test('with no act and no line, it draws the title alone', () => {
	const { container } = empty({ kind: 'no-match', title: 'nothing matches' });

	expect(container.querySelector('button')).toBeNull();
	expect(container.querySelector('[data-slot="empty-description"]')).toBeNull();
	expect(container.querySelector('[data-slot="empty-title"]')?.textContent).toBe('nothing matches');
});

// ticket 33 of effort 832: the title is a heading and is raised to sentence case; the line under it
// is a description, and reads as written, in lower case, as every description does
// ([[rules/frontend]], *i18n*).
test('the title is raised to sentence case, and the line under it reads as written', () => {
	const { container } = empty({
		kind: 'not-found',
		title: 'this record does not exist',
		description: 'it may have been deleted.'
	});

	const title = container.querySelector('[data-slot="empty-title"]');
	const description = container.querySelector('[data-slot="empty-description"]');

	expect(title?.className).toContain('first-letter:uppercase');
	expect(description?.className).not.toMatch(/uppercase|capitalize/);
});

// ticket 03 of effort 861: a read that failed is not a set with nothing in it. It says so, in the
// contract's words, and its one act runs the read again ([[rules/interface]], *Empty* and *Error*).
const FAILED = {
	readFailed: 'this could not be read',
	readFailedDescription: 'something went wrong while reading it.',
	tryAgain: 'try again'
};

test('a failed read is marked failed and says so in the words the contract gives it', () => {
	const { container } = empty({ kind: 'failed', onRetry: () => {} }, FAILED);

	const region = container.querySelector('[data-empty]');

	expect(region?.getAttribute('data-empty')).toBe('failed');
	expect(region?.querySelector('[data-slot="empty-title"]')?.textContent).toBe(FAILED.readFailed);
	expect(region?.textContent).toContain(FAILED.readFailedDescription);
});

test('its one act is try again, and pressing it asks for the read again', () => {
	const onRetry = vi.fn();

	empty({ kind: 'failed', onRetry }, FAILED);

	const buttons = screen.getAllByRole('button');

	expect(buttons).toHaveLength(1);

	screen.getByRole('button', { name: FAILED.tryAgain }).click();

	expect(onRetry).toHaveBeenCalledOnce();
});
