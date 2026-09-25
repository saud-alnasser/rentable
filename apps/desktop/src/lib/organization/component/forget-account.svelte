<script lang="ts">
	import ConfirmDialog from '@rentable/design/block/confirm-dialog.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useDisconnect } from '$lib/organization/query';
	import UnplugIcon from '@lucide/svelte/icons/unplug';

	/**
	 * Giving the Turso account back, from the machine that holds it.
	 *
	 * **It forgets a token and nothing else** (requirement 14 of effort 826). The organization,
	 * its workspaces and everything in them stay where they are; what goes is this machine's
	 * authority over the account, so it stops being able to create a workspace, delete one, lock
	 * anybody out or renew credentials until the consent is granted again. Disconnecting the
	 * machine from the organization is the control below this one and is a different act.
	 *
	 * **It asks once, and the question says what forgetting does not do.** The grant stays granted
	 * on Turso's side: their authorization server advertises no revocation endpoint, so a surface
	 * that said "disconnected" and stopped there would be telling somebody they were safe when
	 * they were not. The sentence names Turso's own dashboard, and `i18n/tests/organization.test.ts`
	 * pins it in both locales.
	 *
	 * **Only the owner holding the authority is offered it**, which the area decides: for an owner
	 * whose machine holds none, the same legend carries the reconnect instead.
	 */
	const disconnect = useDisconnect();

	let confirming = $state(false);
</script>

<Field.Field orientation="vertical" data-forget-account>
	<Field.Content>
		<Field.Description>{$LL.organization.dashboard.forgetAccountDescription()}</Field.Description>
	</Field.Content>

	<div>
		<!-- outline rather than solid, since the act is offered and never invited. -->
		<Button
			type="button"
			variant="outline"
			data-forget-account-open
			onclick={() => {
				confirming = true;
			}}
		>
			<UnplugIcon class="size-4" />
			{$LL.organization.dashboard.forgetAccount()}
		</Button>
	</div>
</Field.Field>

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
