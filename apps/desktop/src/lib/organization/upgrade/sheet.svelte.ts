import type { UpgradeTarget } from './host';

/**
 * THE UPGRADE SHEET, ASKED FOR IN ONE PLACE AND DRAWN IN ANOTHER
 *
 * The sheet is mounted once, in the organization's host in the frame (`./component/host.svelte`),
 * and opened from the organization's card and from a workspace's card's menu, which share no
 * parent. So what they share is this, module-level rune state the way `../dialogs.svelte.ts` is.
 */
export const upgradeSheet = $state<{
	/** what the sheet is open on, or `null` while it is closed. */
	target: UpgradeTarget | null;
	/** the workspace's name, which the sheet's title says; empty for the organization. */
	name: string;
}>({ target: null, name: '' });

/** open the sheet on `target`, named `name` where it is a workspace. */
export function openUpgrade(target: UpgradeTarget, name = '') {
	upgradeSheet.target = target;
	upgradeSheet.name = name;
}

/** close the sheet, as not yet and a finished run do. */
export function closeUpgrade() {
	upgradeSheet.target = null;
	upgradeSheet.name = '';
}
