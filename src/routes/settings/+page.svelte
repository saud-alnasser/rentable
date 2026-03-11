<script lang="ts">
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
	import { Spinner } from '$lib/common/components/fragments/spinner';
	import {
		useCreateBackup,
		useDeleteBackup,
		useFetchSettings,
		useResetDatabasePath,
		useRestoreBackup,
		useSetDatabasePath,
		useSetEndingSoonNoticeDays
	} from '$lib/resources/settings/hooks/queries';
	import { onDestroy, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	const settingsQuery = useFetchSettings();
	const setEndingSoonNoticeDaysMutation = useSetEndingSoonNoticeDays();
	const setDatabasePathMutation = useSetDatabasePath();
	const resetDatabasePathMutation = useResetDatabasePath();
	const createBackupMutation = useCreateBackup();
	const deleteBackupMutation = useDeleteBackup();
	const restoreBackupMutation = useRestoreBackup();

	let endingSoonNoticeDaysValue = $state('');
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

	const hasEndingSoonChange = $derived.by(() => {
		const settings = settingsQuery.data;

		return settings
			? endingSoonNoticeDaysValue.trim() !== String(settings.endingSoonNoticeDays)
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

		endingSoonNoticeDaysValue = String(settings.endingSoonNoticeDays);
		databasePathValue = settings.usingDefaultDatabasePath ? '' : settings.currentDatabasePath;
	});

	onMount(() => {
		void checkForUpdates();
	});

	onDestroy(() => {
		if (availableUpdate) {
			void availableUpdate.close();
		}
	});

	function formatTimestamp(value: number | null | undefined) {
		if (!value) {
			return 'never';
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

		return 'unexpected error occurred!';
	}

	function logUpdaterError(action: string, error: unknown) {
		if (import.meta.env.DEV) {
			console.error(`[updater] ${action} failed`, error);
		}
	}

	function formatReleaseDate(value: string | null | undefined) {
		if (!value) {
			return 'unknown';
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
		} catch {}
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
			toast.error('ending soon notice window must be greater than zero');
			return;
		}

		try {
			await setEndingSoonNoticeDaysMutation.mutateAsync({ days });
		} catch {}
	}

	async function saveDatabasePath() {
		const trimmedPath = databasePathValue.trim();

		try {
			if (!trimmedPath) {
				await resetDatabasePathMutation.mutateAsync();
				return;
			}

			await setDatabasePathMutation.mutateAsync({ path: trimmedPath });
		} catch {}
	}

	async function resetDatabasePath() {
		databasePathValue = '';

		try {
			await resetDatabasePathMutation.mutateAsync();
		} catch {}
	}

	async function createBackup() {
		try {
			await createBackupMutation.mutateAsync();
		} catch {}
	}

	async function restoreBackup(name: string) {
		try {
			await restoreBackupMutation.mutateAsync({ name });
		} catch {}
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
		} catch {}
	}
</script>

