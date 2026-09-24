<script lang="ts">
	import ConfirmDialog from '@rentable/design/block/confirm-dialog.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';

	/**
	 * The one question before this machine forgets the organization it holds.
	 *
	 * **It asks once, and the asking is the screen's** (requirement 20 of the redesign): the host's
	 * `organization.disconnect` deletes every organization and workspace replica on this machine,
	 * empties the record and clears the Turso authority without asking anything, so whichever
	 * surface offers the act puts this in front of it. The wall offers it while signed out, and the
	 * organization page offers it while signed in; both mount this and neither asks twice.
	 *
	 * **It is the design package's confirm dialog, named for this act** rather than the delete
	 * dialog, because disconnecting is not a delete ([[rules/interface]], *Delete and confirm*):
	 * the title and the control are the act's verb, the organization leads the sentence as the
	 * record being acted on, the line under it says what the machine loses and what Turso keeps,
	 * and the destructive control carries the verb. The handler is awaited before the dialog
	 * closes, and a refusal it throws is shown inside the dialog, so the person is still standing
	 * at the question when they read it.
	 */
	let {
		open,
		onOpenChange,
		organizationName,
		onDisconnect
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** the held organization, named so the question is about this one and no other. */
		organizationName: string;
		/** the act itself, awaited; throwing keeps the dialog open with the refusal in it. */
		onDisconnect: () => Promise<void> | void;
	} = $props();
</script>

<ConfirmDialog
	{open}
	{onOpenChange}
	onSubmit={onDisconnect}
	record={organizationName}
	title={$LL.layout.signIn.disconnect()}
	description={$LL.layout.signIn.disconnectDescription()}
	confirmLabel={$LL.layout.signIn.disconnect()}
	confirmLoadingLabel={$LL.common.actions.working()}
/>
