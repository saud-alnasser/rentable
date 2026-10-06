<script lang="ts">
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { tone } from '@rentable/design/tone.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import DisconnectDialog from '$lib/organization/component/disconnect-dialog.svelte';
	import UnplugIcon from '@lucide/svelte/icons/unplug';

	/**
	 * Disconnecting this machine from the organization: a row at the end of the leaving group.
	 *
	 * **It forgets the organization here and touches nothing on Turso** (requirement 20 of
	 * effort 824): the shell signs the person out first, deletes this organization's replica and
	 * its workspace replicas on this machine, drops its entry from the record and clears its Turso
	 * authority from the keyring. Any other organization the machine holds is left as it is
	 * (effort 851, requirement 5). The organization and its workspaces on Turso stay as they are,
	 * and a link connects a machine to them again.
	 *
	 * **An act that ends something, so an error row with its glyph, and its consequence as the line
	 * under its name** (effort 846, requirements 2 and 14). A member is told the organization stays
	 * on Turso and that a new link brings them back, since a link is the only way back a member
	 * has; the owner is told nothing on Turso changes. The row's name is the act and labels the
	 * button, whose own word is the verb alone, red and with no glyph: the row's glyph already says
	 * what it is about (ticket 38).
	 *
	 * **It asks once, through the one confirm the wall also mounts** (`disconnect-dialog.svelte`),
	 * so the question reads the same on both surfaces. What happens after the confirm is the
	 * route's: it calls the shell and the startup unit reads where the machine stands again, which
	 * raises the screen a machine with nothing shows. The confirm says the Turso account goes only
	 * where this machine holds the organization's consent (effort 851, criterion 5), so a member,
	 * and an owner whose consent is not held here, are not told it.
	 */
	let {
		organizationName,
		isOwner = false,
		holdsTursoAuthority = false,
		onDisconnect
	}: {
		/** the organization this machine holds, which the confirm names. */
		organizationName: string;
		/** whether the reader owns the organization, which decides how the consequence reads. */
		isOwner?: boolean;
		/** whether this machine holds the organization's Turso consent, which the confirm says goes. */
		holdsTursoAuthority?: boolean;
		/** forget the organization on this machine; rejects with what the shared handler has said. */
		onDisconnect: () => Promise<void>;
	} = $props();

	let confirming = $state(false);
</script>

{#snippet consequence()}
	<span data-leaving-consequence>
		{isOwner
			? $LL.organization.dashboard.disconnectForgets()
			: $LL.organization.dashboard.disconnectComesBack()}
	</span>
{/snippet}

<SettingsRow
	icon={UnplugIcon}
	name={$LL.organization.dashboard.disconnectThisMachine()}
	tone="error"
	meta={consequence}
>
	{#snippet control({ labelId })}
		<!-- the row carries no mark of its own, so the act's two marks are on its one control: the
		     act (`data-disconnect`), which the section's order is read by, and what opens it. -->
		<Button
			type="button"
			variant="ghost"
			size="sm"
			class="{tone({ tone: 'error' }).text()} hover:bg-destructive/10 hover:text-destructive"
			aria-labelledby={labelId}
			data-disconnect
			data-disconnect-open
			onclick={() => {
				confirming = true;
			}}
		>
			{$LL.organization.dashboard.disconnect()}
		</Button>
	{/snippet}
</SettingsRow>

<DisconnectDialog
	open={confirming}
	onOpenChange={(open) => {
		confirming = open;
	}}
	{organizationName}
	forgetsTurso={holdsTursoAuthority}
	{onDisconnect}
/>
