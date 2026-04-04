<script lang="ts">
	import { type AvailableUpdate } from '$lib/api/tauri';
	import { Button } from '$lib/common/components/fragments/button';
	import { Callout } from '$lib/common/components/fragments/callout';
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
		isCheckingForUpdate,
		isInstallingUpdate,
		hasCheckedForUpdate,
		availableUpdate,
		updateCheckError,
		updateInstallError,
		updateInstallComplete,
		updateDownloadedBytes,
		updateContentLength,
		updateProgressPercent,
		onCheckForUpdates,
		onInstallUpdate,
		onRestartApp
	}: {
		version: string;
		isCheckingForUpdate: boolean;
		isInstallingUpdate: boolean;
		hasCheckedForUpdate: boolean;
		availableUpdate: AvailableUpdate | null;
		updateCheckError: string | null;
		updateInstallError: string | null;
		updateInstallComplete: boolean;
		updateDownloadedBytes: number;
		updateContentLength: number | null;
		updateProgressPercent: number | null;
		onCheckForUpdates: () => void;
		onInstallUpdate: () => void;
		onRestartApp: () => void;
	} = $props();

	const settingsCardClass = 'border-border/70 bg-card/65 shadow-xl backdrop-blur-xl';
	const settingsSubtlePanelClass =
		'rounded-xl border border-primary/10 bg-accent/35 p-3 text-start backdrop-blur-sm';

	function formatReleaseDate(value: string | null | undefined) {
		if (!value) {
			return $LL.common.messages.unknown();
		}

		const date = new Date(value);

		return Number.isNaN(date.valueOf())
			? value
			: formatLocaleDate($locale, date, {
					dateStyle: 'medium',
					timeStyle: 'short'
				});
	}

	function formatBytes(value: number | null | undefined) {
		if (!value || value <= 0) {
			return null;
		}

		const units = ['B', 'KB', 'MB', 'GB'];
		let size = value;
		let unitIndex = 0;

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex += 1;
		}

		return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
	}
</script>

<Card class={settingsCardClass}>
	<CardHeader class="gap-3 border-b border-border/50 pb-5">
		<CardTitle>{$LL.settings.updatesTitle()}</CardTitle>
		<CardDescription>{$LL.settings.updatesDescription()}</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4 pt-5">
		<div class={settingsSubtlePanelClass}>
			<p class="text-xs tracking-wide text-muted-foreground uppercase">
				{$LL.common.labels.currentVersion()}
			</p>
			<p class="mt-1 text-base font-semibold">{version}</p>
		</div>

		<div class="flex flex-wrap gap-3">
			<Button onclick={onCheckForUpdates} disabled={isCheckingForUpdate || isInstallingUpdate}>
				{isCheckingForUpdate
					? $LL.common.actions.checkingForUpdates()
					: $LL.common.actions.checkForUpdates()}
			</Button>

			{#if availableUpdate}
				<Button onclick={onInstallUpdate} disabled={isInstallingUpdate || isCheckingForUpdate}>
					{isInstallingUpdate
						? $LL.common.actions.installingUpdate()
						: $LL.common.actions.downloadAndInstall()}
				</Button>
			{/if}
		</div>

		{#if isCheckingForUpdate}
			<Callout variant="info">{$LL.settings.updatesChecking()}</Callout>
		{:else if updateCheckError}
			<Callout variant="error">{updateCheckError}</Callout>
		{:else if availableUpdate}
			<Callout variant="info">
				{$LL.settings.releaseAvailable({ version: availableUpdate.version })}
			</Callout>
		{:else if hasCheckedForUpdate}
			<Callout variant="success">{$LL.settings.latestRelease()}</Callout>
		{/if}

		{#if availableUpdate}
			<div class={`space-y-3 ${settingsSubtlePanelClass}`}>
				<div class="grid gap-3 sm:grid-cols-2 [&>*]:text-start">
					<div>
						<p class="text-xs tracking-wide text-muted-foreground uppercase">
							{$LL.common.labels.availableVersion()}
						</p>
						<p class="mt-1 font-semibold">v{availableUpdate.version}</p>
					</div>
					<div>
						<p class="text-xs tracking-wide text-muted-foreground uppercase">
							{$LL.common.labels.releaseDate()}
						</p>
						<p class="mt-1 font-semibold">{formatReleaseDate(availableUpdate.date)}</p>
					</div>
				</div>

				{#if availableUpdate.body}
					<div class="space-y-2 border-t border-border/50 pt-3">
						<p class="text-xs tracking-wide text-muted-foreground uppercase">
							{$LL.common.labels.releaseNotes()}
						</p>
						<p class="text-sm whitespace-pre-wrap text-muted-foreground">{availableUpdate.body}</p>
					</div>
				{/if}
			</div>
		{/if}

		{#if isInstallingUpdate}
			<Callout variant="info">
				{$LL.settings.downloadingUpdate()}
				{#if formatBytes(updateDownloadedBytes)}
					({formatBytes(updateDownloadedBytes)}
					{#if formatBytes(updateContentLength)}
						/ {formatBytes(updateContentLength)}{/if})
				{/if}
				{#if updateProgressPercent !== null}
					· {updateProgressPercent}%
				{/if}
			</Callout>

			{#if updateProgressPercent !== null}
				<div class="h-2 overflow-hidden rounded-full bg-muted">
					<div
						class="h-full bg-primary transition-[width]"
						style={`width: ${updateProgressPercent}%`}
					></div>
				</div>
			{/if}
		{/if}

		{#if updateInstallError}
			<Callout variant="error">{updateInstallError}</Callout>
		{/if}

		{#if updateInstallComplete}
			<Callout variant="success">{$LL.settings.restartNotice()}</Callout>
			<Button onclick={onRestartApp}>{$LL.common.actions.restartApp()}</Button>
		{/if}
	</CardContent>
</Card>
