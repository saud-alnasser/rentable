<script lang="ts">
	import { resolve } from '$app/paths';
	import StandaloneSurface from '$lib/design/block/standalone-surface.svelte';
	import { Button } from '$lib/design/primitive/button';
	import { toErrorDetail } from '$lib/error/message';
	import { LL } from '$lib/i18n/i18n-svelte';

	/**
	 * What a reader sees where a component threw while rendering.
	 *
	 * Both boundaries draw this one surface, because both are reporting the same event: something
	 * this application was drawing could not be drawn. What differs is what can be offered
	 * afterwards, and that follows from whether there is still a shell to leave for.
	 *
	 * **Neutral, and deliberately.** A caught render error is contained: the application is
	 * running and this is one part of it that is not. The two toned screens in this vocabulary are
	 * a startup that failed and an update that did not finish, and neither of them is this
	 * (`$lib/design/tone`). The outer case draws with no chrome around it, which looks like a
	 * startup failure and is not one, so it must not borrow that tone either.
	 */
	let {
		error,
		onRetry,
		hasWorkingShell = false
	}: {
		/** whatever was thrown, in whatever shape it arrived. */
		error: unknown;
		/** draw the subtree again. This is the boundary's own `reset`. */
		onRetry: () => void;
		/**
		 * whether there is still an application around this surface to go back into.
		 *
		 * True where a route's contents threw and the chrome is still standing, so leaving for the
		 * dashboard reaches a working screen. False where the chrome itself threw: every screen
		 * would draw the same broken chrome, so offering to go to one of them is offering
		 * something that cannot work.
		 */
		hasWorkingShell?: boolean;
	} = $props();

	// the thrown value's own prose, read the way every other thrown value here is read. Absent
	// where it carried none, rather than shown as a placeholder saying nothing.
	const detail = $derived(toErrorDetail(error));
</script>

<StandaloneSurface
	tone="neutral"
	title={hasWorkingShell ? $LL.layout.error.title() : $LL.layout.error.shellTitle()}
	description={hasWorkingShell
		? $LL.layout.error.description()
		: $LL.layout.error.shellDescription()}
>
	{#if detail}
		<!-- for whoever is asked what happened, the way the routed error screen already shows it:
		     the sentence above is for the reader, who met this because nothing anticipated it. -->
		<p class="text-sm break-words text-muted-foreground">{detail}</p>
	{/if}

	{#snippet actions()}
		{#if hasWorkingShell}
			<Button variant="outline" href={resolve('/')}>{$LL.layout.error.goHome()}</Button>
		{/if}
		<!-- last, and the one the eye lands on: drawing it again is what a reader wants first, and
		     it is the only thing offered at all where the chrome is what threw. -->
		<Button onclick={onRetry}>{$LL.layout.error.retry()}</Button>
	{/snippet}
</StandaloneSurface>
