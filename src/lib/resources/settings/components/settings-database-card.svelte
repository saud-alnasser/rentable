<script lang="ts">
	import api from '$lib/api/mod';
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
	import { formatLocaleDate } from '$lib/common/utils/locale';
	import { cn } from '$lib/common/utils/tailwind.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';

	type AppSettings = Awaited<ReturnType<typeof api.app.settings.get>>;
	type BackupItem = Awaited<ReturnType<typeof api.app.backup.list>>[number];

	let {
		settings,
		backups,
		databasePathValue = $bindable(),
		isSavingDatabasePath,
		hasDatabasePathChange,
		isUsingDefaultDatabasePath,
		isManagingBackups,
		isCreatingBackup,
		isRestoringBackup,
		onSaveDatabasePath,
		onResetDatabasePath,
		onCreateBackup,
		onRestoreBackup,
		onDeleteBackup
	}: {
		settings: AppSettings;
		backups: BackupItem[];
		databasePathValue: string;
		isSavingDatabasePath: boolean;
		hasDatabasePathChange: boolean;
		isUsingDefaultDatabasePath: boolean;
		isManagingBackups: boolean;
		isCreatingBackup: boolean;
		isRestoringBackup: boolean;
		onSaveDatabasePath: () => void;
		onResetDatabasePath: () => void;
		onCreateBackup: () => void;
		onRestoreBackup: (name: string) => void;
		onDeleteBackup: (name: string) => Promise<void> | void;
	} = $props();

	const settingsCardClass = 'border-border/70 bg-card/65 shadow-xl backdrop-blur-xl';
	const settingsInsetPanelClass =
		'rounded-[1.25rem] border border-border/70 bg-background/60 p-4 text-start shadow-sm backdrop-blur-md';
	const settingsSubtlePanelClass =
		'rounded-xl border border-primary/10 bg-accent/35 p-3 text-start backdrop-blur-sm';

	let isDeleteBackupDialogOpen = $state(false);
	let backupToDelete = $state<string | null>(null);

	const getCurrentDatabasePath = (appSettings: AppSettings) =>
		appSettings.activeDatabasePath ?? appSettings.defaultDatabasePath;
	const canDeleteBackup = (filename: string) =>
		backups.some((backup) => backup.filename === filename && !backup.isProtected);

	function formatTimestamp(value: number | null | undefined) {
		if (!value) {
			return $LL.common.messages.never();
		}

		return formatLocaleDate($locale, value, {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
	}

	function openDeleteBackupDialog(name: string) {
		if (!canDeleteBackup(name)) {
			return;
		}

		backupToDelete = name;
		isDeleteBackupDialogOpen = true;
	}

	async function deleteBackup() {
		if (!backupToDelete || !canDeleteBackup(backupToDelete)) {
			return;
		}

		await onDeleteBackup(backupToDelete);
		backupToDelete = null;
	}
</script>

<Card class={settingsCardClass}>
	<CardHeader class="gap-3 border-b border-border/50 pb-5">
		<CardTitle>{$LL.settings.databaseTitle()}</CardTitle>
		<CardDescription>{$LL.settings.databaseDescription()}</CardDescription>
	</CardHeader>
	<CardContent class="space-y-6 pt-5">
		<div class="space-y-3">
			<div class={cn(settingsInsetPanelClass, 'space-y-2')}>
				<Label>{$LL.common.labels.currentDatabasePath()}</Label>
				<p
					class="rounded-lg border border-border/60 bg-muted/12 px-3 py-2 font-mono text-xs break-all"
				>
					{getCurrentDatabasePath(settings)}
				</p>
			</div>

			<div class={cn(settingsInsetPanelClass, 'space-y-2')}>
				<Label>{$LL.common.labels.defaultDatabasePath()}</Label>
				<p
					class="rounded-lg border border-border/60 bg-muted/12 px-3 py-2 font-mono text-xs break-all text-muted-foreground"
				>
					{settings.defaultDatabasePath}
				</p>
			</div>

			<div class={cn(settingsInsetPanelClass, 'space-y-2')}>
				<Label for="database-path-override">{$LL.common.labels.customDatabasePathOverride()}</Label>
				<Input
					id="database-path-override"
					bind:value={databasePathValue}
					placeholder={$LL.settings.pathOverridePlaceholder()}
				/>
				<p class="text-sm text-muted-foreground">{$LL.settings.pathOverrideDescription()}</p>
			</div>

			<div class="flex flex-wrap items-center gap-3">
				<Button
					onclick={onSaveDatabasePath}
					disabled={isSavingDatabasePath || !hasDatabasePathChange}
				>
					{isSavingDatabasePath
						? $LL.common.actions.saving()
						: $LL.common.actions.saveDatabasePath()}
				</Button>
				<Button
					variant="outline"
					onclick={onResetDatabasePath}
					disabled={isSavingDatabasePath || isUsingDefaultDatabasePath}
				>
					{$LL.common.actions.useDefaultPath()}
				</Button>
			</div>
		</div>

		<div class="space-y-3 border-t border-border/50 pt-6">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 class="text-base font-semibold">{$LL.settings.createBackupTitle()}</h2>
					<p class="text-sm text-muted-foreground">{$LL.settings.createBackupDescription()}</p>
				</div>
				<Button onclick={onCreateBackup} disabled={isManagingBackups}>
					{isCreatingBackup
						? $LL.common.actions.creatingBackup()
						: $LL.common.actions.createBackup()}
				</Button>
			</div>

			<div class="space-y-3">
				<h2 class="text-base font-semibold">{$LL.settings.restoreBackupTitle()}</h2>
				{#if backups.length === 0}
					<p
						class="rounded-xl border border-dashed border-border/70 bg-background/40 p-4 text-sm text-muted-foreground"
					>
						{$LL.settings.noBackups()}
					</p>
				{:else}
					<div class="space-y-3">
						{#each backups as backup (`${backup.filename}-${backup.createdAt}`)}
							<div
								class={cn(
									'flex flex-wrap items-center justify-between gap-3 rtl:flex-row-reverse',
									settingsSubtlePanelClass
								)}
							>
								<div class="min-w-0 space-y-1">
									<p class="font-medium break-all">{backup.filename}</p>
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
										onclick={() => onRestoreBackup(backup.filename)}
										disabled={isManagingBackups}
									>
										{isRestoringBackup
											? $LL.common.actions.restoring()
											: $LL.common.actions.restore()}
									</Button>
									{#if !backup.isProtected}
										<Button
											variant="destructive"
											onclick={() => openDeleteBackupDialog(backup.filename)}
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
