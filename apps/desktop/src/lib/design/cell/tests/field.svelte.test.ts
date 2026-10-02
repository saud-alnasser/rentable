import { render } from '@testing-library/svelte';
import { afterEach, expect, test } from 'vitest';
import * as Cell from '$lib/design/cell/index.ts';
import CalendarIcon from '@lucide/svelte/icons/calendar';

/**
 * A CARD'S TINTED FIELD IS ONE CELL
 *
 * Ticket 41 of effort 846: the member card and the role card each drew the tinted field, and the
 * tenant, complex, contract and workspace cards are to take it too. `Cell.Field` is that field:
 * the glyph and the name, small and muted, over the value in the stronger weight, on the muted
 * tint, every line at the tile's fixed leading.
 */

afterEach(() => {
	document.body.dir = '';
});

const show = (props: Record<string, unknown> = {}) =>
	render(Cell.Field, { icon: CalendarIcon, name: 'Joined', value: 'Oct 3, 2026', ...props });

const parts = (container: HTMLElement) => {
	const field = container.querySelector<HTMLElement>('[data-field]')!;

	return {
		field,
		name: field.querySelector<HTMLElement>('[data-field-name]')!,
		value: field.querySelector<HTMLElement>('[data-field-value]')!
	};
};

test('a field holds its glyph and its name over its value, on the muted tint', () => {
	const { container } = show();
	const { field, name, value } = parts(container);

	expect(name.querySelector('svg')?.classList).toContain('lucide-calendar');
	expect(name.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
	expect(name.textContent?.trim()).toBe('Joined');
	expect(name.classList).toContain('text-xs');
	expect(name.classList).toContain('text-muted-foreground');
	expect(value.textContent?.trim()).toBe('Oct 3, 2026');
	expect(value.classList).toContain('font-medium');
	expect(value.classList).toContain('text-foreground');

	for (const token of ['bg-muted', 'rounded-lg', 'px-3', 'py-2']) {
		expect(field.classList).toContain(token);
	}
	expect(field.classList).not.toContain('border');
	// both lines at the fixed leading, so a card can declare its height in both locales.
	expect(name.classList).toContain('leading-5');
	expect(value.classList).toContain('leading-5');
});

test('a value saying nothing is there is drawn muted', () => {
	const { container } = show({ value: 'not yet', empty: true });
	const { value } = parts(container);

	expect(value.classList).toContain('text-muted-foreground');
	expect(value.classList).not.toContain('text-foreground');
	expect(value.hasAttribute('data-empty')).toBe(true);
});

test('a value that is a state takes its status tone, and nothing else takes one', () => {
	const toned = parts(show({ value: 'overdue', status: 'overdue' }).container);

	expect(toned.value.classList).toContain('text-destructive');

	document.body.innerHTML = '';
	const plain = parts(show().container);

	expect(plain.value.classList).not.toContain('text-destructive');
	expect(plain.value.classList).not.toContain('text-primary');
});

test("a card's own hooks land on the field, its name and its value", () => {
	const { container } = show({
		hook: 'role-field',
		'data-role-field': 'reads',
		valueAttributes: { 'data-held': 'some' }
	});
	const { field, name, value } = parts(container);

	expect(field.getAttribute('data-role-field')).toBe('reads');
	expect(name.hasAttribute('data-role-field-name')).toBe(true);
	expect(value.hasAttribute('data-role-field-value')).toBe(true);
	expect(value.getAttribute('data-held')).toBe('some');
});

test('under rtl the field takes the reader direction, glyph first, with no physical side', () => {
	document.body.dir = 'rtl';

	const { container } = show({ name: 'انضم', value: '٣ أكتوبر ٢٠٢٦' });
	const { field, name, value } = parts(container);

	// the glyph leads the name in source order, so a flex row puts it on the start side, which
	// is the right under rtl; nothing states a direction of its own.
	expect(name.firstElementChild?.tagName.toLowerCase()).toBe('svg');
	expect(name.textContent?.trim()).toBe('انضم');
	expect(value.textContent?.trim()).toBe('٣ أكتوبر ٢٠٢٦');
	expect(field.closest('[dir]')).toBe(document.body);
	expect(field.querySelector('[dir]')).toBe(null);
	for (const element of [field, ...field.querySelectorAll('*')]) {
		expect(element.getAttribute('class') ?? '').not.toMatch(/(^|\s)-?(ml|mr|pl|pr|left|right)-/);
	}
});
