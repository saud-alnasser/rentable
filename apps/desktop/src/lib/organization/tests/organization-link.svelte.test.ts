import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import OrganizationLink from '$lib/organization/component/organization-link.svelte';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import QueryProviders from './query-providers.svelte';

/**
 * THE LINK SECTION, RENDERED
 *
 * Requirement 25 of the redesign: the sentence under the organization's link says that the
 * link plus a username and a password is how a person gets in, in both locales. The link
 * itself is the owner's query, which this runner cannot answer, so the section is rendered for
 * a reader who is not the owner: the query stays disabled and the sentence is what is drawn.
 * The pending accounts title is the page's own string and is read in
 * `i18n/tests/organization.test.ts` beside this sentence, since routes are not rendered here.
 */

const section = (direction: 'ltr' | 'rtl') =>
	render(
		OrganizationLink,
		{ isOwner: false },
		{ wrapper: QueryProviders, wrapperProps: { strings, direction } }
	);

const sentence = () => document.querySelector('[data-link-description]')?.textContent?.trim();

test('the sentence says the link with a username and a password is the way in', () => {
	loadLocale('en');
	setLocale('en');
	section('ltr');

	expect(sentence()).toBe(en.organization.dashboard.linkDescription);
	expect(sentence()).toMatch(/username/);
	expect(sentence()).toMatch(/password/);
	expect(sentence()).toMatch(/way in/);
	// nothing says the link restores anything: a link connects, and a sign-in admits.
	expect(sentence()).not.toMatch(/restore/);
	expect(screen.queryByRole('button', { name: en.organization.setup.copyLink })).toBeNull();
});

test('and in arabic, written rather than copied', () => {
	loadLocale('ar');
	setLocale('ar');
	section('rtl');

	expect(sentence()).toBe(ar.organization.dashboard.linkDescription);
	expect(sentence()).toMatch(/اسم مستخدم/);
	expect(sentence()).toMatch(/كلمة مرور/);
	expect(ar.organization.dashboard.linkDescription).not.toBe(
		en.organization.dashboard.linkDescription
	);

	setLocale('en');
});
