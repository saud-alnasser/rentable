<script lang="ts">
	import { type AvailableUpdate, type UpdaterDownloadEvent } from '$lib/platform/tauri';
	import { Button } from '$lib/design/primitive/button';
	import { Callout } from '$lib/design/primitive/callout';
	import * as Field from '$lib/design/primitive/field';
	import { formatLocaleDate } from '$lib/platform/locale';
	import { cn } from '$lib/design/tailwind.js';
	import { recordDiagnosticError } from '$lib/platform/diagnostics';
	import { toErrorDetail, toErrorText } from '$lib/error/message';
	import { toTauriErrorCode } from '$lib/error/tauri';
	import { showErrorToast } from '$lib/error/toast';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { useCheckForUpdate, usePrepareUpdate, useRestartApp } from '$lib/settings/query';
	import { onDestroy } from 'svelte';

	let { version }: { version: string } = $props();

	const checkForUpdateMutation = useCheckForUpdate();
	const prepareUpdateMutation = usePrepareUpdate();
	const restartAppMutation = useRestartApp();
	const settingsSubtlePanelClass = 'rounded-xl border bg-muted p-3 text-start';

	let isCheckingForUpdate = $state(false);
	let hasCheckedForUpdate = $state(false);
	let availableUpdate = $state<AvailableUpdate | null>(null);
	let updateCheckError = $state<string | null>(null);
	let isInstallingUpdate = $state(false);
	let updateInstallError = $state<string | null>(null);
	let updateInstallComplete = $state(false);
	let updateDownloadedBytes = $state(0);
	let updateContentLength = $state<number | null>(null);

	const updateProgressPercent = $derived.by(() => {
		if (!updateContentLength || updateContentLength <= 0) {
			return null;
		}

		return Math.min(100, Math.round((updateDownloadedBytes / updateContentLength) * 100));
	});

	onDestroy(() => {
		if (availableUpdate) {
			void availableUpdate.close();
		}
	});

	function logUpdaterError(action: string, error: unknown) {
		recordDiagnosticError('update.failed', {
			action,
			code: toTauriErrorCode(error),
			error: toErrorDetail(error)
		});
	}

	async function closeAvailableUpdate() {
		if (!availableUpdate) {
			return;
		}

		try {
			await availableUpdate.close();
		} catch {
			/* ignore */
		}
	}

	async function checkForUpdates() {
		if (isCheckingForUpdate || isInstallingUpdate) {
			return;
		}

		isCheckingForUpdate = true;
		updateCheckError = null;
		updateInstallError = null;
		updateInstallComplete = false;
		updateDownloadedBytes = 0;
		updateContentLength = null;

		try {
			const update = await checkForUpdateMutation.mutateAsync();

			await closeAvailableUpdate();
			availableUpdate = update;
			hasCheckedForUpdate = true;
		} catch (error) {
			logUpdaterError('check for updates', error);
			updateCheckError = toErrorText(error, $LL);
			hasCheckedForUpdate = true;
		}

		isCheckingForUpdate = false;
	}

	async function installUpdate() {
		const update = availableUpdate;

		if (!update || isInstallingUpdate) {
			return;
		}

		isInstallingUpdate = true;
		updateInstallError = null;
		updateInstallComplete = false;
		updateDownloadedBytes = 0;
		updateContentLength = null;

		try {
			await prepareUpdateMutation.mutateAsync({ targetVersion: update.version });

			await update.downloadAndInstall((event: UpdaterDownloadEvent) => {
				switch (event.event) {
					case 'Started':
						updateContentLength = event.data.contentLength ?? null;
						updateDownloadedBytes = 0;
						break;
					case 'Progress':
						updateDownloadedBytes += event.data.chunkLength;
						break;
					case 'Finished':
						if (updateContentLength) {
							updateDownloadedBytes = updateContentLength;
						}
						break;
				}
			});

			updateInstallComplete = true;
			availableUpdate = null;
			await update.close();
		} catch (error) {
			logUpdaterError('install update', error);
			updateInstallError = toErrorText(error, $LL);
		}

		isInstallingUpdate = false;
	}

	async function restartApp() {
		try {
			await restartAppMutation.mutateAsync();
		} catch (error) {
			showErrorToast(error, $LL);
		}
	}

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

<div class="space-y-4">
	<Field.Field orientation="responsive">
		<Field.Content>
			<!-- no title of its own: the group above is already called updates, and a row title
			     repeating its own section is the label the section had already given it. -->
			<Field.Description>{$LL.settings.updatesDescription()}</Field.Description>
			<!-- the version lives here and nowhere else on the page: the strip above used to
			     state it a second time, beside the section that owns it. -->
			<p class="text-xs text-muted-foreground tabular-nums">
				{$LL.common.labels.currentVersion()}: {version}
			</p>
		</Field.Content>
	</Field.Field>

	<div class="flex flex-wrap gap-3">
		<Button
			onclick={() => void checkForUpdates()}
			disabled={isCheckingForUpdate || isInstallingUpdate}
		>
			{isCheckingForUpdate
				? $LL.common.actions.checkingForUpdates()
				: $LL.common.actions.checkForUpdates()}
		</Button>

		{#if availableUpdate}
			<Button
				onclick={() => void installUpdate()}
				disabled={isInstallingUpdate || isCheckingForUpdate}
			>
				{isInstallingUpdate
					? $LL.common.actions.installingUpdate()
					: $LL.common.actions.downloadAndInstall()}
			</Button>
		{/if}
	</div>

	{#if isCheckingForUpdate}
		<Callout tone="info">{$LL.settings.updatesChecking()}</Callout>
	{:else if updateCheckError}
		<Callout tone="error">{updateCheckError}</Callout>
	{:else if availableUpdate}
		<Callout tone="info">
			{$LL.settings.releaseAvailable({ version: availableUpdate.version })}
		</Callout>
	{:else if hasCheckedForUpdate}
		<Callout tone="success">{$LL.settings.latestRelease()}</Callout>
	{/if}

	{#if availableUpdate}
		<div class={cn('space-y-3', settingsSubtlePanelClass)}>
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
				<div class="space-y-2 border-t pt-3">
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{$LL.common.labels.releaseNotes()}
					</p>
					<p class="text-sm whitespace-pre-wrap text-muted-foreground">{availableUpdate.body}</p>
				</div>
			{/if}
		</div>
	{/if}

	{#if isInstallingUpdate}
		<Callout tone="info">
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
		<Callout tone="error">{updateInstallError}</Callout>
	{/if}

	{#if updateInstallComplete}
		<Callout tone="success">{$LL.settings.restartNotice()}</Callout>
		<Button onclick={() => void restartApp()}>{$LL.common.actions.restartApp()}</Button>
	{/if}
</div>
