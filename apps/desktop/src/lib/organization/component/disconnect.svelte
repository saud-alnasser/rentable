<script lang="ts">
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import DisconnectDialog from '$lib/organization/component/disconnect-dialog.svelte';
	import UnplugIcon from '@lucide/svelte/icons/unplug';

	/**
	 * Disconnecting this machine from the organization, from the organization page.
	 *
	 * **It forgets the organization here and touches nothing on Turso** (requirement 20 of
	 * effort 824): the shell signs the person out first, deletes the organization replica and
	 * every workspace replica on this machine, empties the record and clears the Turso authority
	 * from the keyring. The organization and its workspaces on Turso stay as they are, and the
	 * link connects a machine to them again. Reaching another organization is this, then a
	 * connect, since a machine holds one.
	 *
	 * **It asks once, through the one confirm the wall also mounts** (`disconnect-dialog.svelte`),
	 * so the question reads the same on both surfaces. What happens after the confirm is the
	 * route's: it calls the shell and the startup unit reads where the machine stands again, which
	 * raises the screen a machine with nothing shows.
	 */
	let {
		organizationName,
		onDisconnect
	}: {
		/** the organization this machine holds, which the confirm names. */
		organizationName: string;
		/** forget the organization on this machine; rejects with what the shared handler has said. */
		onDisconnect: () => Promise<void>;
	} = $props();

	let confirming = $state(false);
</script>

<Field.Field orientation="vertical" data-disconnect>
	<Field.Content>
		<Field.Description>{$LL.organization.dashboard.disconnectForgets()}</Field.Description>
	</Field.Content>

	<div>
		<!-- the verb's glyph before its label, as every primary here carries one; outline rather than
		     solid, since the act is offered and never invited. -->
		<Button
			type="button"
			variant="outline"
			data-disconnect-open
			onclick={() => {
				confirming = true;
			}}
		>
			<UnplugIcon class="size-4" />
			{$LL.organization.dashboard.disconnect()}
		</Button>
	</div>
</Field.Field>

<DisconnectDialog
	open={confirming}
	onOpenChange={(open) => {
		confirming = open;
	}}
	{organizationName}
	{onDisconnect}
/>
