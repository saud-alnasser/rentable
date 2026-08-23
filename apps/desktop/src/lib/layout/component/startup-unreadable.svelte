<script lang="ts">
	import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
	import SurfaceAction from '@rentable/design/block/surface-action.svelte';
	import { revealDiagnostics } from '$lib/platform/diagnostics';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	/**
	 * The application stopped before it knew what language to stop in.
	 *
	 * **The one screen here that cannot ask the reader anything.** Startup loads the reader's own
	 * locale in its first stage, and the two calls before that line can throw. Until one is loaded
	 * every string in this application resolves to the empty string rather than failing, so a
	 * screen built the ordinary way draws a card with no words in it, which is a quieter version of
	 * the empty window this replaces.
	 *
	 * So it is built out of what needs no dictionary: the application's own name, which is a proper
	 * noun in both languages; the failure as it was thrown, which is a machine's English either
	 * way; and two glyphs. What is lost against {@link ./startup-error.svelte} is the sentence
	 * explaining that nothing recorded is at risk. What is kept is the whole of what a person can
	 * act on, which is the way out.
	 *
	 * **Its two labels are written here rather than read, and they are the base locale's own
	 * words.** They are the accessible names of two controls on a screen that exists because no
	 * dictionary could be reached, so reaching one for them is the thing that cannot be done. They
	 * are `settings.diagnosticsReveal` and `common.actions.retryStartup` verbatim, and
	 * `layout/tests/startup-surface.test.ts` holds them to that rather than leaving two copies to
	 * drift. A reader whose language is Arabic meets English on this screen alone.
	 *
	 * **Neither control carries a tooltip, and that is the difference that keeps this screen on
	 * screen at all.** A tooltip root reads `TooltipProvider`'s context and throws where there is
	 * none, and since #779 its content reads `DesignProvider`'s and throws too. Both providers are
	 * rendered inside the locale gate, so both throw here, outside every boundary, and the window
	 * they would have filled stays empty. The label is still each control's accessible name.
	 *
	 * **It is not toned differently from a startup failure that could be read**, because it is the
	 * same event. `error` is the tone requirement 15 gives that screen, and this one takes it too.
	 */
	let {
		message,
		onRetry
	}: {
		/**
		 * What was thrown, as the failure path rendered it.
		 *
		 * Empty in two cases, and the card carries the name and the controls in both. A thrown value
		 * with nothing readable in it is one. The other is the retry: `start` clears the error, and
		 * this screen stays drawn through it rather than handing the reader back the blank window
		 * they just pressed their way out of.
		 */
		message: string;
		onRetry: () => void;
	} = $props();

	let isRevealing = $state(false);

	async function reveal() {
		if (isRevealing) {
			return;
		}

		isRevealing = true;

		try {
			await revealDiagnostics();
		} finally {
			isRevealing = false;
		}
	}
</script>

<!-- the reading direction is stated rather than inherited, and it is the direction of the words
     this screen actually carries. Everything on it is either a proper noun, a machine's English,
     or a glyph. -->
<div lang="en" dir="ltr" class="flex min-h-full flex-1 flex-col">
	<!-- **`tone="error"` and the absence of `busy` are load-bearing here, not styling.** this
	     screen is drawn outside the string contract's provider, which the root layout renders only
	     inside the locale gate. the surface's unbanded branch draws a packaged spinner, that
	     spinner reads the contract, and reading it where there is none throws. either of the two
	     keeps that branch undrawn; changing both puts a blank window back on the one screen that
	     exists because of one. -->
	<StandaloneSurface tone="error" title="rentable" description={message || undefined}>
		{#snippet corner()}
			<!-- where the failure was written down, which is the only place it survives now that
			     nothing on screen can explain it. -->
			<SurfaceAction
				label="open log folder"
				icon={FolderOpenIcon}
				tooltip={false}
				onclick={() => void reveal()}
			/>

			<!-- the glyph turns under the pointer, which previews what pressing it does. -->
			<SurfaceAction
				label="retry startup"
				icon={RefreshCwIcon}
				emphasis="primary"
				spins
				tooltip={false}
				onclick={onRetry}
			/>
		{/snippet}
	</StandaloneSurface>
</div>
