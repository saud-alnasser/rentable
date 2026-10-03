<script lang="ts">
	import { tauri } from '$lib/platform/tauri';
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import {
		useBeginConsent,
		useConsentResult,
		useReconnectAuthority
	} from '$lib/organization/setup/query';
	import DatabaseIcon from '@lucide/svelte/icons/database';

	/**
	 * An owner on a machine that holds no Turso authority, restored here or reinstalled: the Turso
	 * account's row in the owner's leaving card (`turso-account.svelte`), reading *not held here*
	 * with the act that reconnects it.
	 *
	 * **The authority is re-obtained by repeating the consent and is restored from nowhere**
	 * (requirement 5, requirement 6). No row holds it, so a machine that has just restored the
	 * organization cannot create a workspace, lock anybody out or renew a credential until the
	 * owner has given the consent again on this machine; the row's line says so, and this offers
	 * the same consent the first run offered. Once it is granted, the account it is over is
	 * discovered the way the first run discovered it, and the machine can act as the owner's again.
	 *
	 * **It is also what an owner who was handed the organization meets** (effort 828, requirement
	 * 22), and that is a different reason for the same state: nothing was lost here, the authority
	 * simply never belonged to the ownership. The row's line says where it does belong, and the
	 * offer is the same either way.
	 *
	 * **A connection, read as one** (effort 846, requirement 13): the row is named for the account
	 * and its value is its state on this machine. The reconnect is words alone, as every button in
	 * the leaving card is (ticket 38: no button repeats its row's glyph, and a group's buttons agree
	 * on glyphs, requirement 5). While the consent is out in the browser, and when it comes back
	 * refused, what that calls for is drawn beneath the row it is about.
	 */
	let { onReconnected }: { onReconnected: () => void } = $props();

	let sessionId = $state<string | null>(null);

	const beginConsent = useBeginConsent();
	const consentResult = useConsentResult(() => sessionId);
	const reconnect = useReconnectAuthority();

	const status = $derived(sessionId ? (consentResult.data?.status ?? 'pending') : 'idle');

	const connect = async () => {
		try {
			const started = await beginConsent.mutateAsync();

			sessionId = started.sessionId;
			await tauri.opener.openUrl(started.authorizationUrl);
		} catch {
			// said by the shared handler, and the button is still there.
		}
	};

	const record = async () => {
		try {
			await reconnect.mutateAsync();
			sessionId = null;
			onReconnected();
		} catch {
			// said by the shared handler.
		}
	};

	// the consent was granted in the browser: record which account it is over, once.
	$effect(() => {
		if (status === 'granted' && !reconnect.isPending) {
			void record();
		}
	});
</script>

{#snippet reconnectControl()}
	<!-- outline rather than solid, since the act is offered and never invited. -->
	<Button
		type="button"
		variant="outline"
		size="sm"
		data-reconnect-authority-open
		onclick={() => void connect()}
		disabled={beginConsent.isPending || status === 'pending' || reconnect.isPending}
	>
		{beginConsent.isPending || reconnect.isPending
			? $LL.common.actions.working()
			: $LL.organization.dashboard.reconnect()}
	</Button>
{/snippet}

{#snippet consent()}
	{#if status === 'pending'}
		<p class="text-sm text-muted-foreground" data-consent-pending>
			{$LL.organization.setup.connecting()}
		</p>
	{:else if status === 'abandoned' || status === 'failed'}
		<Callout tone="error" data-consent-refused>
			{status === 'abandoned'
				? $LL.organization.setup.consentAbandoned()
				: $LL.organization.setup.consentFailed()}
		</Callout>
	{/if}
{/snippet}

<SettingsRow
	icon={DatabaseIcon}
	name={$LL.organization.dashboard.authorityTitle()}
	value={$LL.organization.dashboard.authorityNotHeld()}
	meta={`${$LL.organization.dashboard.authorityFollowsTheAccount()} ${$LL.organization.dashboard.authorityDescription()}`}
	control={reconnectControl}
	beneath={status === 'pending' || status === 'abandoned' || status === 'failed'
		? consent
		: undefined}
	data-turso-account="not-held"
/>
