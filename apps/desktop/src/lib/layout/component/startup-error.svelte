<script lang="ts">
	import StandaloneSurface from '$lib/design/block/standalone-surface.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import SurfaceAction from '$lib/design/block/surface-action.svelte';
	import { revealDiagnostics } from '$lib/platform/diagnostics';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	/**
	 * The application could not finish starting.
	 *
	 * **One description and nothing else.** *Redesigned 2026-08-20 after looking at it.* It said
	 * little, in a card indistinguishable from the five other screens on this block, above a
	 * reported error nobody outside this codebase can read. What it says now is the three things a
	 * person actually needs: what could not be opened, that nothing recorded in it is at risk, and
	 * that starting again is the first thing to try.
	 *
	 * **The reported error is not on the screen.** A stack trace above a retry button is an apology
	 * addressed to the wrong reader; the folder control leads to the diagnostics, which is the one
	 * place it was ever going to be useful.
	 *
	 * **It is not in the diagnostics yet, and this screen is where that shows.** Nothing writes the
	 * startup error anywhere: `routes/+layout.svelte` formats it for display and holds it in a
	 * variable. Taking it off the screen without writing it down is where it is lost, so the
	 * `message` prop is gone rather than accepted and ignored — a prop this screen does not read is
	 * a claim that it handles something it does not.
	 *
	 * **This screen, the one a startup draws when it failed before a locale, and update recovery
	 * are the three that declare a tone**, and the recovery does not declare what the other two do.
	 * The first two are the same event said twice, once in the reader's language and once in
	 * whatever needs none, so they take the same tone. Everything on this block presents the application's own state, but
	 * these two are the states where the application is not working — and a failed startup is not
	 * the same event as an update that needs finishing.
	 */
	let {
		onRetry
	}: {
		onRetry: () => void;
	} = $props();

	let isRevealing = $state(false);

	// shared with the screen a startup that failed before the first locale draws, which offers the
	// same folder for the same reason and cannot rely on anything else about the application.
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

<StandaloneSurface
	tone="error"
	title={$LL.layout.startup.failureTitle()}
	description={$LL.layout.startup.failureDescription()}
>
	{#snippet corner()}
		<!-- what a person needs next when starting again has not worked, and where the reported
		     error went now that the body is one sentence. -->
		<SurfaceAction
			label={$LL.settings.diagnosticsReveal()}
			icon={FolderOpenIcon}
			onclick={() => void reveal()}
		/>

		<!-- the glyph turns under the pointer, which previews what pressing it does. -->
		<SurfaceAction
			label={$LL.common.actions.retryStartup()}
			icon={RefreshCwIcon}
			emphasis="primary"
			spins
			onclick={onRetry}
		/>
	{/snippet}
</StandaloneSurface>
