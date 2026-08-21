<script lang="ts">
	import { Spinner } from '$lib/design/primitive/spinner';
	import { cn } from '$lib/design/tailwind';
	import { tone as toneClasses, toneIcon, type Tone } from '$lib/design/tone';
	import type { Component, Snippet } from 'svelte';

	/**
	 * The surface the application shows when it cannot yet show the application.
	 *
	 * Six screens render through it — signing in, failing to start, failing to start before a locale
	 * could be loaded, recovering, settings failing to load, and an unhandled route error — because
	 * none of them presents a concept's records: they
	 * present the application's own state, which converges where a concept's surfaces diverge
	 * (ADR 0015). It owns the centring, the one width and the geometry, so no screen can come to
	 * disagree with another about any of them the way the hand-rolled copies already had.
	 *
	 * *Two have left. Choosing a workspace went with Google Drive sync (decision 07). Starting left
	 * on 2026-08-20: a card is for something you read or act on, and loading asks nothing — it was
	 * here because six others needed a block, which is convergence reaching one screen too far.*
	 *
	 * The seam is the body: everything around it is identical for all six, and what crosses it
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
		class: className,
		tone = 'neutral',
		icon
	}: {
		/**
		 * What this screen is, in a few words.
		 *
		 * **Sentence case rather than the title case every other title in this application wears.**
		 * Five of the seven screens rendering through here are titled with a sentence rather than a
		 * name: *rentable could not finish starting*, *the application could not be drawn*, *sign in
		 * again to continue*. `capitalize` sets every word, and a sentence in title case reads as a
		 * headline about the failure rather than as the application saying what happened.
		 */
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
		/**
		 * What kind of event this screen is reporting, in the application's one vocabulary — see
		 * `$lib/design/tone`.
		 *
		 * **Every screen on this block declares one, and most declare `neutral`.** Screens that
		 * present identically leave a person unable to tell at a glance whether the application is
		 * working or broken — and the two that are not working are not the same event as each other
		 * either. `neutral` is byte-for-byte what this block has always drawn, so declaring it
		 * changes nothing for the three screens that do.
		 *
		 * **The line is the application, not the screen.** A failed startup and an unfinished
		 * update stop everything; a settings page that will not load and a crashed route are
		 * contained, and the shell around them is still working. Only the stopping ones are toned,
		 * which is three screens: a startup failure, the same failure drawn before a locale could be
		 * loaded, and an unfinished update.
		 */
		tone?: Tone;
		/**
		 * The glyph in the band, where the tone's own is not what this screen is about. Update
		 * recovery is the case: `info` in tone and a download in subject.
		 */
		icon?: Component<{ class?: string }>;
	} = $props();

	const banded = $derived(tone !== 'neutral');

	const parts = $derived(toneClasses({ tone }));
	const Glyph = $derived(icon ?? toneIcon[tone]);
</script>

{#snippet rest()}
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
{/snippet}

<div class="flex min-h-full flex-1 items-center justify-center p-4">
	<!-- one width for all seven. The three that disagreed did so because each chose its own. -->
	<div
		class={cn(
			'w-full max-w-lg rounded-3xl bg-card text-start shadow-xl ring-1 ring-foreground/10',
			banded ? 'overflow-hidden' : 'p-6',
			'motion-safe:animate-in motion-safe:animation-duration-200 motion-safe:zoom-in-95 motion-safe:fade-in',
			className
		)}
		role={busy ? 'status' : undefined}
		aria-busy={busy || undefined}
	>
		{#if banded}
			<!-- the band reaches the card's edges, so one glance says what kind of screen this is
			     before a word is read. The corner controls sit in it, which is where a reader
			     already looks for the way past a screen. -->
			<div class="flex items-center gap-3 px-6 py-4 {parts.wash()} {parts.text()}">
				{#if Glyph}
					<Glyph class="size-5 shrink-0" />
				{/if}
				<h1 class="min-w-0 flex-1 text-lg font-semibold tracking-tight first-letter:uppercase">
					{title}
				</h1>

				{#if corner}
					<div class="flex shrink-0 items-center gap-1.5">
						{@render corner()}
					</div>
				{/if}
			</div>

			<div class="p-6">
				{#if description}
					<p class="text-sm text-muted-foreground">{description}</p>
				{/if}

				{@render rest()}
			</div>
		{:else}
			<div class="flex items-start gap-3">
				{#if busy}
					<Spinner class="mt-0.5 size-5 shrink-0 text-muted-foreground" />
				{/if}
				<div class="min-w-0 flex-1 space-y-1">
					<h1 class="text-lg font-semibold tracking-tight first-letter:uppercase">{title}</h1>
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

			{@render rest()}
		{/if}
	</div>
</div>
