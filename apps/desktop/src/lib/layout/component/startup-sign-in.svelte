<script lang="ts">
	import type { GoogleSignInPhase } from '$lib/platform/host';
	import StandaloneSurface from '$lib/design/block/standalone-surface.svelte';
	import { Button } from '$lib/design/primitive/button';
	import { Callout } from '$lib/design/primitive/callout';
	import { LL } from '$lib/i18n/i18n-svelte';
	import LogInIcon from '@lucide/svelte/icons/log-in';

	/**
	 * The wall, and the only way through it.
	 *
	 * Nothing renders behind it: not a workspace, not a name, not a count. That is the criterion
	 * rather than a styling choice — an install nobody has signed in on has no workspace to draw
	 * from, because signing up is the act that brings one into being.
	 *
	 * **It says two different things and offers one control.** Being locked out after three days
	 * offline is not the same situation as never having signed in, and the difference matters to
	 * the person reading it: one of them still has a workspace, and reconnecting is all it takes.
	 * The way through is identical either way, which is why the control is not doubled.
	 */
	let {
		reason,
		isSigningIn,
		phase,
		errorMessage,
		onSignIn
	}: {
		/** which of the two situations this is, from `workspaceAdmission`. */
		reason: 'noAccount' | 'windowClosed';
		/** a sign-in is outstanding — the consent screen is open, or its result is being applied. */
		isSigningIn: boolean;
		/** how far the outstanding sign-in has got, where the shell has said. */
		phase: GoogleSignInPhase | null;
		errorMessage: string | null;
		onSignIn: () => void;
	} = $props();

	const isLocked = $derived(reason === 'windowClosed');
</script>

<StandaloneSurface
	title={isLocked ? $LL.layout.signIn.lockedTitle() : $LL.layout.signIn.title()}
	description={isLocked ? $LL.layout.signIn.lockedDescription() : $LL.layout.signIn.description()}
	busy={isSigningIn}
>
	<div class="space-y-3">
		{#if errorMessage}
			<Callout variant="error">{errorMessage}</Callout>
		{/if}

		<!-- one line, and which line it is says where the sign-in has got to. Before it starts the
		     line is the standing precondition, because a first run needs a network and saying so
		     beforehand is the whole of the constraint the spec accepts knowingly. -->
		<p class="text-sm text-muted-foreground">
			{#if phase === 'finalizing'}
				{$LL.layout.signIn.finalizing()}
			{:else if phase === 'authorizing'}
				{$LL.layout.signIn.authorizing()}
			{:else}
				{$LL.layout.signIn.networkNotice()}
			{/if}
		</p>
	</div>

	{#snippet actions()}
		<Button onclick={onSignIn} disabled={isSigningIn}>
			<LogInIcon class="size-4" />
			{isSigningIn ? $LL.common.actions.working() : $LL.layout.signIn.continueWithGoogle()}
		</Button>
	{/snippet}
</StandaloneSurface>
