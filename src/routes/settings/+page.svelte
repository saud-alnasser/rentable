<script lang="ts">
	import api from '$lib/api/mod';
	import { tauri, type AvailableUpdate, type UpdaterDownloadEvent } from '$lib/api/tauri';
	import { Button } from '$lib/common/components/fragments/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import { Spinner } from '$lib/common/components/fragments/spinner';
	import { LL, locale, setLocale } from '$lib/i18n/i18n-svelte';
	import type { Locales } from '$lib/i18n/i18n-types';
	import SettingsAboutCard from '$lib/resources/settings/components/settings-about-card.svelte';
	import SettingsDatabaseCard from '$lib/resources/settings/components/settings-database-card.svelte';
	import SettingsEndingSoonCard from '$lib/resources/settings/components/settings-ending-soon-card.svelte';
	import SettingsLocaleCard from '$lib/resources/settings/components/settings-locale-card.svelte';
	import SettingsUpdatesCard from '$lib/resources/settings/components/settings-updates-card.svelte';
	import {
		useCreateBackup,
		useDeleteBackup,
		useFetchBackups,
		useFetchSettings,
		useResetDatabasePath,
		useRestoreBackup,
		useSetDatabasePath,
		useSetEndingSoonNoticeDays
	} from '$lib/resources/settings/hooks/queries';
	import { onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';

	type AppSettings = Awaited<ReturnType<typeof api.app.settings.get>>;

	const settingsQuery = useFetchSettings();
	const backupsQuery = useFetchBackups();
	const setEndingSoonNoticeDaysMutation = useSetEndingSoonNoticeDays();
	const setDatabasePathMutation = useSetDatabasePath();
	const resetDatabasePathMutation = useResetDatabasePath();
	const createBackupMutation = useCreateBackup();
	const deleteBackupMutation = useDeleteBackup();
	const restoreBackupMutation = useRestoreBackup();
	const settingsCardClass = 'border-border/70 bg-card/65 shadow-xl backdrop-blur-xl';

	let endingSoonNoticeDaysValue = $state<number | ''>('');
	let databasePathValue = $state('');
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
	const getCurrentDatabasePath = (settings: AppSettings) =>
		settings.activeDatabasePath ?? settings.defaultDatabasePath;
	const isUsingDefaultDatabasePath = (settings: AppSettings) =>
		settings.activeDatabasePath === null ||
		settings.activeDatabasePath === settings.defaultDatabasePath;
	const hasDatabasePathChange = $derived.by(() => {
		const settings = settingsQuery.data;
		const trimmedPath = databasePathValue.trim();

		if (!settings) {
			return false;
		}

		return trimmedPath
			? trimmedPath !== getCurrentDatabasePath(settings)
			: !isUsingDefaultDatabasePath(settings);
	});
	const lastBackupAt = $derived.by(() => backupsQuery.data?.[0]?.createdAt ?? null);
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
		databasePathValue = isUsingDefaultDatabasePath(settings)
			? ''
			: getCurrentDatabasePath(settings);
	});

	onDestroy(() => {
		if (availableUpdate) {
			void availableUpdate.close();
		}
	});

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
			const update = await tauri.update.check();

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
			await api.app.update.prepare({ targetVersion: update.version });

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
			await restoreBackupMutation.mutateAsync({ filename: name });
		} catch {
			/* ignore */
		}
	}

	async function deleteBackup(name: string) {
		try {
			await deleteBackupMutation.mutateAsync({ filename: name });
		} catch {
			/* ignore */
		}
	}

	async function changeLocale(next: Locales) {
		if (next === $locale) {
			return;
		}

		const previousLocale = $locale;
		setLocale(next);

		try {
			await api.app.settings.set({ locale: next });
			await settingsQuery.refetch();
		} catch (error) {
			setLocale(previousLocale);
			toast.error(getErrorMessage(error));
		}
	}
</script>

<div class="flex flex-col gap-5 p-1">
	<div class="flex flex-col gap-1">
		<h1 class="text-3xl font-semibold tracking-tight">{$LL.settings.title()}</h1>
		<p class="text-sm text-muted-foreground">{$LL.settings.description()}</p>
	</div>

	{#if (settingsQuery.isLoading && !settingsQuery.data) || (backupsQuery.isLoading && !backupsQuery.data)}
		<div class="flex min-h-full flex-1 items-center justify-center p-1">
			<div class="flex flex-col items-center gap-3">
				<Spinner class="size-8 text-muted-foreground" />
				<p class="text-sm text-muted-foreground">{$LL.common.messages.loadingSettings()}</p>
			</div>
		</div>
	{:else if settingsQuery.error || backupsQuery.error}
		<Card class={`max-w-2xl ${settingsCardClass}`}>
			<CardHeader class="gap-3 border-b border-border/50 pb-5">
				<CardTitle>{$LL.settings.loadErrorTitle()}</CardTitle>
				<CardDescription>{$LL.settings.loadErrorDescription()}</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4 pt-5">
				<p class="text-sm text-muted-foreground">
					{getErrorMessage(settingsQuery.error ?? backupsQuery.error)}
				</p>
				<Button
					onclick={() => {
						void settingsQuery.refetch();
						void backupsQuery.refetch();
					}}
				>
					{$LL.common.actions.retry()}
				</Button>
			</CardContent>
		</Card>
	{:else if settingsQuery.data && backupsQuery.data}
		<div class="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
			<div class="space-y-4">
				<SettingsEndingSoonCard
					settings={settingsQuery.data}
					bind:value={endingSoonNoticeDaysValue}
					isPending={setEndingSoonNoticeDaysMutation.isPending}
					hasChange={hasEndingSoonChange}
					onSave={() => void saveEndingSoonNoticeDays()}
				/>

				<SettingsDatabaseCard
					settings={settingsQuery.data}
					backups={backupsQuery.data}
					bind:databasePathValue
					{isSavingDatabasePath}
					{hasDatabasePathChange}
					isUsingDefaultDatabasePath={isUsingDefaultDatabasePath(settingsQuery.data)}
					{isManagingBackups}
					isCreatingBackup={createBackupMutation.isPending}
					isRestoringBackup={restoreBackupMutation.isPending}
					onSaveDatabasePath={() => void saveDatabasePath()}
					onResetDatabasePath={() => void resetDatabasePath()}
					onCreateBackup={() => void createBackup()}
					onRestoreBackup={(name) => void restoreBackup(name)}
					onDeleteBackup={deleteBackup}
				/>
			</div>

			<div class="space-y-4">
				<SettingsLocaleCard currentLocale={$locale} onChange={changeLocale} />

				<SettingsUpdatesCard
					version={settingsQuery.data.version}
					{isCheckingForUpdate}
					{isInstallingUpdate}
					{hasCheckedForUpdate}
					{availableUpdate}
					{updateCheckError}
					{updateInstallError}
					{updateInstallComplete}
					{updateDownloadedBytes}
					{updateContentLength}
					{updateProgressPercent}
					onCheckForUpdates={() => void checkForUpdates()}
					onInstallUpdate={() => void installUpdate()}
					onRestartApp={() => void restartApp()}
				/>

				<SettingsAboutCard
					version={settingsQuery.data.version}
					{lastBackupAt}
					backupsCount={backupsQuery.data.length}
					usingDefaultDatabasePath={isUsingDefaultDatabasePath(settingsQuery.data)}
				/>
			</div>
		</div>
	{/if}
</div>
