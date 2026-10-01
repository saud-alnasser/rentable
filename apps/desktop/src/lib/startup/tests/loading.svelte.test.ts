import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import StartupLoading from '$lib/startup/component/loading.svelte';
import { noteMigration } from '$lib/startup/migration-notice.svelte';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import WayInSurface from '@rentable/design/block/way-in-surface.svelte';
import { DesignProvider } from '@rentable/design/strings.js';

/**
 * THE LOADING SCREEN, WHILE A WORKSPACE IS UPGRADED
 *
 * Requirement 20's last criterion: a member watching a migration run sees that it is running.
 * The bar is the whole of the screen on an ordinary launch; while a workspace is being brought
 * up to this build's schema, by this client or by another member whose lease it waits on, a
 * sentence under the stage says so, in both locales, and goes away when it is done.
 */

/** the loading, under the string contract the way-in surface reads. */
const draw = () =>
	render(
		StartupLoading,
		{},
		{ wrapper: DesignProvider, wrapperProps: { strings, direction: 'ltr' } }
	);

test('an ordinary launch draws the bar and nothing about an upgrade', () => {
	loadLocale('en');
	setLocale('en');
	noteMigration({ workspaceId: 'ws-1', phase: 'done' });
	draw();

	expect(document.querySelector('[data-startup-migration]')).toBeNull();
});

test('a client applying the migration says so under the stage', () => {
	loadLocale('en');
	setLocale('en');
	noteMigration({ workspaceId: 'ws-1', phase: 'applying', from: 4, to: 5 });
	draw();

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
	draw();

	const note = document.querySelector('[data-startup-migration]');

	expect(note).not.toBeNull();
	expect(note?.textContent).toContain(en.layout.startup.migrationWaiting.split('{until}')[0]);
});

test('and in arabic', () => {
	loadLocale('ar');
	setLocale('ar');
	noteMigration({ workspaceId: 'ws-1', phase: 'applying', from: 4, to: 5 });
	draw();

	expect(screen.getByText(ar.layout.startup.migrationApplying)).toBeDefined();
});

// effort 843, requirement 9 (ticket 08): the loading is the way in's last step. Its mark is the
// way-in surface's, in the same column, and the bar is in the column where a step's controls go;
// it asks nothing, so it has no title.
test('the loading draws the mark and the bar in the way-in column, in the middle of the window', () => {
	loadLocale('en');
	setLocale('en');

	const loading = draw();
	const mark = loading.container.querySelector('[data-way-in-mark]');
	const column = mark?.parentElement;
	const bar = loading.container.querySelector('[data-startup-loading]');

	expect(mark).not.toBeNull();
	expect(
		bar?.querySelector('[data-slot=progress]') ?? bar?.querySelector('[role=progressbar]')
	).not.toBeNull();
	expect(column?.contains(bar!)).toBe(true);
	expect(loading.container.querySelector('[data-way-in-title]')).toBeNull();

	const markClass = mark?.className;
	const columnClass = column?.className;

	loading.unmount();

	// a step of the way in, drawn on the same surface, for the comparison.
	const step = render(
		WayInSurface,
		{ step: 'one', title: 'a step' },
		{ wrapper: DesignProvider, wrapperProps: { strings, direction: 'ltr' } }
	);
	const stepMark = step.container.querySelector('[data-way-in-mark]');

	expect(stepMark?.className).toBe(markClass);

	// the same column, one measure wide, which the loading sits in the middle of the window and a
	// step places from the top (at the human's word on 2026-10-01).
	const stepColumn = stepMark?.parentElement?.className ?? '';

	for (const shared of ['mx-auto', 'max-w-sm', 'px-4']) {
		expect(columnClass, shared).toContain(shared);
		expect(stepColumn, shared).toContain(shared);
	}

	expect(columnClass).toContain('justify-center');
	expect(columnClass).not.toContain('pt-[max(5rem,20vh)]');
	expect(stepColumn).toContain('pt-[max(5rem,20vh)]');
});
