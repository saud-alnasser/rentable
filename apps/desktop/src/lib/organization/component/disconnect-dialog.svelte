<script lang="ts">
	import ConfirmDialog from '@rentable/design/block/confirm-dialog.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';

	/**
	 * The one question before this machine forgets one organization it holds.
	 *
	 * **It asks once, and the asking is the screen's** (requirement 20 of the redesign): the host's
	 * `organization.disconnect` and `organization.remove` delete that organization's replica and
	 * its workspaces' replicas, forget its entry and clear its Turso consent without asking
	 * anything, so whichever surface offers the act puts this in front of it. The switcher's x
	 * offers it for any held organization (effort 851, requirement 5), and the organization page
	 * offers it for the open one; each mounts this and neither asks twice.
	 *
	 * **The Turso account is said to go only where it does** (effort 851, criterion 5): each
	 * organization keeps its own consent, so the clause is drawn where this machine holds the named
	 * organization's and left out where it does not, since it would be false.
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
		forgetsTurso = true,
		onDisconnect
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** the organization being let go of, named so the question is about this one and no other. */
		organizationName: string;
		/** whether this machine holds the organization's Turso consent, which the line then says goes. */
		forgetsTurso?: boolean;
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
	description={forgetsTurso
		? $LL.layout.signIn.disconnectDescription()
		: $LL.layout.signIn.disconnectDescriptionNoTurso()}
	confirmLabel={$LL.layout.signIn.disconnect()}
	confirmLoadingLabel={$LL.common.actions.working()}
/>
