<script lang="ts">
	import { tauri } from '$lib/platform/tauri';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import {
		useBeginConsent,
		useConsentResult,
		useReconnectAuthority
	} from '$lib/organization/query';

	/**
	 * An owner on a machine that holds no Turso authority: restored here, or reinstalled.
	 *
	 * **The authority is re-obtained by repeating the consent and is restored from nowhere**
	 * (requirement 5, requirement 6). No row holds it, so a machine that has just restored the
	 * organization cannot create a workspace, lock anybody out or renew a credential until the
	 * owner has given the consent again on this machine; this says so, and offers the same consent
	 * the first run offered. Once it is granted, the account it is over is discovered the way the
	 * first run discovered it, and the machine can act as the owner's again.
	 *
	 * **It is also what an owner who was handed the organization meets** (effort 828, requirement
	 * 22), and that is a different reason for the same state: nothing was lost here, the authority
	 * simply never belonged to the ownership. So one short sentence says where it does belong,
	 * before the sentence about restoring it, and the offer below is the same offer either way.
	 * The transfer's own surface says the same thing to the person handing it over, so neither
	 * side learns it for the first time here.
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

<div class="space-y-4" data-reconnect-authority={status}>
	<Field.Description data-authority-follows-the-account>
		{$LL.organization.dashboard.authorityFollowsTheAccount()}
	</Field.Description>
	<Field.Description>{$LL.organization.dashboard.authorityDescription()}</Field.Description>

	{#if status === 'pending'}
		<p class="text-sm text-muted-foreground">{$LL.organization.setup.connecting()}</p>
	{:else if status === 'abandoned' || status === 'failed'}
		<Callout tone="error">
			{status === 'abandoned'
				? $LL.organization.setup.consentAbandoned()
				: $LL.organization.setup.consentFailed()}
		</Callout>
	{/if}

	<Button
		variant="outline"
		size="sm"
		onclick={() => void connect()}
		disabled={beginConsent.isPending || status === 'pending' || reconnect.isPending}
	>
		{beginConsent.isPending || reconnect.isPending
			? $LL.common.actions.working()
			: $LL.organization.setup.connect()}
	</Button>
</div>
