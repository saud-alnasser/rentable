<script lang="ts">
	import DeleteDialog from '$lib/common/components/blocks/delete-dialog.svelte';
	import { Button } from '$lib/common/components/fragments/button';
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
		return error instanceof Error ? error.message : 'unexpected error occurred!';
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
			manage the ending-soon notice window, database path, backups, and app metadata.
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

			<Card>
				<CardHeader>
					<CardTitle>about</CardTitle>
					<CardDescription>current app metadata and recent sync/backup timestamps.</CardDescription>
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
	{/if}
</div>
