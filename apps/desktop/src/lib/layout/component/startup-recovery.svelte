<script lang="ts">
	import { tauri, type Recovery } from '$lib/platform/tauri';
	import StandaloneSurface from '$lib/design/block/standalone-surface.svelte';
	import { Button } from '$lib/design/primitive/button';
	import { Callout } from '$lib/design/primitive/callout';
	import { LL } from '$lib/i18n/i18n-svelte';

	let {
		recovery,
		onRetry
	}: {
		recovery: Recovery;
		onRetry: () => void;
	} = $props();
</script>

<StandaloneSurface
	title={$LL.layout.startup.recoveryRequiredTitle()}
	description={$LL.layout.startup.recoveryDescription({
		version: recovery.targetVersion || $LL.common.messages.unknown()
	})}
>
	<div class="space-y-4">
		{#if recovery.updateError}
			<Callout variant="error">{recovery.updateError}</Callout>
		{/if}

		<div class="rounded-xl bg-muted p-3">
			<p class="text-xs tracking-wide text-muted-foreground uppercase">
				{$LL.layout.startup.previousVersion()}
			</p>
			<p class="mt-1 font-medium">{recovery.previousVersion || $LL.common.messages.unknown()}</p>
		</div>

		<p class="text-sm text-muted-foreground">
			{$LL.layout.startup.recoveryDetails({
				previousVersion: recovery.previousVersion || $LL.common.messages.unknown()
			})}
		</p>
	</div>

	{#snippet actions()}
		<Button
			variant="outline"
			onclick={() => {
				if (recovery.previousReleaseUrl) {
					void tauri.opener.openUrl(recovery.previousReleaseUrl);
				}
			}}
			disabled={!recovery.previousReleaseUrl}
		>
			{$LL.common.actions.openPreviousRelease()}
		</Button>
		<Button onclick={onRetry}>{$LL.common.actions.retryStartup()}</Button>
	{/snippet}
</StandaloneSurface>
