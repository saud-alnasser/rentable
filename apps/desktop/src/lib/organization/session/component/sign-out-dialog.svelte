<script lang="ts">
	import ConfirmDialog from '@rentable/design/block/confirm-dialog.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { requestSignOut } from '$lib/sync';

	/**
	 * The question signing this machine out asks first, from wherever it is asked for: the account
	 * section's last card and the account menu at the foot of the rail.
	 *
	 * **It asks, though signing in undoes it** (effort 846, requirement 2 as revised 2026-10-02, at
	 * the human's word: every dangerous act has a confirmation). It names who is signed out, says
	 * the organization stays on this machine, and that signing in again brings them back. Once
	 * answered it asks the shell, which owns the wall, exactly as the press did before.
	 */
	let {
		open,
		onOpenChange,
		username
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** who is signed in here, which the question names. */
		username: string;
	} = $props();
</script>

<ConfirmDialog
	{open}
	{onOpenChange}
	onSubmit={() => requestSignOut()}
	record={username}
	title={$LL.settings.you.thisMachine.signOut()}
	description={$LL.settings.you.thisMachine.asks()}
	confirmLabel={$LL.common.actions.signOut()}
	confirmLoadingLabel={$LL.common.actions.working()}
/>
