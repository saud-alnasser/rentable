<script lang="ts">
	import type { GoogleSignInPhase } from '$lib/platform/host';
	import StandaloneSurface from '$lib/design/block/standalone-surface.svelte';
	import { Button } from '$lib/design/primitive/button';
	import { Callout, type CalloutVariant } from '$lib/design/primitive/callout';
	import { LL } from '$lib/i18n/i18n-svelte';
	import InnerShadowTopIcon from '@tabler/icons-svelte/icons/inner-shadow-top';
	import LogInIcon from '@lucide/svelte/icons/log-in';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	/**
	 * The wall, and the ways through it.
	 *
	 * Nothing renders behind it: not a workspace, not a name, not a count. That is the criterion
	 * rather than a styling choice — an install nobody has signed in on has no workspace to draw
	 * from, because signing up is the act that brings one into being.
	 *
	 * **It reads as a login screen, and that is a decision the human took on 2026-08-20**: the mark
	 * and the product name above the title, one notice box, then the way in as a full-width option
	 * under it. It stays on the shared application surface, which [[rules/interface]] under
	 * *Application surfaces* requires and which the same conversation confirmed over a page of its
	 * own.
	 *
	 * **Three situations, and the third is why this was rewritten.** Never having signed in, having
	 * been out of contact past the window, and holding an identity with no session are different
	 * things to the person reading them. The third used to render as one of the other two, so a
	 * machine whose control plane was unreachable was told to sign in again. That opens a consent
	 * screen, answers it, and arrives back here, because the consent screen was never what failed.
	 * It is offered the call that did fail instead.
	 */
	let {
		situation,
		isSigningIn,
		isRetrying,
		phase,
		errorMessage,
		onSignIn,
		onRetry
	}: {
		/** which of the three situations this is, from `workspaceAdmission`. */
		situation: 'noAccount' | 'windowClosed' | 'noSession';
		/** a sign-in is outstanding — the consent screen is open, or its result is being applied. */
		isSigningIn: boolean;
		/** the control plane is being reached with the identity this machine already holds. */
		isRetrying: boolean;
		/** how far the outstanding sign-in has got, where the shell has said. */
		phase: GoogleSignInPhase | null;
		errorMessage: string | null;
		onSignIn: () => void;
		onRetry: () => void;
	} = $props();

	const isBusy = $derived(isSigningIn || isRetrying);

	const title = $derived(
		{
			noAccount: $LL.layout.signIn.title(),
			windowClosed: $LL.layout.signIn.lockedTitle(),
			noSession: $LL.layout.signIn.incompleteTitle()
		}[situation]
	);

	const description = $derived(
		{
			noAccount: $LL.layout.signIn.description(),
			windowClosed: $LL.layout.signIn.lockedDescription(),
			noSession: $LL.layout.signIn.incompleteDescription()
		}[situation]
	);

	/**
	 * The box above the options, and what it says decides its colour.
	 *
	 * There is always one. A screen whose only content is a button says nothing about why it is in
	 * front of you, and the three situations differ precisely in that. An attempt that failed is
	 * the most urgent thing on the screen and takes the error treatment; a machine that has not
	 * reached the control plane is a warning, because nothing is wrong with the account and the
	 * next attempt may well work; a first sign-in gets the standing precondition, which is a
	 * network, and that is information rather than a problem.
	 */
	const notice = $derived.by((): { variant: CalloutVariant; message: string } => {
		if (errorMessage) {
			return { variant: 'error', message: errorMessage };
		}

		if (situation === 'noSession') {
			return { variant: 'warning', message: $LL.layout.signIn.incomplete() };
		}

		return { variant: 'info', message: $LL.layout.signIn.networkNotice() };
	});

	/** what the shell is doing, said only while it is doing it. */
	const working = $derived(
		isRetrying
			? $LL.layout.signIn.reaching()
			: phase === 'finalizing'
				? $LL.layout.signIn.finalizing()
				: phase === 'authorizing'
					? $LL.layout.signIn.authorizing()
					: null
	);
</script>

<StandaloneSurface {title} {description} busy={isBusy}>
	{#snippet lead()}
		<!-- the same mark and name the sidebar carries, because this is the one screen a person can
		     reach before the sidebar exists, and it should not be the one screen that leaves them
		     wondering what asked them to sign in. -->
		<div class="flex items-center gap-2">
			<InnerShadowTopIcon class="size-5 shrink-0 text-muted-foreground" />
			<span class="text-sm font-semibold tracking-[0.04em] capitalize">{$LL.app.name()}</span>
		</div>
	{/snippet}

	<div class="space-y-4">
		<Callout variant={notice.variant}>{notice.message}</Callout>

		<!-- the options, full width and stacked, so a second provider is a row rather than a
		     redesign. Primary solid, the way out styled as a link: *Semantics are secondary*, p.60 -
		     signing in as somebody else is a real move and almost never the one being made. -->
		<div class="space-y-2">
			{#if situation === 'noSession'}
				<Button class="w-full justify-center" onclick={onRetry} disabled={isBusy}>
					<RefreshCwIcon class="size-4" />
					{isRetrying ? $LL.common.actions.working() : $LL.layout.signIn.tryAgain()}
				</Button>

				<Button variant="link" class="w-full justify-center" onclick={onSignIn} disabled={isBusy}>
					{$LL.layout.signIn.useDifferentAccount()}
				</Button>
			{:else}
				<Button class="w-full justify-center" onclick={onSignIn} disabled={isBusy}>
					<LogInIcon class="size-4" />
					{isSigningIn ? $LL.common.actions.working() : $LL.layout.signIn.continueWithGoogle()}
				</Button>
			{/if}
		</div>

		{#if working}
			<p class="text-center text-sm text-muted-foreground">{working}</p>
		{/if}
	</div>
</StandaloneSurface>