<div class="flex flex-col gap-5 p-1">
	<div class="flex flex-col gap-1">
		<h1 class="text-3xl font-semibold tracking-tight">Settings</h1>
		<p class="text-sm text-muted-foreground">
			manage the ending-soon notice window, app updates, database path, backups, and app metadata.
		</p>
	</div>

	{#if settingsQuery.isLoading}
		<div class="flex min-h-full flex-1 items-center justify-center p-1">
			<div class="flex flex-col items-center gap-3">
				<Spinner class="size-8 text-muted-foreground" />
				<p class="text-sm text-muted-foreground">loading settings...</p>
			</div>
		</div>
	{:else if settingsQuery.error}
		<Card class="max-w-2xl">
			<CardHeader>
				<CardTitle>settings are unavailable right now</CardTitle>
				<CardDescription>
					there was a problem loading the current settings snapshot.
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				<p class="text-sm text-muted-foreground">{getErrorMessage(settingsQuery.error)}</p>
				<Button onclick={() => void settingsQuery.refetch()}>retry</Button>
			</CardContent>
		</Card>
	{:else if settingsQuery.data}
		<div class="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
			<div class="space-y-4">
				<Card>
					<CardHeader>
						<CardTitle>ending soon notice window</CardTitle>
						<CardDescription>
							choose how many days before contract end the dashboard should count as ending soon.
						</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						<div class="space-y-2">
							<Label for="ending-soon-notice-days">notice window (days)</Label>
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
								{setEndingSoonNoticeDaysMutation.isPending ? 'saving...' : 'save window'}
							</Button>
							<p class="text-sm text-muted-foreground">
								current value: {settingsQuery.data.endingSoonNoticeDays} day{settingsQuery.data
									.endingSoonNoticeDays === 1
									? ''
									: 's'}
							</p>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>database path and backups</CardTitle>
						<CardDescription>
							switch the active database, fall back to the default path, create backups, and restore
							a previous backup.
						</CardDescription>
					</CardHeader>
					<CardContent class="space-y-6">
						<div class="space-y-3">
							<div class="space-y-2">
								<Label>current database path</Label>
								<p class="rounded-lg border bg-muted/15 px-3 py-2 font-mono text-xs break-all">
									{settingsQuery.data.currentDatabasePath}
								</p>
							</div>

							<div class="space-y-2">
								<Label>default database path</Label>
								<p
									class="rounded-lg border bg-muted/15 px-3 py-2 font-mono text-xs break-all text-muted-foreground"
								>
									{settingsQuery.data.defaultDatabasePath}
								</p>
							</div>

							<div class="space-y-2">
								<Label for="database-path-override">custom database path override</Label>
								<Input
									id="database-path-override"
									bind:value={databasePathValue}
									placeholder="leave empty to use the default database path"
								/>
								<p class="text-sm text-muted-foreground">
									leaving this empty uses the default path above. saving reconnects immediately, and
									startup will run migrations again on the selected database path.
								</p>
							</div>

							<div class="flex flex-wrap items-center gap-3">
								<Button
									onclick={() => void saveDatabasePath()}
									disabled={isSavingDatabasePath || !hasDatabasePathChange}
								>
									{isSavingDatabasePath ? 'saving...' : 'save database path'}
								</Button>
								<Button
									variant="outline"
									onclick={() => void resetDatabasePath()}
									disabled={isSavingDatabasePath || settingsQuery.data.usingDefaultDatabasePath}
								>
									use default path
								</Button>
							</div>
						</div>

						<div class="space-y-3 border-t pt-6">
							<div class="flex flex-wrap items-center justify-between gap-3">
								<div>
									<h2 class="text-base font-semibold">create backup</h2>
									<p class="text-sm text-muted-foreground">
										backups are stored in the app backup directory and can be restored below.
										protected update backups are created automatically before app migrations.
									</p>
								</div>
								<Button onclick={() => void createBackup()} disabled={isManagingBackups}>
									{createBackupMutation.isPending ? 'creating backup...' : 'create backup'}
								</Button>
							</div>

							<div class="space-y-3">
								<h2 class="text-base font-semibold">restore backup</h2>
								{#if settingsQuery.data.backups.length === 0}
									<p class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
										no backups are available yet.
									</p>
								{:else}
									<div class="space-y-3">
										{#each settingsQuery.data.backups as backup (backup.name)}
											<div
												class="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/10 p-3"
											>
												<div class="min-w-0 space-y-1">
													<p class="font-medium break-all">{backup.name}</p>
													<p class="text-sm text-muted-foreground">
														created {formatTimestamp(backup.createdAt)}
														{#if backup.isProtected}
															· protected update backup
														{/if}
													</p>
												</div>
												<div class="flex flex-wrap items-center gap-2">
													<Button
														variant="outline"
														onclick={() => void restoreBackup(backup.name)}
														disabled={isManagingBackups}
													>
														{restoreBackupMutation.isPending ? 'restoring...' : 'restore'}
													</Button>
													{#if !backup.isProtected}
														<Button
															variant="destructive"
															onclick={() => openDeleteBackupDialog(backup.name)}
															disabled={isManagingBackups}
														>
															delete
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
								title="delete backup"
								description={backupToDelete
									? `are you sure you want to delete "${backupToDelete}"? this cannot be undone.`
									: 'are you sure you want to delete this backup? this cannot be undone.'}
								confirmLabel="delete"
								confirmLoadingLabel="deleting..."
								onSubmit={deleteBackup}
							/>
						</div>
					</CardContent>
				</Card>
			</div>

			<div class="space-y-4">
				<Card>
					<CardHeader>
						<CardTitle>app updates</CardTitle>
						<CardDescription>
							check GitHub Releases for a newer signed build. if startup later fails after an
							update, rentable will offer rollback to the protected pre-update backup.
						</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						<div class="rounded-lg border bg-muted/15 p-3">
							<p class="text-xs tracking-wide text-muted-foreground uppercase">current version</p>
							<p class="mt-1 text-base font-semibold">{settingsQuery.data.version}</p>
						</div>

						<div class="flex flex-wrap gap-3">
							<Button
								onclick={() => void checkForUpdates()}
								disabled={isCheckingForUpdate || isInstallingUpdate}
							>
								{isCheckingForUpdate ? 'checking for updates...' : 'check for updates'}
							</Button>

							{#if availableUpdate}
								<Button onclick={() => void installUpdate()} disabled={isInstallingUpdate}>
									{isInstallingUpdate ? 'installing update...' : 'download & install'}
								</Button>
							{/if}
						</div>

						{#if updateCheckError}
							<Callout variant="error">{updateCheckError}</Callout>
						{:else if availableUpdate}
							<Callout variant="info">
								update v{availableUpdate.version} is available.
							</Callout>
						{:else if hasCheckedForUpdate}
							<Callout variant="success">you’re already on the latest release.</Callout>
						{/if}

						{#if availableUpdate}
							<div class="space-y-3 rounded-lg border bg-muted/10 p-3">
								<div class="grid gap-3 sm:grid-cols-2">
									<div>
										<p class="text-xs tracking-wide text-muted-foreground uppercase">
											available version
										</p>
										<p class="mt-1 font-semibold">v{availableUpdate.version}</p>
									</div>
									<div>
										<p class="text-xs tracking-wide text-muted-foreground uppercase">
											release date
										</p>
										<p class="mt-1 font-semibold">{formatReleaseDate(availableUpdate.date)}</p>
									</div>
								</div>

								{#if availableUpdate.body}
									<div class="space-y-2 border-t pt-3">
										<p class="text-xs tracking-wide text-muted-foreground uppercase">
											release notes
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
								downloading update
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
								the update has been installed. on Windows the app may close automatically during
								installation; otherwise restart rentable to finish switching versions.
							</Callout>

							<Button onclick={() => void restartApp()}>restart app</Button>
						{/if}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>about</CardTitle>
						<CardDescription
							>current app metadata and recent sync/backup timestamps.</CardDescription
						>
					</CardHeader>
					<CardContent class="space-y-3">
						<div class="rounded-lg border bg-muted/15 p-3">
							<p class="text-xs tracking-wide text-muted-foreground uppercase">app version</p>
							<p class="mt-1 text-base font-semibold">{settingsQuery.data.version}</p>
						</div>

						<div class="rounded-lg border bg-muted/15 p-3">
							<p class="text-xs tracking-wide text-muted-foreground uppercase">last sync time</p>
							<p class="mt-1 text-base font-semibold">
								{formatTimestamp(settingsQuery.data.lastSyncAt)}
							</p>
						</div>

						<div class="rounded-lg border bg-muted/15 p-3">
							<p class="text-xs tracking-wide text-muted-foreground uppercase">last backup time</p>
							<p class="mt-1 text-base font-semibold">
								{formatTimestamp(settingsQuery.data.lastBackupAt)}
							</p>
						</div>

						<div class="rounded-lg border bg-muted/15 p-3">
							<p class="text-xs tracking-wide text-muted-foreground uppercase">backup count</p>
							<p class="mt-1 text-base font-semibold">{settingsQuery.data.backups.length}</p>
						</div>

						{#if settingsQuery.data.usingDefaultDatabasePath}
							<p class="text-sm text-muted-foreground">
								the app is currently using the default database path.
							</p>
						{:else}
							<p class="text-sm text-muted-foreground">
								the app is currently using a custom database path override.
							</p>
						{/if}
					</CardContent>
				</Card>
			</div>
		</div>
	{/if}
</div>
