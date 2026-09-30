import { render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, expect, test } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import StartupSwitching from '$lib/startup/component/switching.svelte';
import Providers from '#tests/providers.svelte';

/**
 * THE PAGE A SWITCH DRAWS
 *
 * Criterion 12 of effort 843: a switch between workspaces shows progress where the page is, as a
 * page loads, rather than as the application starts. So the screen is the shared loading block's
 * skeleton inside the page frame, naming the workspace being opened, and never the startup bar.
 */

afterEach(() => {
	document.body.innerHTML = '';
});

const opening = (direction: 'ltr' | 'rtl') =>
	render(
		StartupSwitching,
		{ name: 'South' },
		{ wrapper: Providers, wrapperProps: { strings, direction } }
	);

test('a switch draws the loading block with a page shape and the workspace it is opening', async () => {
	loadLocale('en');
	setLocale('en');
	opening('ltr');

	const said = en.layout.startup.switching.replace('{name:string}', 'South');

	// the block's own timing: busy at once, the skeleton after its delay.
	expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
	await waitFor(() => expect(document.querySelector('[data-loading="skeleton"]')).not.toBeNull());

	expect(screen.getByRole('status').textContent).toContain(said);
	expect(screen.getByText(said, { selector: 'p' })).toBeDefined();
	// the page's shape, and nothing of the startup surface: no bar, no stage.
	expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(1);
	expect(document.querySelector('[data-slot="progress"]')).toBeNull();
});

test('and in arabic', async () => {
	loadLocale('ar');
	setLocale('ar');
	opening('rtl');

	const said = ar.layout.startup.switching.replace('{name}', 'South');

	await waitFor(() => expect(document.querySelector('[data-loading="skeleton"]')).not.toBeNull());

	expect(screen.getByRole('status').textContent).toContain(said);
	expect(screen.getByText(said, { selector: 'p' })).toBeDefined();
});
