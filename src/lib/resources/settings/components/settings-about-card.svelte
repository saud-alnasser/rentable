<script lang="ts">
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import { formatLocaleDate } from '$lib/common/utils/locale';
	import { LL, locale } from '$lib/i18n/i18n-svelte';

	let {
		version,
		lastBackupAt,
		backupsCount,
		usingDefaultDatabasePath
	}: {
		version: string;
		lastBackupAt: number | null;
		backupsCount: number;
		usingDefaultDatabasePath: boolean;
	} = $props();

	const settingsCardClass = 'border-border/70 bg-card/65 shadow-xl backdrop-blur-xl';
	const settingsSubtlePanelClass =
		'rounded-xl border border-primary/10 bg-accent/35 p-3 text-start backdrop-blur-sm';

	function formatTimestamp(value: number | null | undefined) {
		if (!value) {
			return $LL.common.messages.never();
		}

		return formatLocaleDate($locale, value, {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
	}
</script>

<Card class={settingsCardClass}>
	<CardHeader class="gap-3 border-b border-border/50 pb-5">
		<CardTitle>{$LL.settings.aboutTitle()}</CardTitle>
		<CardDescription>{$LL.settings.aboutDescription()}</CardDescription>
	</CardHeader>
	<CardContent class="space-y-3 pt-5">
		<div class={settingsSubtlePanelClass}>
			<p class="text-xs tracking-wide text-muted-foreground uppercase">
				{$LL.common.labels.appVersion()}
			</p>
			<p class="mt-1 text-base font-semibold">{version}</p>
		</div>

		<div class={settingsSubtlePanelClass}>
			<p class="text-xs tracking-wide text-muted-foreground uppercase">
				{$LL.common.labels.lastBackupTime()}
			</p>
			<p class="mt-1 text-base font-semibold">{formatTimestamp(lastBackupAt)}</p>
		</div>

		<div class={settingsSubtlePanelClass}>
			<p class="text-xs tracking-wide text-muted-foreground uppercase">
				{$LL.common.labels.backupCount()}
			</p>
			<p class="mt-1 text-base font-semibold">{backupsCount}</p>
		</div>

		{#if usingDefaultDatabasePath}
			<p class="text-sm text-muted-foreground">{$LL.settings.usingDefaultDatabasePath()}</p>
		{:else}
			<p class="text-sm text-muted-foreground">{$LL.settings.usingCustomDatabasePath()}</p>
		{/if}
	</CardContent>
</Card>
