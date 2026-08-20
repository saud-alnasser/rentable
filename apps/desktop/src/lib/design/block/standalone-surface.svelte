<script lang="ts">
	import { Spinner } from '$lib/design/primitive/spinner';
	import { cn } from '$lib/design/tailwind';
	import type { Snippet } from 'svelte';

	/**
	 * The surface the application shows when it cannot yet show the application.
	 *
	 * Seven screens render through it — starting, signing in, failing to start, recovering, choosing a
	 * workspace, settings failing to load, and an unhandled route error — because none of them
	 * presents a concept's records: they present the application's own state, which converges
	 * where a concept's surfaces diverge (ADR 0015). It owns the centring, the one width and
	 * the geometry, so no screen can come to disagree with another about any of them the way
	 * seven hand-rolled copies already had.
	 *
	 * The seam is the body: everything around it is identical for all seven, and what crosses it
	 * is whatever that screen has to say.
	 *
	 * *It grew a `lead` snippet on 2026-08-20 so the sign-in wall could carry the application's
	 * mark, and lost it the same day: the human took the mark off that screen after looking at it,
	 * and a slot with no caller is a shape the next screen will fill for a reason nobody argued.*
	 */
	let {
		title,
		description,
		busy = false,
		children,
		corner,
		actions,
		class: className
	}: {
		/** What this screen is, in a few words. */
		title: string;
		/** Optional line under the title, where the title alone does not explain the state. */
		description?: string;
		/** Whether the application is working rather than waiting for the reader. */
		busy?: boolean;
		/** What this screen has to say. */
		children?: Snippet;
		/**
		 * The way past this screen, as a control in the card's top corner — where a reader looks
		 * for one. Distinct from `actions`: those answer the screen, this one leaves it.
		 */
		corner?: Snippet;
		/** The buttons, in the order given. */
		actions?: Snippet;
		class?: string;
	} = $props();
</script>

<div class="flex min-h-full flex-1 items-center justify-center p-4">
	<!-- one width for all seven. The three that disagreed did so because each chose its own. -->
	<div
		class={cn(
			'w-full max-w-lg rounded-3xl bg-card p-6 text-start shadow-xl ring-1 ring-foreground/10',
			'motion-safe:animate-in motion-safe:animation-duration-200 motion-safe:zoom-in-95 motion-safe:fade-in',
			className
		)}
		role={busy ? 'status' : undefined}
		aria-busy={busy || undefined}
	>
		<div class="flex items-start gap-3">
			{#if busy}
				<Spinner class="mt-0.5 size-5 shrink-0 text-muted-foreground" />
			{/if}
			<div class="min-w-0 flex-1 space-y-1">
				<h1 class="text-lg font-semibold tracking-tight">{title}</h1>
				{#if description}
					<p class="text-sm text-muted-foreground">{description}</p>
				{/if}
			</div>

			{#if corner}
				<div class="flex shrink-0 items-center gap-1.5">
					{@render corner()}
				</div>
			{/if}
		</div>

		{#if children}
			<div class="mt-4">
				{@render children()}
			</div>
		{/if}

		{#if actions}
			<div class="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
				{@render actions()}
			</div>
		{/if}
	</div>
</div>
