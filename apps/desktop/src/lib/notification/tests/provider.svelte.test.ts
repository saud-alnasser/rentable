import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, expect, test } from 'vitest';

import { notify } from '$lib/notification';
import { NotificationProvider } from '$lib/notification/ui';
import Providers from '#tests/providers.svelte';
import type { DesignDirection } from '@rentable/design/strings.js';

import { placeholderStrings } from '$lib/design/tests/strings';

/**
 * THE TOASTER STANDS AT THE BOTTOM END, IN EITHER READING DIRECTION
 *
 * Requirement 4 of [[efforts/861-the-app-never-shows-something-false/spec]]: toasts stand
 * bottom-right in English and bottom-left in Arabic. svelte-sonner places a toaster physically
 * and reads the document's direction once, so the packaged toaster takes its side, its direction
 * and its close control's name from the design contract instead (`primitive/sonner/sonner.svelte`).
 *
 * **Why the test is here rather than beside the primitive.** The toaster draws its list only once a
 * toast is up, and a toast is raised through `toast`, which `notification.ts` alone may import
 * (`reach.test.ts` scans the design package too). So the subject is the provider the application
 * mounts, and the toasts are raised the way every surface raises them, through `notify`.
 */

// svelte-sonner subscribes to the system appearance whatever theme it is handed, and jsdom has no
// `matchMedia` to subscribe to.
beforeEach(() => {
	window.matchMedia = ((query: string) => ({
		matches: false,
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {}
	})) as unknown as typeof window.matchMedia;
});

afterEach(() => {
	document.body.innerHTML = '';
});

async function raised(direction: DesignDirection, raise: () => void) {
	render(
		NotificationProvider,
		{},
		{
			wrapper: Providers,
			wrapperProps: { strings: placeholderStrings, direction }
		}
	);

	raise();
	await tick();

	return document.querySelector<HTMLElement>('[data-sonner-toaster]');
}

test('in a left-to-right reading the toaster stands at the bottom right', async () => {
	const toaster = await raised('ltr', () => notify.success('saved.'));

	expect(toaster?.dataset.yPosition).toBe('bottom');
	expect(toaster?.dataset.xPosition).toBe('right');
	expect(toaster?.getAttribute('dir')).toBe('ltr');
});

test('in a right-to-left reading the toaster stands at the bottom left', async () => {
	const toaster = await raised('rtl', () => notify.success('saved.'));

	expect(toaster?.dataset.yPosition).toBe('bottom');
	expect(toaster?.dataset.xPosition).toBe('left');
	expect(toaster?.getAttribute('dir')).toBe('rtl');
});

test('an error toast carries a close control named from the design contract', async () => {
	const toaster = await raised('rtl', () => notify.error('the payment could not be saved.'));

	const toast = [...(toaster?.querySelectorAll<HTMLElement>('[data-sonner-toast]') ?? [])].find(
		(item) => item.textContent?.includes('the payment could not be saved.')
	);

	expect(toast?.querySelector('[data-close-button]')?.getAttribute('aria-label')).toBe('{close}');
});

test('a success toast carries no close control, since it leaves on its own', async () => {
	const toaster = await raised('ltr', () => notify.success('the file was written.'));

	const toast = [...(toaster?.querySelectorAll<HTMLElement>('[data-sonner-toast]') ?? [])].find(
		(item) => item.textContent?.includes('the file was written.')
	);

	expect(toast).toBeDefined();
	expect(toast?.querySelector('[data-close-button]')).toBeNull();
});
