<script lang="ts">
	import api from '$lib/api/caller';
	import { tauri } from '$lib/platform/tauri';
	import StandaloneSurface from '$lib/design/block/standalone-surface.svelte';
	import { Button } from '$lib/design/primitive/button';
	import * as Field from '$lib/design/primitive/field';
	import { Separator } from '$lib/design/primitive/separator';
	import { Spinner } from '$lib/design/primitive/spinner';
	import { toErrorText } from '$lib/error/message';
	import { showErrorToast } from '$lib/error/toast';
	import { LL, locale, setLocale } from '$lib/i18n/i18n-svelte';
	import type { Locales } from '$lib/i18n/i18n-types';
	import SettingsDiagnostics from '$lib/settings/component/diagnostics.svelte';
	import SettingsEndingSoon from '$lib/settings/component/ending-soon.svelte';
	import SettingsLocale from '$lib/settings/component/locale.svelte';
	import SettingsSync from '$lib/settings/component/sync.svelte';
	import SettingsUpdates from '$lib/settings/component/updates.svelte';
	import { useFetchRemoteSyncState, useFetchSettings } from '$lib/settings/query';
	import { toast } from 'svelte-sonner';

	const settingsQuery = useFetchSettings();
	const remoteSyncQuery = useFetchRemoteSyncState();

	const isLoading = $derived(
		(settingsQuery.isLoading && !settingsQuery.data) ||
			(remoteSyncQuery.isLoading && !remoteSyncQuery.data)
	);
	const loadError = $derived(
		(settingsQuery.error && !settingsQuery.data) || (remoteSyncQuery.error && !remoteSyncQuery.data)
			? (settingsQuery.error ?? remoteSyncQuery.error)
			: undefined
	);

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

{#if isLoading}
	<div class="flex min-h-full flex-1 items-center justify-center p-1">
		<div class="flex flex-col items-center gap-3">
			<Spinner class="size-8 text-muted-foreground" />
			<p class="text-sm text-muted-foreground">{$LL.common.messages.loadingSettings()}</p>
		</div>
	</div>
{:else if loadError}
	<StandaloneSurface
		title={$LL.settings.loadErrorTitle()}
		description={$LL.settings.loadErrorDescription()}
	>
		<p class="text-sm text-muted-foreground">{toErrorText(loadError, $LL)}</p>

		{#snippet actions()}
			<Button
				onclick={() => {
					void settingsQuery.refetch();
					void remoteSyncQuery.refetch();
				}}
			>
				{$LL.common.actions.retry()}
			</Button>
		{/snippet}
	</StandaloneSurface>
{:else if settingsQuery.data && remoteSyncQuery.data}
	<!-- one column of rows in four groups, and no tile strip: every figure the strip carried
	     was stated again by the section that owns it, so the strip only ever said things twice. -->
	<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 pt-5 pb-8">
		<div class="flex flex-col gap-1">
			<h1 class="text-3xl font-semibold tracking-tight">{$LL.settings.title()}</h1>
			<p class="text-sm text-muted-foreground">{$LL.settings.description()}</p>
		</div>

		<Field.Group>
			<Field.Set>
				<Field.Legend>{$LL.settings.groupGeneral()}</Field.Legend>
				<Field.Group>
					<SettingsLocale currentLocale={$locale} onChange={changeLocale} />
					<Field.Separator />
					<SettingsEndingSoon settings={settingsQuery.data} />
				</Field.Group>
			</Field.Set>

			<Separator />

			<Field.Set>
				<Field.Legend>{$LL.settings.groupWorkspace()}</Field.Legend>
				<SettingsSync syncState={remoteSyncQuery.data} />
			</Field.Set>

			<Separator />

			<Field.Set>
				<Field.Legend>{$LL.settings.groupUpdates()}</Field.Legend>
				<SettingsUpdates version={settingsQuery.data.version} />
			</Field.Set>

			<Separator />

			<Field.Set>
				<Field.Legend>{$LL.settings.groupDiagnostics()}</Field.Legend>
				<SettingsDiagnostics
					diagnosticsDir={settingsQuery.data.diagnosticsDir}
					onRevealDiagnostics={() => void revealDiagnostics()}
				/>
			</Field.Set>
		</Field.Group>
	</div>
{/if}
