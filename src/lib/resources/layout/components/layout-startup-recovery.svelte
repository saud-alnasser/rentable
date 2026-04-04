<script lang="ts">
	import { tauri, type Recovery } from '$lib/api/tauri';
	import { Button } from '$lib/common/components/fragments/button';
	import { Callout } from '$lib/common/components/fragments/callout';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import { LL } from '$lib/i18n/i18n-svelte';

	let {
		recovery,
		onRetry
	}: {
		recovery: Recovery;
		onRetry: () => void;
	} = $props();
</script>

<div class="flex min-h-full flex-1 items-center justify-center p-1">
	<Card class="w-full max-w-2xl gap-4">
		<CardHeader>
			<CardTitle>{$LL.layout.startup.recoveryRequiredTitle()}</CardTitle>
			<CardDescription>
				{$LL.layout.startup.recoveryDescription({
					version: recovery.targetVersion || $LL.common.messages.unknown()
				})}
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if recovery.updateError}
				<Callout variant="error">{recovery.updateError}</Callout>
			{/if}

			<div class="grid gap-3 sm:grid-cols-2">
				<div class="rounded-lg border bg-muted/15 p-3">
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{$LL.layout.startup.startupRecoveryBackup()}
					</p>
					<p class="mt-1 font-medium break-all">{recovery.backupFilename}</p>
				</div>
				<div class="rounded-lg border bg-muted/15 p-3">
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{$LL.layout.startup.previousVersion()}
					</p>
					<p class="mt-1 font-medium">
						{recovery.backupVersion || $LL.common.messages.unknown()}
					</p>
				</div>
			</div>

			<p class="text-sm text-muted-foreground">
				{$LL.layout.startup.recoveryDetails({
					backupVersion: recovery.backupVersion || $LL.common.messages.unknown()
				})}
			</p>

			<div class="flex flex-wrap gap-3">
				<Button onclick={onRetry}>{$LL.common.actions.retryStartup()}</Button>
				<Button
					variant="outline"
					onclick={() => {
						if (recovery.backupReleaseUrl) {
							void tauri.opener.openUrl(recovery.backupReleaseUrl);
						}
					}}
					disabled={!recovery.backupReleaseUrl}
				>
					{$LL.common.actions.openPreviousRelease()}
				</Button>
			</div>
		</CardContent>
	</Card>
</div>
