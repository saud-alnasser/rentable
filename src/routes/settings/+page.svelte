<script lang="ts">
	import api from '$lib/api/mod';
	import { tauri, type AvailableUpdate, type UpdaterDownloadEvent } from '$lib/api/tauri';
	import DeleteDialog from '$lib/common/components/blocks/delete-dialog.svelte';
	import { Button } from '$lib/common/components/fragments/button';
	import { Callout } from '$lib/common/components/fragments/callout';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import { Input } from '$lib/common/components/fragments/input';
	import { Label } from '$lib/common/components/fragments/label';
	import * as Select from '$lib/common/components/fragments/select';
	import { Spinner } from '$lib/common/components/fragments/spinner';
	import { LL, locale, setLocale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import type { Locales } from '$lib/i18n/i18n-types';
	import { locales } from '$lib/i18n/i18n-util';
	import {
		useCreateBackup,
		useDeleteBackup,
		useFetchSettings,
		useResetDatabasePath,
		useRestoreBackup,
		useSetDatabasePath,
		useSetEndingSoonNoticeDays
	} from '$lib/resources/settings/hooks/queries';
	import { onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';

	const settingsQuery = useFetchSettings();
	const setEndingSoonNoticeDaysMutation = useSetEndingSoonNoticeDays();
	const setDatabasePathMutation = useSetDatabasePath();
	const resetDatabasePathMutation = useResetDatabasePath();
	const createBackupMutation = useCreateBackup();
	const deleteBackupMutation = useDeleteBackup();
	const restoreBackupMutation = useRestoreBackup();

	let endingSoonNoticeDaysValue = $state<number | ''>('');
	let databasePathValue = $state('');
	let isDeleteBackupDialogOpen = $state(false);
	let backupToDelete = $state<string | null>(null);
	let isCheckingForUpdate = $state(false);
	let hasCheckedForUpdate = $state(false);
	let availableUpdate = $state<AvailableUpdate | null>(null);
	let updateCheckError = $state<string | null>(null);
	let isInstallingUpdate = $state(false);
	let updateInstallError = $state<string | null>(null);
	let updateInstallComplete = $state(false);
	let updateDownloadedBytes = $state(0);
	let updateContentLength = $state<number | null>(null);

	const isSavingDatabasePath = $derived.by(
		() => setDatabasePathMutation.isPending || resetDatabasePathMutation.isPending
	);

	const isManagingBackups = $derived.by(
		() =>
			createBackupMutation.isPending ||
			deleteBackupMutation.isPending ||
			restoreBackupMutation.isPending
	);

	const getEndingSoonNoticeDaysInputValue = () =>
		typeof endingSoonNoticeDaysValue === 'number'
			? String(endingSoonNoticeDaysValue)
			: endingSoonNoticeDaysValue.trim();

	const hasEndingSoonChange = $derived.by(() => {
		const settings = settingsQuery.data;

		return settings
			? getEndingSoonNoticeDaysInputValue() !== String(settings.endingSoonNoticeDays)
			: false;
	});

	const hasDatabasePathChange = $derived.by(() => {
		const settings = settingsQuery.data;
		const trimmedPath = databasePathValue.trim();

		if (!settings) {
			return false;
		}

		return trimmedPath
			? trimmedPath !== settings.currentDatabasePath
			: !settings.usingDefaultDatabasePath;
	});

	const updateProgressPercent = $derived.by(() => {
		if (!updateContentLength || updateContentLength <= 0) {
			return null;
		}

		return Math.min(100, Math.round((updateDownloadedBytes / updateContentLength) * 100));
	});

	$effect(() => {
		const settings = settingsQuery.data;
		const isMutating =
			setEndingSoonNoticeDaysMutation.isPending ||
			setDatabasePathMutation.isPending ||
			resetDatabasePathMutation.isPending;

		if (!settings || isMutating) {
			return;
		}

		endingSoonNoticeDaysValue = settings.endingSoonNoticeDays;
		databasePathValue = settings.usingDefaultDatabasePath ? '' : settings.currentDatabasePath;
	});

	onDestroy(() => {
		if (availableUpdate) {
			void availableUpdate.close();
		}
	});

	function formatTimestamp(value: number | null | undefined) {
		if (!value) {
			return $LL.common.messages.never();
		}

		return new Intl.DateTimeFormat('en-GB', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}

	function getErrorMessage(error: unknown) {
		if (error instanceof Error && error.message.trim()) {
			return error.message;
		}

		if (typeof error === 'string' && error.trim()) {
			return error;
		}

		if (error && typeof error === 'object' && 'message' in error) {
			const message = error.message;

			if (typeof message === 'string' && message.trim()) {
				return message;
			}
		}

		return $LL.common.messages.unexpectedError();
	}

	function logUpdaterError(action: string, error: unknown) {
		if (import.meta.env.DEV) {
			console.error(`[updater] ${action} failed`, error);
		}
	}

	function formatReleaseDate(value: string | null | undefined) {
		if (!value) {
			return $LL.common.messages.unknown();
		}

		const date = new Date(value);

		return Number.isNaN(date.valueOf())
			? value
			: new Intl.DateTimeFormat('en-GB', {
					dateStyle: 'medium',
					timeStyle: 'short'
				}).format(date);
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
			const update = await tauri.updater.check();

			await closeAvailableUpdate();
			availableUpdate = update;
			hasCheckedForUpdate = true;
		} catch (error) {
			logUpdaterError('check for updates', error);
			updateCheckError = getErrorMessage(error);
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
			updateInstallError = getErrorMessage(error);
		}

		isInstallingUpdate = false;
	}

	async function restartApp() {
		try {
			await tauri.window.restart();
		} catch (error) {
			toast.error(getErrorMessage(error));
		}
	}

	async function saveEndingSoonNoticeDays() {
		const days = Number(endingSoonNoticeDaysValue);

		if (!Number.isInteger(days) || days <= 0) {
			toast.error($LL.settings.endingSoonInvalid());
			return;
		}

		try {
			await setEndingSoonNoticeDaysMutation.mutateAsync({ days });
		} catch {
			/* ignore */
		}
	}

	async function saveDatabasePath() {
		const trimmedPath = databasePathValue.trim();

		try {
			if (!trimmedPath) {
				await resetDatabasePathMutation.mutateAsync();
				return;
			}

			await setDatabasePathMutation.mutateAsync({ path: trimmedPath });
		} catch {
			/* ignore */
		}
	}

	async function resetDatabasePath() {
		databasePathValue = '';

		try {
			await resetDatabasePathMutation.mutateAsync();
		} catch {
			/* ignore */
		}
	}

	async function createBackup() {
		try {
			await createBackupMutation.mutateAsync();
		} catch {
			/* ignore */
		}
	}

	async function restoreBackup(name: string) {
		try {
			await restoreBackupMutation.mutateAsync({ name });
		} catch {
			/* ignore */
		}
	}

	function openDeleteBackupDialog(name: string) {
		backupToDelete = name;
		isDeleteBackupDialogOpen = true;
	}

	async function deleteBackup() {
		if (!backupToDelete) {
			return;
		}

		try {
			await deleteBackupMutation.mutateAsync({ name: backupToDelete });
			backupToDelete = null;
		} catch {
			/* ignore */
		}
	}
</script>

<div class="flex flex-col gap-5 p-1">
	<div class="flex flex-col gap-1">
		<h1 class="text-3xl font-semibold tracking-tight">{$LL.settings.title()}</h1>
		<p class="text-sm text-muted-foreground">
			{$LL.settings.description()}
		</p>
	</div>

	{#if settingsQuery.isLoading}
		<div class="flex min-h-full flex-1 items-center justify-center p-1">
			<div class="flex flex-col items-center gap-3">
				<Spinner class="size-8 text-muted-foreground" />
				<p class="text-sm text-muted-foreground">{$LL.common.messages.loadingSettings()}</p>
			</div>
		</div>
	{:else if settingsQuery.error}
		<Card class="max-w-2xl">
			<CardHeader>
				<CardTitle>{$LL.settings.loadErrorTitle()}</CardTitle>
				<CardDescription>
					{$LL.settings.loadErrorDescription()}
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				<p class="text-sm text-muted-foreground">{getErrorMessage(settingsQuery.error)}</p>
				<Button onclick={() => void settingsQuery.refetch()}>{$LL.common.actions.retry()}</Button>
			</CardContent>
		</Card>
	{:else if settingsQuery.data}
		<div class="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
			<div class="space-y-4">
				<Card>
					<CardHeader>
						<CardTitle>{$LL.settings.endingSoonTitle()}</CardTitle>
						<CardDescription>
							{$LL.settings.endingSoonDescription()}
						</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						<div class="space-y-2">
							<Label for="ending-soon-notice-days">{$LL.common.labels.noticeWindowDays()}</Label>
							<Input
								id="ending-soon-notice-days"
								type="number"
								min="1"
								step="1"
								bind:value={endingSoonNoticeDaysValue}
							/>
						</div>

						<div class="flex flex-wrap items-center gap-3">
							<Button
								onclick={() => void saveEndingSoonNoticeDays()}
								disabled={setEndingSoonNoticeDaysMutation.isPending || !hasEndingSoonChange}
							>
								{setEndingSoonNoticeDaysMutation.isPending
									? $LL.common.actions.saving()
									: $LL.common.actions.saveWindow()}
							</Button>
							<p class="text-sm text-muted-foreground">
								{$LL.common.labels.currentValue()}: {settingsQuery.data.endingSoonNoticeDays === 1
									? $LL.common.time.day({ count: settingsQuery.data.endingSoonNoticeDays })
									: $LL.common.time.days({ count: settingsQuery.data.endingSoonNoticeDays })}
							</p>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{$LL.settings.databaseTitle()}</CardTitle>
						<CardDescription>
							{$LL.settings.databaseDescription()}
						</CardDescription>
					</CardHeader>
					<CardContent class="space-y-6">
						<div class="space-y-3">
							<div class="space-y-2">
								<Label>{$LL.common.labels.currentDatabasePath()}</Label>
								<p class="rounded-lg border bg-muted/15 px-3 py-2 font-mono text-xs break-all">
									{settingsQuery.data.currentDatabasePath}
								</p>
							</div>

							<div class="space-y-2">
								<Label>{$LL.common.labels.defaultDatabasePath()}</Label>
								<p
									class="rounded-lg border bg-muted/15 px-3 py-2 font-mono text-xs break-all text-muted-foreground"
								>
									{settingsQuery.data.defaultDatabasePath}
								</p>
							</div>

							<div class="space-y-2">
								<Label for="database-path-override"
									>{$LL.common.labels.customDatabasePathOverride()}</Label
								>
								<Input
									id="database-path-override"
									bind:value={databasePathValue}
									placeholder={$LL.settings.pathOverridePlaceholder()}
								/>
								<p class="text-sm text-muted-foreground">
									{$LL.settings.pathOverrideDescription()}
								</p>
							</div>

							<div class="flex flex-wrap items-center gap-3">
								<Button
									onclick={() => void saveDatabasePath()}
									disabled={isSavingDatabasePath || !hasDatabasePathChange}
								>
									{isSavingDatabasePath
										? $LL.common.actions.saving()
										: $LL.common.actions.saveDatabasePath()}
								</Button>
								<Button
									variant="outline"
									onclick={() => void resetDatabasePath()}
									disabled={isSavingDatabasePath || settingsQuery.data.usingDefaultDatabasePath}
								>
									{$LL.common.actions.useDefaultPath()}
								</Button>
							</div>
						</div>

						<div class="space-y-3 border-t pt-6">
							<div class="flex flex-wrap items-center justify-between gap-3">
								<div>
									<h2 class="text-base font-semibold">{$LL.settings.createBackupTitle()}</h2>
									<p class="text-sm text-muted-foreground">
										{$LL.settings.createBackupDescription()}
									</p>
								</div>
								<Button onclick={() => void createBackup()} disabled={isManagingBackups}>
									{createBackupMutation.isPending
										? $LL.common.actions.creatingBackup()
										: $LL.common.actions.createBackup()}
								</Button>
							</div>

							<div class="space-y-3">
								<h2 class="text-base font-semibold">{$LL.settings.restoreBackupTitle()}</h2>
								{#if settingsQuery.data.backups.length === 0}
									<p class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
										{$LL.settings.noBackups()}
									</p>
								{:else}
									<div class="space-y-3">
										{#each settingsQuery.data.backups as backup (`${backup.name}-${backup.createdAt}`)}
											<div
												class="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/10 p-3"
											>
												<div class="min-w-0 space-y-1">
													<p class="font-medium break-all">{backup.name}</p>
													<p class="text-sm text-muted-foreground">
														{$LL.settings.createdAt({ value: formatTimestamp(backup.createdAt) })}
														{#if backup.isProtected}
															· {$LL.settings.protectedUpdateBackup()}
														{/if}
													</p>
												</div>
												<div class="flex flex-wrap items-center gap-2">
													<Button
														variant="outline"
														onclick={() => void restoreBackup(backup.name)}
														disabled={isManagingBackups}
													>
														{restoreBackupMutation.isPending
															? $LL.common.actions.restoring()
															: $LL.common.actions.restore()}
													</Button>
													{#if !backup.isProtected}
														<Button
															variant="destructive"
															onclick={() => openDeleteBackupDialog(backup.name)}
															disabled={isManagingBackups}
														>
															{$LL.common.actions.delete()}
														</Button>
													{/if}
												</div>
											</div>
										{/each}
									</div>
								{/if}
							</div>

							<DeleteDialog
								open={isDeleteBackupDialogOpen}
								onOpenChange={(isOpen) => {
									isDeleteBackupDialogOpen = isOpen;

									if (!isOpen) {
										backupToDelete = null;
									}
								}}
								title={$LL.settings.deleteBackupTitle()}
								description={backupToDelete
									? $LL.settings.deleteBackupNamedDescription({ name: backupToDelete })
									: $LL.settings.deleteBackupDescription()}
								confirmLabel={$LL.common.actions.delete()}
								confirmLoadingLabel={$LL.common.actions.deleting()}
								onSubmit={deleteBackup}
							/>
						</div>
					</CardContent>
				</Card>
			</div>

			<div class="space-y-4">
				<Card>
					<CardHeader>
						<CardTitle>{$LL.settings.localeTitle()}</CardTitle>
						<CardDescription>
							{$LL.settings.localeDescription()}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div class="space-y-2">
							<Label for="app-locale">{$LL.settings.localeLabel()}</Label>
							<Select.Root
								type="single"
								value={$locale}
								onValueChange={async (v) => {
									if (!v) return;
									const next = v as Locales;
									if (next === $locale) return;
									setLocale(next);
									await api.settings.setLocale({ locale: next });
								}}
							>
								<Select.Trigger id="app-locale" class="w-full capitalize">
									{localesMetadata[$locale].label}
								</Select.Trigger>
								<Select.Content>
									{#each locales as loc (loc)}
										<Select.Item value={loc} label={localesMetadata[loc].label} class="capitalize">
											{localesMetadata[loc].label}
										</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{$LL.settings.updatesTitle()}</CardTitle>
						<CardDescription>
							{$LL.settings.updatesDescription()}
						</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						<div class="rounded-lg border bg-muted/15 p-3">
							<p class="text-xs tracking-wide text-muted-foreground uppercase">
								{$LL.common.labels.currentVersion()}
							</p>
							<p class="mt-1 text-base font-semibold">{settingsQuery.data.version}</p>
						</div>

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
							<div class="space-y-3 rounded-lg border bg-muted/10 p-3">
								<div class="grid gap-3 sm:grid-cols-2">
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
										<p class="text-sm whitespace-pre-wrap text-muted-foreground">
											{availableUpdate.body}
										</p>
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
							<Callout variant="success">
								{$LL.settings.restartNotice()}
							</Callout>

							<Button onclick={() => void restartApp()}>{$LL.common.actions.restartApp()}</Button>
						{/if}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{$LL.settings.aboutTitle()}</CardTitle>
						<CardDescription>{$LL.settings.aboutDescription()}</CardDescription>
					</CardHeader>
					<CardContent class="space-y-3">
						<div class="rounded-lg border bg-muted/15 p-3">
							<p class="text-xs tracking-wide text-muted-foreground uppercase">
								{$LL.common.labels.appVersion()}
							</p>
							<p class="mt-1 text-base font-semibold">{settingsQuery.data.version}</p>
						</div>

						<div class="rounded-lg border bg-muted/15 p-3">
							<p class="text-xs tracking-wide text-muted-foreground uppercase">
								{$LL.common.labels.lastSyncTime()}
							</p>
							<p class="mt-1 text-base font-semibold">
								{formatTimestamp(settingsQuery.data.lastSyncAt)}
							</p>
						</div>

						<div class="rounded-lg border bg-muted/15 p-3">
							<p class="text-xs tracking-wide text-muted-foreground uppercase">
								{$LL.common.labels.lastBackupTime()}
							</p>
							<p class="mt-1 text-base font-semibold">
								{formatTimestamp(settingsQuery.data.lastBackupAt)}
							</p>
						</div>

						<div class="rounded-lg border bg-muted/15 p-3">
							<p class="text-xs tracking-wide text-muted-foreground uppercase">
								{$LL.common.labels.backupCount()}
							</p>
							<p class="mt-1 text-base font-semibold">{settingsQuery.data.backups.length}</p>
						</div>

						{#if settingsQuery.data.usingDefaultDatabasePath}
							<p class="text-sm text-muted-foreground">
								{$LL.settings.usingDefaultDatabasePath()}
							</p>
						{:else}
							<p class="text-sm text-muted-foreground">
								{$LL.settings.usingCustomDatabasePath()}
							</p>
						{/if}
					</CardContent>
				</Card>
			</div>
		</div>
	{/if}
</div>
