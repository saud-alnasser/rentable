import { render } from '@testing-library/svelte';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { setLocale } from '$lib/i18n/i18n-svelte';
import Providers from '#tests/providers.svelte';

/**
 * THE SETTINGS OPENED SIGNED OUT
 *
 * Criterion 7 of effort 843, ticket 03: signed out there is no rail to leave the settings by, so
 * the address draws back in the corner of the way-in frame, and it goes back to the way in. The
 * frame it draws on is `startup/screen.ts`'s `shellFor`, driven by `startup/tests/screen.test.ts`;
 * what is asserted here is the route's half.
 */

const signedIn = vi.hoisted(() => ({ current: false }));

vi.mock('$lib/organization/ui', () => ({ useSignedIn: () => signedIn }));
vi.mock('$lib/startup/ui', () => ({ THE_WAY_IN: '/', useLeaveForTheWall: () => async () => {} }));
vi.mock('$lib/app/surfaces', () => ({ sectionsOn: () => [] }));
// the page itself is settings' and has its own tests; the route's part is what it draws around it.
vi.mock('$lib/settings/component/page.svelte', () => ({ default: () => {} }));

const { default: Page } = await import('../+page.svelte');

beforeAll(() => {
	loadLocale('en');
	setLocale('en');
});

afterEach(() => {
	document.body.innerHTML = '';
});

const draw = () =>
	render(Page, {}, { wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } });

test('signed out, the settings draw back in the corner of the frame', () => {
	signedIn.current = false;
	draw();

	const back = document.querySelector('[data-back-control]');

	expect(back).not.toBeNull();
	expect(back?.closest('.absolute')?.className).toContain('start-4');
	expect(back?.closest('.absolute')?.className).toContain('top-4');
});

test('signed in, the rail is the way out and the settings draw no back of their own', () => {
	signedIn.current = true;
	draw();

	expect(document.querySelector('[data-back-control]')).toBeNull();
});
