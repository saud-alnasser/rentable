<script lang="ts">
	import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import SurfaceAction from '@rentable/design/block/surface-action.svelte';
	import DetailDisclosure from '$lib/error/component/detail-disclosure.svelte';
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
	 * **The reported error is not in the body.** A stack trace above a retry button is an apology
	 * addressed to the wrong reader; the folder control leads to the diagnostics, where the machine
	 * writes every failed start (`StartupMachine.fail`).
	 *
	 * **The reason it was given is behind the details, closed** (effort 857, requirement 8, and
	 * [[rules/interface]], *Error*): the sentence in the reader's language, and under it whatever
	 * the shell said, for whoever the reader asks about it. A person who has tried starting again
	 * and is still here is the one who opens it. A refusal never reaches this screen: an
	 * organization that would not open goes back to the switcher, and a workspace past reading to
	 * its update-required screen, so a retry from here never meets the same refusal again.
	 *
	 * **This screen, the one a startup draws when it failed before a locale, and update recovery
	 * are the three that declare a tone**, and the recovery does not declare what the other two do.
	 * The first two are the same event said twice, once in the reader's language and once in
	 * whatever needs none, so they take the same tone. Everything on this block presents the application's own state, but
	 * these two are the states where the application is not working — and a failed startup is not
	 * the same event as an update that needs finishing.
	 */
	let {
		message = null,
		detail = null,
		onRetry
	}: {
		/** the reason, already in the reader's language; `null` where none was given. */
		message?: string | null;
		/** what the shell said behind it, in its own words. */
		detail?: string | null;
		onRetry: () => void;
	} = $props();

	/** the sentence, then the machine's words on the line under it. */
	const reason = $derived(
		[message, detail].filter((part): part is string => Boolean(part)).join('\n')
	);

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

	{#if reason}
		<DetailDisclosure detail={reason} name="startup" />
	{/if}
</StandaloneSurface>
