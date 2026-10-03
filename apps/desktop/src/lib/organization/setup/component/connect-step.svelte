<script lang="ts">
	import ConfirmDialog from '@rentable/design/block/confirm-dialog.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import DetailDisclosure from '$lib/error/component/detail-disclosure.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';

	import type { WalkRefusal } from '../setup';

	/**
	 * The walk's first step (`walk.svelte`): what the consent has come to, and the way on or the
	 * consent itself, with one line under it saying what pressing it does. The walk says why it is
	 * drawn this way; this draws it.
	 */
	let {
		consent,
		refusal,
		holdsTursoAuthority,
		isBusy,
		isConnecting,
		onConnect,
		onDisconnect,
		onContinue
	}: {
		/** how far the consent has got, or `idle` where none has been started. */
		consent: {
			status: 'idle' | 'pending' | 'granted' | 'failed' | 'abandoned';
			error: string | null;
		};
		/** what refused the run, where the way on is another consent; the walk says which. */
		refusal: WalkRefusal | null;
		/** whether the machine already holds the authority a consent would grant. */
		holdsTursoAuthority: boolean;
		/** the walk is waiting on the shell, and its controls with it. */
		isBusy: boolean;
		/** the consent is being opened. */
		isConnecting: boolean;
		onConnect: () => void;
		onDisconnect: () => void;
		onContinue: () => void;
	} = $props();

	/**
	 * whether the consent is granted, either because the poll said so or because the machine
	 * already held the authority when the walk opened. A consent that was started here says what
	 * it said; only a walk that has started none reads the machine's standing.
	 */
	/**
	 * whether forgetting the account is being asked about. It forgets the authority this machine
	 * holds, so it asks first, in the words the leaving card's forget asks in (effort 846,
	 * requirement 2 as revised 2026-10-02).
	 */
	let forgetting = $state(false);

	const granted = $derived(
		consent.status === 'granted' || (consent.status === 'idle' && holdsTursoAuthority)
	);

	/**
	 * What the consent step has to say beyond its line, and only where something happened:
	 * a create the group refused is said first, a granted consent is confirmed, an abandoned or
	 * refused consent is said, and a pending one names the browser window. Nothing is shown before the person has pressed anything, unless the
	 * machine already held the authority, in which case the confirmation is what it opens with.
	 */
	const consentNotice = $derived.by(
		(): {
			tone: 'success' | 'warning' | 'error';
			message: string;
			detail: string | null;
		} | null => {
			// a refusal outranks everything else the step could say: it is why the person is
			// back here, and the consent it speaks of is already gone.
			if (refusal) {
				return { tone: 'error', message: refusal.sentence, detail: refusal.detail };
			}

			if (granted) {
				return { tone: 'success', message: $LL.organization.setup.connected(), detail: null };
			}

			switch (consent.status) {
				case 'abandoned':
					return {
						tone: 'warning',
						message: $LL.organization.setup.consentAbandoned(),
						detail: null
					};
				case 'failed':
					// what the authorization server said is its own words, in its own language, so it
					// sits behind a disclosure under the sentence rather than inside it.
					return {
						tone: 'error',
						message: $LL.organization.setup.consentFailed(),
						detail: consent.error
					};
				default:
					return null;
			}
		}
	);
</script>

{#if consentNotice}
	<div class="flex flex-col gap-1 text-start" data-setup-consent-notice>
		<Callout tone={consentNotice.tone}>{consentNotice.message}</Callout>

		{#if consentNotice.detail}
			<DetailDisclosure detail={consentNotice.detail} name="consent" />
		{/if}
	</div>
{/if}

<div class="flex flex-col gap-3">
	{#if granted}
		<!-- the way on asks the account what it already holds before it decides which step
		     follows, which is a round trip: disabled while it is in flight, and saying so,
		     because a second press would ask again. -->
		<Button size="lg" class="w-full" onclick={onContinue} disabled={isBusy}>
			<span class="first-letter:uppercase">
				{isConnecting ? $LL.common.actions.working() : $LL.organization.setup.continue()}
			</span>
		</Button>
		<!-- the way to give the authority back, quiet under the way on: the callout above already
		     says what is connected, and this is the exception to going on. -->
		<Button
			variant="ghost"
			size="sm"
			class="self-center"
			data-setup-forget-open
			onclick={() => {
				forgetting = true;
			}}
		>
			<span class="first-letter:uppercase">{$LL.organization.dashboard.forgetAccount()}</span>
		</Button>
	{:else}
		<Button size="lg" class="w-full" onclick={onConnect} disabled={isBusy}>
			<span class="first-letter:uppercase">
				{isConnecting ? $LL.common.actions.working() : $LL.organization.setup.connect()}
			</span>
		</Button>
		<!-- what pressing it does, in the one line the step has under its button. -->
		<p class="text-center text-xs text-muted-foreground" data-setup-connect-hint>
			{$LL.organization.setup.connectHint()}
		</p>
	{/if}
</div>

<ConfirmDialog
	open={forgetting}
	onOpenChange={(value) => {
		forgetting = value;
	}}
	onSubmit={onDisconnect}
	record={$LL.organization.dashboard.authorityTitle()}
	title={$LL.organization.dashboard.forgetAccount()}
	description={$LL.organization.dashboard.forgetAccountRevokes()}
	confirmLabel={$LL.organization.dashboard.forgetAccount()}
	confirmLoadingLabel={$LL.common.actions.working()}
/>
