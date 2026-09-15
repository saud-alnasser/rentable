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
 * Requirement 4 of effort 828: the sentence under the organization's link names it as the copy
 * that recovers the organization when every machine is gone, says what it is still worth to
 * whoever finds it, and points anybody connecting another machine of their own at the you
 * section, in both locales. The link itself is the owner's query, which this runner cannot
 * answer, so the section is rendered for a reader who is not the owner: the query stays disabled
 * and the sentence is what is drawn.
 *
 * *It read requirement 25 of effort 826 until then, where this was the link every member was
 * handed to connect a second machine: the sentence said the link plus a username and a password
 * was the way in. That is what put a never-expiring read of the directory in every chat the
 * organization has, and it is the link nobody is handed now.*
 */

const section = (direction: 'ltr' | 'rtl') =>
	render(
		OrganizationLink,
		{ isOwner: false },
		{ wrapper: QueryProviders, wrapperProps: { strings, direction } }
	);

const sentence = () => document.querySelector('[data-link-description]')?.textContent?.trim();

test('the sentence names the recovery copy, what it is worth, and where a member goes instead', () => {
	loadLocale('en');
	setLocale('en');
	section('ltr');

	expect(sentence()).toBe(en.organization.dashboard.linkDescription);
	expect(sentence()).toMatch(/recovers the organization/);
	expect(sentence()).toMatch(/every machine is gone/);
	// what it is still worth to whoever finds it, said beside it rather than only under Risks.
	expect(sentence()).toMatch(/never expires/);
	expect(sentence()).toMatch(/read only/);
	// and where a member connecting another machine of their own goes.
	expect(sentence()).toMatch(/you section/);
	expect(sentence()).toMatch(/username/);
	expect(sentence()).toMatch(/password/);
	expect(screen.queryByRole('button', { name: en.organization.setup.copyLink })).toBeNull();
});

test('and in arabic, written rather than copied', () => {
	loadLocale('ar');
	setLocale('ar');
	section('rtl');

	expect(sentence()).toBe(ar.organization.dashboard.linkDescription);
	expect(sentence()).toMatch(/اسم مستخدم/);
	expect(sentence()).toMatch(/كلمة مرور/);
	expect(sentence()).toMatch(/أنت/);
	expect(ar.organization.dashboard.linkDescription).not.toBe(
		en.organization.dashboard.linkDescription
	);

	setLocale('en');
});
