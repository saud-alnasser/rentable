<script lang="ts">
	import ConfirmDialog from '@rentable/design/block/confirm-dialog.svelte';
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { tone } from '@rentable/design/tone.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import LogOutIcon from '@lucide/svelte/icons/log-out';

	/**
	 * Signing yourself out of every other machine, from the account section (effort 826, requirement
	 * 22).
	 *
	 * **This machine stays signed in, and nothing asks for the password.** What ends is the other
	 * machines' sessions and the keys they were staying signed in with: one still running meets
	 * the wall at its next sync heartbeat, one that is closed at its next launch. The password
	 * itself is untouched, which is what makes this a different act from a reset and why the line
	 * under the group says so.
	 *
	 * **A group of its own, whose one row is the act, in the error tone**
	 * ([[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], requirement 2): it signs
	 * somebody out, so it is drawn as the thing that ends something, and it is the last row of its
	 * group because it is the only one. *Effort 846's ticket 09 puts the list of machines above it.*
	 *
	 * **It asks once before it runs**, because it reaches other machines and nobody on them can take
	 * it back but by signing in again. The question is the confirm dialog named for this act rather
	 * than the delete dialog, since nothing is deleted ([[rules/interface]], *Delete and confirm*):
	 * the organization leads as the record, the line says what ends and what does not, and the
	 * control carries the verb. A refusal the handler throws is shown inside the dialog, so the
	 * person is still standing at the question when they read it.
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

<div data-end-other-sessions>
	<SettingsGroup
		title={$LL.settings.you.sessions.title()}
		footer={$LL.settings.you.sessions.description()}
	>
		{#snippet rows()}
			<SettingsRow icon={LogOutIcon} name={$LL.settings.you.sessions.action()} tone="error">
				{#snippet control({ labelId })}
					<!-- labelled by the row's name, which holds the button's own word, so two sign-outs in
					     one section are told apart by what they end. -->
					<Button
						type="button"
						variant="ghost"
						size="sm"
						class="{tone({ tone: 'error' }).text()} hover:bg-destructive/10 hover:text-destructive"
						aria-labelledby={labelId}
						data-end-other-sessions-open
						onclick={() => {
							confirming = true;
						}}
					>
						<LogOutIcon class="size-4" />
						{$LL.common.actions.signOut()}
					</Button>
				{/snippet}
			</SettingsRow>
		{/snippet}
	</SettingsGroup>
</div>

<ConfirmDialog
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
