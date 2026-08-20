<script lang="ts">
	import StandaloneSurface from '$lib/design/block/standalone-surface.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import LayoutSurfaceAction from '$lib/layout/component/surface-action.svelte';
	import { tauri, type Recovery } from '$lib/platform/tauri';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	/**
	 * An update did not finish, and the application is back on the version before it.
	 *
	 * **It keeps its figures where the startup-failure screen lost its body**, and the difference
	 * is what the reader does with them: a version number is a fact somebody reads off the screen
	 * and repeats — into a support message, a release page, a note to themselves. A stack trace is
	 * not. So two plates, **the previous version first and the one it was upgrading to second**,
	 * which is the order asked for on 2026-08-20: the reader is standing on the first and was
	 * heading for the second.
	 *
	 * See `startup-error.svelte` for why these two are the only screens on this block that declare
	 * a tone, and why they do not declare the same one.
	 */
	let {
		recovery,
		onRetry
	}: {
		recovery: Recovery;
		onRetry: () => void;
	} = $props();

	const previousReleaseUrl = $derived(recovery.previousReleaseUrl);
</script>

{#snippet plate(label: string, value: string)}
	<div class="rounded-xl bg-muted p-3">
		<dt class="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
		<dd class="mt-1 text-sm font-medium break-words">{value}</dd>
	</div>
{/snippet}

<!-- `info` in tone and a download in subject: the tone decides the colour, the glyph decides the
     picture. An information circle here would say *here is a fact* where this says *an update was
     being installed*. -->
<StandaloneSurface
	tone="info"
	icon={DownloadIcon}
	title={$LL.layout.startup.recoveryRequiredTitle()}
>
	{#snippet corner()}
		{#if previousReleaseUrl}
			<LayoutSurfaceAction
				label={$LL.common.actions.openPreviousRelease()}
				icon={ExternalLinkIcon}
				onclick={() => void tauri.opener.openUrl(previousReleaseUrl)}
			/>
		{/if}

		<!-- the glyph turns under the pointer, which previews what pressing it does. -->
		<LayoutSurfaceAction
			label={$LL.common.actions.retryStartup()}
			icon={RefreshCwIcon}
			emphasis="primary"
			spins
			onclick={onRetry}
		/>
	{/snippet}

	<div class="space-y-4">
		<dl class="grid gap-2 sm:grid-cols-2">
			{@render plate(
				$LL.layout.startup.previousVersion(),
				recovery.previousVersion || $LL.common.messages.unknown()
			)}
			{@render plate(
				$LL.layout.startup.factUpdatingTo(),
				recovery.targetVersion || $LL.common.messages.unknown()
			)}
		</dl>

		<!-- **The sentence names no version, and the plate above is why.** It read *reinstall
		     v{previousVersion}* and printed the same number the first plate already carries, which
		     is the figure stated twice that requirement 13 exists to remove. The plate is the
		     figure's home, so the sentence points at it rather than repeating it. -->
		<p class="text-sm text-muted-foreground">
			{$LL.layout.startup.recoveryDetails()}
		</p>

		{#if recovery.updateError}
			<p class="text-sm text-destructive">{recovery.updateError}</p>
		{/if}
	</div>
</StandaloneSurface>
