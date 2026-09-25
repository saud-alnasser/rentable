import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import ar from '$lib/i18n/ar';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import StartupRecovery from '$lib/layout/component/startup-recovery.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import QueryProviders from '#tests/query-providers.svelte';

import { fakeRecovery } from './testing.ts';

// the screen's corner actions draw tooltips, whose root reads the provider the layout nests.
const recoveryScreen = (updateError: string | null) =>
	render(
		StartupRecovery,
		{ recovery: fakeRecovery({ status: 'pending', updateError }), onRetry: () => {} },
		{ wrapper: QueryProviders, wrapperProps: { strings, direction: 'rtl' } }
	);

/**
 * THE RECOVERY SCREEN, WHERE AN UPDATE SAID WHY IT FAILED
 *
 * Effort 832, requirement 23: what the updater said is English whatever the reader's language. It
 * carries no code to read a sentence from, so the screen says the generic sentence and keeps the
 * updater's words behind details, closed.
 */

test('in arabic, the update error reads as the arabic sentence and the english is behind details', async () => {
	loadLocale('ar');
	setLocale('ar');

	const english = 'failed to move the new binary into place: access is denied';

	recoveryScreen(english);

	expect(document.querySelector('[data-update-error]')?.textContent?.trim()).toBe(
		ar.common.messages.unexpectedError
	);
	expect(document.body.textContent).not.toContain(english);

	await fireEvent.click(
		document.querySelector<HTMLButtonElement>('[data-error-detail="update"] button')!
	);

	await waitFor(() => {
		expect(document.querySelector('[data-error-detail-text="update"]')?.textContent?.trim()).toBe(
			english
		);
	});

	setLocale('en');
});

test('a recovery with no update error says nothing about one', () => {
	loadLocale('ar');
	setLocale('ar');

	recoveryScreen(null);

	expect(document.querySelector('[data-update-error]')).toBeNull();
	expect(document.querySelector('[data-error-detail="update"]')).toBeNull();

	setLocale('en');
});
