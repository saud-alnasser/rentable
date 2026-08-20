<script lang="ts">
	import api from '$lib/api/caller';
	import { tauri } from '$lib/platform/tauri';
	import PageFrame from '$lib/design/block/page-frame.svelte';
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
	import SettingsUpdates from '$lib/settings/component/updates.svelte';
	import { useFetchSettings } from '$lib/settings/query';
	import { toast } from 'svelte-sonner';

	/**
	 * The application's own settings, and nothing else's.
	 *
	 * **Two of its five groups were never settings**, and both left on 2026-08-20: the account went
	 * to `/account` and the workspace to `/workspace`, each reached from the sidebar control that
	 * names it. What is here is what a person changes about this copy of the application, and it
	 * is the only page of the three that reads its own query rather than the shell's.
	 */
	const settingsQuery = useFetchSettings();

	const isLoading = $derived(settingsQuery.isLoading && !settingsQuery.data);
	const loadError = $derived(
		settingsQuery.error && !settingsQuery.data ? settingsQuery.error : undefined
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
	<!-- no description between the title and the failure: the title says the settings are not
	     available and the line below says why, so a sentence in between only says it a third
	     time in weaker words. -->
	<StandaloneSurface title={$LL.settings.loadErrorTitle()}>
		<p class="text-sm text-muted-foreground">{toErrorText(loadError, $LL)}</p>

		{#snippet actions()}
			<Button onclick={() => void settingsQuery.refetch()}>
				{$LL.common.actions.retry()}
			</Button>
		{/snippet}
	</StandaloneSurface>
{:else if settingsQuery.data}
	<PageFrame>
		<!-- the title alone: the sentence under it listed the groups whose own legends are directly
		     below, so the page opened by naming its contents twice. -->
		<h1 class="text-3xl font-semibold tracking-tight">{$LL.settings.title()}</h1>

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
	</PageFrame>
{/if}
