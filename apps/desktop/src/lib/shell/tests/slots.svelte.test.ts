import { expect, test } from 'vitest';

import { slotsAt } from '$lib/app/surfaces';
import OrganizationDialogs from '$lib/organization/component/dialogs.svelte';
import OrganizationLockedNotice from '$lib/organization/component/locked-notice.svelte';
import OrganizationRailRow from '$lib/organization/component/rail-row.svelte';
import OrganizationReadOnlyNotice from '$lib/organization/component/read-only-notice.svelte';
import WorkspaceRailRow from '$lib/workspace/component/rail-row.svelte';

/**
 * THE SHELL'S PLACES, AS THE SURFACES FILL THEM
 *
 * Ticket 32 of effort 840: the shell holds only the shell, and what a feature draws in it reaches
 * it as a slot. The rail draws the workspace's row at its top and the account's at its foot, and
 * the root layout draws the organization's dialogs beside the frame, each read off
 * `app/surfaces.ts`. One contribution at each place is what the shell drew when it named them, so
 * a second one, or none, would change the window.
 */

test('the top of the rail is the workspace row', () => {
	expect(slotsAt('workspace-menu')).toEqual([WorkspaceRailRow]);
});

test('the foot of the rail is the account row', () => {
	expect(slotsAt('account-menu')).toEqual([OrganizationRailRow]);
});

test('beside the frame are the organization dialogs', () => {
	expect(slotsAt('dialogs')).toEqual([OrganizationDialogs]);
});

// the read-only notice joined the lock with effort 857 (ticket 12): a newer rentable upgraded what
// is open past what this one writes.
test('above every screen are the locked notice and the read-only notice', () => {
	expect(slotsAt('notice')).toEqual([OrganizationLockedNotice, OrganizationReadOnlyNotice]);
});
