import SectionSwitch from '#lib/block/section-switch.svelte';
import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

/**
 * The one control a surface's sections are switched with.
 *
 * It takes its own props and draws no tooltip and no string of the contract's, so it renders on
 * its own. What it is for is that every section is a link to its own address, and that exactly
 * one of them says it is the page on screen.
 */
const sections = [
	{ value: 'payments', label: 'payments', href: '/contracts/1' },
	{ value: 'units', label: 'units', href: '/contracts/1?section=units' },
	{ value: 'history', label: 'history', href: '/contracts/1?section=history' }
];

const links = () => [...document.querySelectorAll<HTMLAnchorElement>('[data-section-switch] a')];

test('every section is a link to its own address, in the order given', () => {
	render(SectionSwitch, { sections, current: 'payments', label: 'a record' });

	expect(links().map((link) => link.getAttribute('href'))).toEqual([
		'/contracts/1',
		'/contracts/1?section=units',
		'/contracts/1?section=history'
	]);
	expect(links().map((link) => link.textContent?.trim())).toEqual(['payments', 'units', 'history']);
});

test('the current section is marked, and it is the only one', () => {
	render(SectionSwitch, { sections, current: 'history', label: 'a record' });

	const marked = links().filter((link) => link.getAttribute('aria-current') === 'page');

	expect(marked.map((link) => link.dataset.section)).toEqual(['history']);
});

test('the row is a navigation landmark named for the page whose sections it holds', () => {
	render(SectionSwitch, { sections, current: 'payments', label: 'a record' });

	expect(screen.getByRole('navigation', { name: 'a record' })).toBeDefined();
});

test('a switch replaces the address and keeps the scroll and the focus', () => {
	render(SectionSwitch, { sections, current: 'payments', label: 'a record' });

	for (const link of links()) {
		expect(link.hasAttribute('data-sveltekit-replacestate')).toBe(true);
		expect(link.hasAttribute('data-sveltekit-noscroll')).toBe(true);
		expect(link.hasAttribute('data-sveltekit-keepfocus')).toBe(true);
	}
});
