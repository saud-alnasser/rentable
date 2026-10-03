<script lang="ts">
	import ConfirmDialog from '@rentable/design/block/confirm-dialog.svelte';
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { tone } from '@rentable/design/tone.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useDisconnect } from '$lib/organization/setup/query';
	import Link2OffIcon from '@lucide/svelte/icons/link-2-off';

	/**
	 * Giving the Turso account back, from the machine that holds it: an ending row of the owner's
	 * leaving card (`organization/component/leaving.svelte`), after the transfer and before the
	 * disconnect.
	 *
	 * **It forgets a token and nothing else** (requirement 14 of effort 826). The organization,
	 * its workspaces and everything in them stay where they are; what goes is this machine's
	 * authority over the account, so it stops being able to create a workspace, delete one, lock
	 * anybody out or renew credentials until the consent is granted again. Disconnecting the
	 * machine from the organization is the leaving group's act and is a different one.
	 *
	 * **An act that ends something, so an ending row of its card, its button alone in the error
	 * tone** (effort 846, requirements 2 and 13). The row's name is the act, and labels the button,
	 * whose own word is the verb alone and carries no glyph: the row's glyph says what it is about,
	 * and a button repeating it says it twice (ticket 38). The line under the name is what it
	 * forgets. *It was the last row of a Turso account card of its own until ticket 38.*
	 *
	 * **It asks once, and the question says what forgetting does not do.** The grant stays granted
	 * on Turso's side: their authorization server advertises no revocation endpoint, so a surface
	 * that said "disconnected" and stopped there would be telling somebody they were safe when
	 * they were not. The sentence names Turso's own dashboard, and `i18n/tests/organization.test.ts`
	 * pins it in both locales.
	 */
	const disconnect = useDisconnect();

	let confirming = $state(false);
</script>

{#snippet consequence()}
	<span data-leaving-consequence>
		{$LL.organization.dashboard.forgetAccountDescription()}
	</span>
{/snippet}

<SettingsRow
	icon={Link2OffIcon}
	name={$LL.organization.dashboard.forgetAccount()}
	tone="error"
	meta={consequence}
>
	{#snippet control({ labelId })}
		<Button
			type="button"
			variant="ghost"
			size="sm"
			class="{tone({ tone: 'error' }).text()} hover:bg-destructive/10 hover:text-destructive"
			aria-labelledby={labelId}
			data-forget-account-open
			onclick={() => {
				confirming = true;
			}}
		>
			{$LL.organization.dashboard.forget()}
		</Button>
	{/snippet}
</SettingsRow>

<ConfirmDialog
	open={confirming}
	onOpenChange={(value) => {
		confirming = value;
	}}
	onSubmit={async () => {
		await disconnect.mutateAsync();
	}}
	record={$LL.organization.dashboard.authorityTitle()}
	title={$LL.organization.dashboard.forgetAccount()}
	description={$LL.organization.dashboard.forgetAccountRevokes()}
	confirmLabel={$LL.organization.dashboard.forgetAccount()}
	confirmLoadingLabel={$LL.common.actions.working()}
/>
