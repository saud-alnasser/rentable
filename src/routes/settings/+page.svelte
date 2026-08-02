<script lang="ts">
	import api from '$lib/api/mod';
	import { tauri } from '$lib/api/tauri';
	import { Button } from '$lib/common/components/fragments/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import { Spinner } from '$lib/common/components/fragments/spinner';
	import { formatLocaleDate } from '$lib/common/utils/locale';
	import { cn } from '$lib/common/utils/tailwind.js';
	import { toErrorText } from '$lib/error/message';
	import { showErrorToast } from '$lib/error/toast';
	import { LL, locale, setLocale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import type { Locales } from '$lib/i18n/i18n-types';
	import SettingsDiagnosticsCard from '$lib/settings/component/diagnostics.svelte';
	import SettingsEndingSoonCard from '$lib/settings/component/ending-soon.svelte';
	import SettingsLocaleCard from '$lib/settings/component/locale.svelte';
	import SettingsSyncCard from '$lib/settings/component/sync.svelte';
	import SettingsUpdatesCard from '$lib/settings/component/updates.svelte';
	import { useFetchRemoteSyncState, useFetchSettings } from '$lib/settings/query';
	import { toast } from 'svelte-sonner';

	const settingsQuery = useFetchSettings();
	const remoteSyncQuery = useFetchRemoteSyncState();
	const settingsCardClass = 'border-border/70 bg-card/65 shadow-xl backdrop-blur-xl';
	const settingsOverviewPanelClass =
		'rounded-[1.25rem] border border-border/70 bg-card/40 p-3 shadow-sm backdrop-blur-md';

	const activeSyncWorkspace = $derived.by(() => remoteSyncQuery.data?.workspace ?? null);

	function formatTimestamp(value: number | null | undefined) {
		if (!value) {
			return $LL.common.messages.never();
		}

		return formatLocaleDate($locale, value, {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
	}

	async function revealDiagnostics() {
		const diagnosticsDir = settingsQuery.data?.diagnosticsDir;

		if (!diagnosticsDir) {
			return;
		}

		try {
			await tauri.opener.revealItemInDir(diagnosticsDir);
		} catch (error) {
			toast.error(toErrorText(error, $LL));
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
			showErrorToast(error, $LL);
		}
	}
</script>

<div class="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 pt-5 pb-8">
	<div class="flex flex-col gap-1">
		<h1 class="text-3xl font-semibold tracking-tight">{$LL.settings.title()}</h1>
		<p class="text-sm text-muted-foreground">{$LL.settings.description()}</p>
	</div>

	{#if (settingsQuery.isLoading && !settingsQuery.data) || (remoteSyncQuery.isLoading && !remoteSyncQuery.data)}
		<div class="flex min-h-full flex-1 items-center justify-center p-1">
			<div class="flex flex-col items-center gap-3">
				<Spinner class="size-8 text-muted-foreground" />
				<p class="text-sm text-muted-foreground">{$LL.common.messages.loadingSettings()}</p>
			</div>
		</div>
	{:else if (settingsQuery.error && !settingsQuery.data) || (remoteSyncQuery.error && !remoteSyncQuery.data)}
		<Card class={cn('max-w-2xl', settingsCardClass)}>
			<CardHeader class="gap-3 border-b border-border/50 pb-5">
				<CardTitle>{$LL.settings.loadErrorTitle()}</CardTitle>
				<CardDescription>{$LL.settings.loadErrorDescription()}</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4 pt-5">
				<p class="text-sm text-muted-foreground">
					{toErrorText(settingsQuery.error ?? remoteSyncQuery.error, $LL)}
				</p>
				<Button
					onclick={() => {
						void settingsQuery.refetch();
						void remoteSyncQuery.refetch();
					}}
				>
					{$LL.common.actions.retry()}
				</Button>
			</CardContent>
		</Card>
	{:else if settingsQuery.data && remoteSyncQuery.data}
		<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
			<div class={settingsOverviewPanelClass}>
				<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
					{$LL.common.labels.appVersion()}
				</p>
				<p class="mt-3 text-lg font-semibold">{settingsQuery.data.version}</p>
			</div>

			<div class={settingsOverviewPanelClass}>
				<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
					{$LL.settings.currentWorkspace()}
				</p>
				<p class="mt-3 text-lg font-semibold">
					{activeSyncWorkspace?.name ?? $LL.common.messages.unknown()}
				</p>
			</div>

			<div class={settingsOverviewPanelClass}>
				<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
					{$LL.settings.latestSnapshot()}
				</p>
				<p class="mt-3 text-lg font-semibold">
					{formatTimestamp(activeSyncWorkspace?.lastSnapshotAt ?? null)}
				</p>
			</div>

			<div class={settingsOverviewPanelClass}>
				<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
					{$LL.settings.localeLabel()}
				</p>
				<p class="mt-3 text-lg font-semibold">{localesMetadata[$locale].label}</p>
			</div>
		</div>

		<div class="grid gap-3 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
			<div class="space-y-3">
				<SettingsLocaleCard currentLocale={$locale} onChange={changeLocale} />

				<SettingsEndingSoonCard settings={settingsQuery.data} />
			</div>

			<div class="space-y-3">
				<SettingsUpdatesCard version={settingsQuery.data.version} />

				<SettingsSyncCard syncState={remoteSyncQuery.data} />

				<SettingsDiagnosticsCard
					diagnosticsDir={settingsQuery.data.diagnosticsDir}
					onRevealDiagnostics={() => void revealDiagnostics()}
				/>
			</div>
		</div>
	{/if}
</div>
