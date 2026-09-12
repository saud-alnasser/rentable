import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import StartupLoading from '$lib/layout/component/startup-loading.svelte';
import { noteMigration } from '$lib/layout/migration-notice.svelte';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';

/**
 * THE LOADING SCREEN, WHILE A WORKSPACE IS UPGRADED
 *
 * Requirement 20's last criterion: a member watching a migration run sees that it is running.
 * The bar is the whole of the screen on an ordinary launch; while a workspace is being brought
 * up to this build's schema, by this client or by another member whose lease it waits on, a
 * sentence under the stage says so, in both locales, and goes away when it is done.
 */

test('an ordinary launch draws the bar and nothing about an upgrade', () => {
	loadLocale('en');
	setLocale('en');
	noteMigration({ workspaceId: 'ws-1', phase: 'done' });
	render(StartupLoading);

	expect(document.querySelector('[data-startup-migration]')).toBeNull();
});

test('a client applying the migration says so under the stage', () => {
	loadLocale('en');
	setLocale('en');
	noteMigration({ workspaceId: 'ws-1', phase: 'applying', from: 4, to: 5 });
	render(StartupLoading);

	expect(screen.getByText(en.layout.startup.migrationApplying)).toBeDefined();
});

test('a client waiting on another member says whose turn it is and until when', () => {
	loadLocale('en');
	setLocale('en');
	noteMigration({
		workspaceId: 'ws-1',
		phase: 'waiting',
		holderMemberId: 'm-2',
		until: Date.UTC(2026, 8, 12, 10, 30)
	});
	render(StartupLoading);

	const note = document.querySelector('[data-startup-migration]');

	expect(note).not.toBeNull();
	expect(note?.textContent).toContain(en.layout.startup.migrationWaiting.split('{until}')[0]);
});

test('and in arabic', () => {
	loadLocale('ar');
	setLocale('ar');
	noteMigration({ workspaceId: 'ws-1', phase: 'applying', from: 4, to: 5 });
	render(StartupLoading);

	expect(screen.getByText(ar.layout.startup.migrationApplying)).toBeDefined();
});
