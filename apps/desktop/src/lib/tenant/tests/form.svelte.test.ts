import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeAll, expect, test } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import TenantForm from '$lib/tenant/component/form.svelte';
import Providers from './providers.svelte';

/**
 * THE TENANT FORM, SUBMITTED INVALID
 *
 * Criterion 10(b) of effort 832: submitting an invalid form puts focus on its first invalid
 * field, so the reader lands on what to fix instead of hunting for the mark.
 *
 * The submit is a real one. Every form on the shared surface submits through superforms with
 * `applyAction` off (`design/form.ts`, `surfaceForm`), so a refused submit settles in the form
 * itself and never reaches SvelteKit's router, which this runner has none of.
 */

const noop = () => {};

// jsdom lays nothing out and has no `scrollIntoView`, which the submit calls to bring the field
// into view before focusing it. A no-op stands in; where the field lands is not what is asserted.
beforeAll(() => {
	Element.prototype.scrollIntoView ??= () => {};
});

test('submitting an invalid tenant form focuses its first invalid field', async () => {
	loadLocale('en');
	setLocale('en');

	render(
		TenantForm,
		{ open: true, onOpenChange: noop },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

	const form = document.querySelector<HTMLFormElement>('[data-slot=form-surface] form')!;
	const name = screen.getByPlaceholderText(en.common.labels.name);
	const nationalId = screen.getByPlaceholderText(en.common.labels.nationalId);

	// a name and nothing else: the name passes, so the first invalid field is the one after it,
	// and focus has to move there rather than stay where the surface opened it.
	await fireEvent.input(name, { target: { value: 'Sami' } });
	name.focus();

	await fireEvent.submit(form);

	await waitFor(() => {
		expect(nationalId.getAttribute('aria-invalid')).toBe('true');
		expect(document.activeElement).toBe(nationalId);
	});

	// the first of them, in the order the reader meets them.
	const invalid = form.querySelectorAll('[aria-invalid=true]');

	expect(invalid.length).toBeGreaterThan(1);
	expect(invalid[0]).toBe(nationalId);
	expect(name.getAttribute('aria-invalid')).toBeNull();
});
