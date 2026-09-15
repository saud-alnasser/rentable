<script lang="ts">
	import DeleteDialog from '@rentable/design/block/delete-dialog.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import LaptopIcon from '@lucide/svelte/icons/laptop';

	/**
	 * Signing yourself out of every other machine, from the you section (effort 826, requirement
	 * 22).
	 *
	 * **This machine stays signed in, and nothing asks for the password.** What ends is the other
	 * machines' sessions and the keys they were staying signed in with: one still running meets
	 * the wall at its next sync heartbeat, one that is closed at its next launch. The password
	 * itself is untouched, which is what makes this a different act from a reset and why the line
	 * under the control says so.
	 *
	 * **It asks once before it runs.** Nothing here is recoverable by the person on the other
	 * machine except by signing in again, and a lost laptop is the case it is for, so the question
	 * is the destructive confirm every other loss in the application uses, worded for this act:
	 * the organization leads as the record, the line says what ends and what does not, and the
	 * control carries the verb. A refusal the handler throws is shown inside the dialog, so the
	 * person is still standing at the question when they read it.
	 *
	 * It sits beside the change-password form, under a heading of its own, because the two are
	 * the same subject from opposite ends: one changes what opens the account, the other closes
	 * what is already open.
	 */
	let {
		organizationName,
		onEndOtherSessions
	}: {
		/** the organization the confirm names, so the question is about this one and no other. */
		organizationName: string;
		/** end the other machines' sessions; rejects with what the shared handler has said. */
		onEndOtherSessions: () => Promise<void>;
	} = $props();

	let confirming = $state(false);
</script>

<Field.Field orientation="vertical" data-end-other-sessions>
	<Field.Content>
		<Field.Description>{$LL.settings.you.sessions.description()}</Field.Description>
	</Field.Content>

	<div>
		<!-- the verb's glyph before its label; outline rather than solid, since the act is offered
		     and never invited. -->
		<Button
			type="button"
			variant="outline"
			data-end-other-sessions-open
			onclick={() => {
				confirming = true;
			}}
		>
			<LaptopIcon class="size-4" />
			{$LL.settings.you.sessions.action()}
		</Button>
	</div>
</Field.Field>

<DeleteDialog
	open={confirming}
	onOpenChange={(open) => {
		confirming = open;
	}}
	onSubmit={onEndOtherSessions}
	record={organizationName}
	title={$LL.settings.you.sessions.action()}
	description={$LL.settings.you.sessions.confirmDescription()}
	confirmLabel={$LL.settings.you.sessions.action()}
	confirmLoadingLabel={$LL.common.actions.working()}
/>
