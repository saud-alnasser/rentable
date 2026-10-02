<script lang="ts">
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { toErrorDetail } from '$lib/error/message';
	import { toTauriErrorCode } from '$lib/error/tauri';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { recordDiagnosticError } from '$lib/platform/diagnostics';
	import { formatLocaleDate } from '$lib/platform/locale';
	import type { AvailableUpdate, UpdaterDownloadEvent } from '$lib/update';
	import { useCheckForUpdate, usePrepareUpdate, useRestartApp } from '$lib/update/ui';
	import { announceUpdateOutcome } from '$lib/settings/update-announcement';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import PackageIcon from '@lucide/svelte/icons/package';
	import PowerIcon from '@lucide/svelte/icons/power';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import { onDestroy } from 'svelte';

	/**
	 * What this installation is running, and how it gets the next one.
	 *
	 * **A group of the general section, drawn on the shared settings group and row** (effort 846,
	 * requirement 1): the version this installation runs, and the one it could move to with the act
	 * that gets there. What a check does is said once, under the group; the release's date and notes
	 * and the download's progress stand beneath it while there is one.
	 *
	 * **Its acts are labelled buttons with a glyph**, as every row control in the area is, rather
	 * than the glyph-only chips they were (requirement 5): a chip here beside a labelled button in
	 * the next group was the odd one out. The way forward, install or restart, sits on the start and
	 * the check on the end, so the control that changes this installation never moves under the
	 * pointer of somebody who meant to press check.
	 *
	 * **The outcome is announced rather than deposited.** A check that finds nothing, a check that
	 * fails and an install that finished each raise a toast and leave this group as it was. What
	 * stands here is only what is true independently of anybody having pressed anything: the
	 * version, and a release when there is one. What each of those says is
	 * `settings/update-announcement.ts`'s rather than written out here four times. A runes file
	 * cannot be imported by the test harness, so a decision left in one is a decision nothing can
	 * drive.
	 *
	 * *The section was arranged by a prototype in
	 * `[[efforts/settings-and-the-workspace-finish-what-they-offer]]`, requirement 2, which kept it
	 * a section of its own at about this height; this keeps that and draws it as rows.*
	 */
	let { version }: { version: string } = $props();

	const checkForUpdateMutation = useCheckForUpdate();
	const prepareUpdateMutation = usePrepareUpdate();
	const restartAppMutation = useRestartApp();

	let isCheckingForUpdate = $state(false);
	let availableUpdate = $state<AvailableUpdate | null>(null);
	let isInstallingUpdate = $state(false);
	let isInstalled = $state(false);
	let downloadedBytes = $state(0);
	let contentLength = $state<number | null>(null);

	/**
	 * the release this installation could move to, kept after the handle behind it is closed.
	 *
	 * `availableUpdate` is a live handle and installing closes it, so reading the version and the
	 * notes off it would empty the panel at the moment the reader most wants to check what they are
	 * installing. The facts are copied out when the check answers; the handle is only ever the
	 * thing `downloadAndInstall` is called on.
	 */
	let release = $state<{ version: string; date?: string | null; body?: string | null } | null>(
		null
	);

	const percent = $derived.by(() => {
		if (!contentLength || contentLength <= 0) {
			return null;
		}

		return Math.min(100, Math.round((downloadedBytes / contentLength) * 100));
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
		isInstalled = false;
		downloadedBytes = 0;
		contentLength = null;

		try {
			const update = await checkForUpdateMutation.mutateAsync();

			await closeAvailableUpdate();
			availableUpdate = update;
			release = update && { version: update.version, date: update.date, body: update.body };

			announceUpdateOutcome({ kind: 'checked', hasRelease: update !== null }, $LL);
		} catch (error) {
			logUpdaterError('check for updates', error);
			announceUpdateOutcome({ kind: 'failed', error }, $LL);
		}

		isCheckingForUpdate = false;
	}

	async function installUpdate() {
		const update = availableUpdate;

		if (!update || isInstallingUpdate) {
			return;
		}

		isInstallingUpdate = true;
		isInstalled = false;
		downloadedBytes = 0;
		contentLength = null;

		try {
			await prepareUpdateMutation.mutateAsync({ targetVersion: update.version });

			await update.downloadAndInstall((event: UpdaterDownloadEvent) => {
				switch (event.event) {
					case 'Started':
						contentLength = event.data.contentLength ?? null;
						downloadedBytes = 0;
						break;
					case 'Progress':
						downloadedBytes += event.data.chunkLength;
						break;
					case 'Finished':
						if (contentLength) {
							downloadedBytes = contentLength;
						}
						break;
				}
			});

			isInstalled = true;
			availableUpdate = null;
			await update.close();
			announceUpdateOutcome({ kind: 'installed' }, $LL);
		} catch (error) {
			logUpdaterError('install update', error);
			announceUpdateOutcome({ kind: 'failed', error }, $LL);
		}

		isInstallingUpdate = false;
	}

	async function restartApp() {
		try {
			await restartAppMutation.mutateAsync();
		} catch (error) {
			announceUpdateOutcome({ kind: 'failed', error }, $LL);
		}
	}

	function formatReleaseDate(value: string | null | undefined) {
		if (!value) {
			return $LL.common.messages.unknown();
		}

		const date = new Date(value);

		return Number.isNaN(date.valueOf())
			? value
			: formatLocaleDate($locale, date, { dateStyle: 'medium', timeStyle: 'short' });
	}

	/**
	 * what the available row shows, which is a figure only once there is one.
	 *
	 * Three of its four answers are not versions, and that is deliberate: the row is the place a
	 * reader looks for *is there a newer one*, so it answers that question in every state rather
	 * than appearing when the answer is yes and leaving a hole when it is no.
	 */
	const availableValue = $derived(
		release
			? release.version
			: isCheckingForUpdate
				? $LL.settings.updatesChecking()
				: $LL.common.messages.unknown()
	);
</script>

<!-- a version is the machine's and reads left to right in both locales; the words that stand in
     for one while there is no version are the reader's. -->
{#snippet figure(value: string, isFigure: boolean)}
	<span class={isFigure ? 'tabular-nums' : undefined} dir={isFigure ? 'ltr' : undefined}>
		{value}
	</span>
{/snippet}

<div data-updates class="flex flex-col gap-3">
	<SettingsGroup title={$LL.settings.updatesTitle()} footer={$LL.settings.updatesDescription()}>
		{#snippet rows()}
			<SettingsRow icon={PackageIcon} name={$LL.common.labels.currentVersion()}>
				{#snippet value()}
					{@render figure(version, true)}
				{/snippet}
			</SettingsRow>

			<SettingsRow icon={DownloadIcon} name={$LL.common.labels.availableVersion()}>
				{#snippet value()}
					{@render figure(availableValue, release !== null)}
				{/snippet}

				{#snippet control()}
					<div class="flex items-center gap-2">
						{#if availableUpdate}
							<Button
								variant="outline"
								size="sm"
								disabled={isInstallingUpdate || isCheckingForUpdate}
								onclick={() => void installUpdate()}
							>
								<DownloadIcon class="size-4" />
								{isInstallingUpdate
									? $LL.common.actions.installingUpdate()
									: $LL.common.actions.downloadAndInstall()}
							</Button>
						{:else if isInstalled}
							<Button variant="outline" size="sm" onclick={() => void restartApp()}>
								<PowerIcon class="size-4" />
								{$LL.common.actions.restartApp()}
							</Button>
						{/if}

						<Button
							variant="outline"
							size="sm"
							disabled={isCheckingForUpdate || isInstallingUpdate}
							onclick={() => void checkForUpdates()}
						>
							<RefreshCwIcon class="size-4" />
							{isCheckingForUpdate
								? $LL.common.actions.checkingForUpdates()
								: $LL.common.actions.checkForUpdates()}
						</Button>
					</div>
				{/snippet}
			</SettingsRow>
		{/snippet}
	</SettingsGroup>

	{#if release}
		<div class="space-y-3 rounded-2xl border bg-card p-3 text-start">
			<div>
				<p class="text-xs text-muted-foreground uppercase">
					{$LL.common.labels.releaseDate()}
				</p>
				<p class="mt-1 text-sm font-medium">{formatReleaseDate(release.date)}</p>
			</div>

			{#if release.body}
				<div class="space-y-1 border-t pt-3">
					<p class="text-xs text-muted-foreground uppercase">
						{$LL.common.labels.releaseNotes()}
					</p>
					<p class="text-sm whitespace-pre-wrap text-muted-foreground">{release.body}</p>
				</div>
			{/if}
		</div>
	{/if}

	{#if isInstallingUpdate}
		<div class="space-y-1 px-3">
			<p class="text-xs text-muted-foreground tabular-nums">
				{$LL.settings.downloadingUpdate()}{#if percent !== null}
					&nbsp;·&nbsp;{percent}%{/if}
			</p>

			<!-- indeterminate where the server sent no length, which is a real answer rather than a
			     bar stuck at zero: the download is happening and its size is not known. -->
			<div class="h-2 overflow-hidden rounded-full bg-muted">
				<div
					class="h-full bg-primary {percent === null
						? 'w-1/3 animate-pulse'
						: 'transition-[width]'}"
					style={percent === null ? undefined : `width: ${percent}%`}
				></div>
			</div>
		</div>
	{/if}
</div>
