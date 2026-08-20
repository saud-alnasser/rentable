<script lang="ts">
	import type { GoogleSignInPhase } from '$lib/platform/host';
	import StandaloneSurface from '$lib/design/block/standalone-surface.svelte';
	import { Button } from '$lib/design/primitive/button';
	import { Callout, type CalloutVariant } from '$lib/design/primitive/callout';
	import { LL } from '$lib/i18n/i18n-svelte';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	/**
	 * The wall, and the ways through it.
	 *
	 * Nothing renders behind it: not a workspace, not a name, not a count. That is the criterion
	 * rather than a styling choice — an install nobody has signed in on has no workspace to draw
	 * from, because signing up is the act that brings one into being.
	 *
	 * **It reads as a login page, and the shape is the human's, settled on screen on 2026-08-20**:
	 * one word of title, a line under it, air, and the way in. Nothing else. Two versions carrying
	 * the mark and the product name were built first, one centred above the card following
	 * `login-03` and one at the top of the card, and both were removed on sight. **A desktop
	 * window names its application three times before this card gets a turn** — the title bar, the
	 * taskbar, and the installer that put it there — so a fourth was decoration on the one screen
	 * that should be quickest to get past. It stays on the shared application surface, which
	 * [[rules/interface]] under *Application surfaces* requires and which the same conversation
	 * confirmed over a page of its own.
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
	 * The box above the way in, and there is one only where something has to be said.
	 *
	 * **A notice on every visit is not a notice**, which is the correction the human made on
	 * 2026-08-20: the card carried a standing information box saying that signing in needs a
	 * network, on the screen whose own button is about to prove it. A reader who meets a coloured
	 * panel every time stops reading the one that matters, so the box is now the warning and the
	 * error and nothing else.
	 *
	 * An attempt that failed is the most urgent thing on the screen and takes the error
	 * treatment. A machine holding an identity it could not open a session with is a warning,
	 * because nothing is wrong with the account and the next attempt may well work. Everything
	 * else says what it has to say in the title and the line under it.
	 */
	const notice = $derived.by((): { variant: CalloutVariant; message: string } | null => {
		if (errorMessage) {
			return { variant: 'error', message: errorMessage };
		}

		if (situation === 'noSession') {
			return { variant: 'warning', message: $LL.layout.signIn.incomplete() };
		}

		return null;
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
	<!-- the extra step above what the surface gives every screen: with the card down to a title,
	     a line and a button, the gap between saying what this is and offering the way through it
	     is the only grouping left to draw. -->
	<div class="space-y-4 pt-2">
		{#if notice}
			<Callout variant={notice.variant}>{notice.message}</Callout>
		{/if}

		<!-- the way in. **Outlined rather than solid, which is the one place this card argues with
		     *Semantics are secondary* (p.60) and says why**: that section wants a primary action
		     solid and high contrast, and it is reasoning about a page where several actions
		     compete. Nothing competes here. What decides instead is the mark: a provider's logo
		     belongs on a neutral surface, and Google's on a filled accent button reads as a
		     generic glyph somebody tinted. Leaving this screen as somebody else stays a link,
		     which is that same section's tertiary and is not in contest. -->
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
				<Button
					variant="outline"
					class="h-10 w-full justify-center"
					onclick={onSignIn}
					disabled={isBusy}
				>
					<!-- Google's own mark, inlined and drawn in the button's own colour. The coloured
					     version needs a light plate under it, which this application cannot promise
					     in both themes. -->
					<svg viewBox="0 0 24 24" class="size-4 shrink-0" aria-hidden="true">
						<path
							d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
							fill="currentColor"
						/>
					</svg>
					{isSigningIn ? $LL.common.actions.working() : $LL.layout.signIn.signInWithGoogle()}
				</Button>
			{/if}
		</div>

		{#if working}
			<p class="text-center text-sm text-muted-foreground">{working}</p>
		{/if}
	</div>
</StandaloneSurface>
