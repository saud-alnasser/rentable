import {
	Breadcrumb,
	BreadcrumbEllipsis,
	BreadcrumbSeparator
} from '#lib/primitive/breadcrumb/index.js';
import { DesignProvider } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

/**
 * The two strings a breadcrumb renders, and neither of them is visible.
 *
 * One is the accessible name of the trail itself and the other is what its ellipsis stands for,
 * so a breadcrumb that lost both looks exactly the same on screen and tells a reader who cannot
 * see it nothing at all. That is the whole reason these are covered by a test rather than by
 * opening the application: the failure is invisible on the machine doing the work.
 *
 * The words asserted are supplied by the test rather than read from a locale, which is what
 * makes a hard-coded English string in the component fail here instead of passing by
 * coincidence. `#tests/contract-strings.js` says why every other key is a placeholder.
 */
test('the trail is named by the string the contract supplied', () => {
	render(
		Breadcrumb,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: suppliedStrings({ breadcrumb: 'مسار التنقل' }), direction: 'rtl' }
		}
	);

	expect(screen.getByRole('navigation').getAttribute('aria-label')).toBe('مسار التنقل');
});

test('the ellipsis says what it stands for in the words the contract supplied', () => {
	render(
		BreadcrumbEllipsis,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: suppliedStrings({ more: 'المزيد' }), direction: 'rtl' }
		}
	);

	expect(screen.getByText('المزيد')).toBeTruthy();
});

/**
 * The separator points the way the trail reads, which in Arabic is leftwards.
 *
 * It is on the mirror list in `[[rules/frontend]]` *i18n*: a sequence chevron, drawn as
 * `chevron-right` and turned round under `rtl`. jsdom applies no stylesheet, so the turn itself is
 * not observable here; what is asserted is that the glyph drawn is the one the list names and that
 * it carries the class the stylesheet turns round, under an ancestor that is `rtl`. The rendered
 * turn was checked in the webview's engine against the built stylesheet when ticket 29 of effort
 * 832 was written: the walk's screenshot, read at its own pixels, already pointed left.
 */
test('the separator is the sequence chevron, turned round under rtl', () => {
	document.body.dir = 'rtl';

	try {
		const { container } = render(
			BreadcrumbSeparator,
			{},
			{
				wrapper: DesignProvider,
				wrapperProps: { strings: suppliedStrings(), direction: 'rtl' }
			}
		);

		const glyph = container.querySelector('[data-slot="breadcrumb-separator"] svg');

		expect(glyph?.classList.contains('lucide-chevron-right')).toBe(true);
		expect(glyph?.classList.contains('rtl:rotate-180')).toBe(true);
		expect(glyph?.closest('[dir="rtl"]')).toBe(document.body);
	} finally {
		document.body.dir = '';
	}
});
