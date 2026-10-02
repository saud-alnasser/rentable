<script lang="ts">
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Progress } from '@rentable/design/primitive/progress/index.js';
	import { toErrorDetail } from '$lib/error/message';
	import { toTauriErrorCode } from '$lib/error/tauri';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { recordDiagnosticError } from '$lib/platform/diagnostics';
	import { formatLocaleDate } from '$lib/platform/locale';
	import type { AvailableUpdate, UpdaterDownloadEvent } from '$lib/update';
	import { useCheckForUpdate, usePrepareUpdate, useRestartApp } from '$lib/update/ui';
	import { announceUpdateOutcome } from '$lib/settings/update-announcement';
	import CircleFadingArrowUpIcon from '@lucide/svelte/icons/circle-fading-arrow-up';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import PackageIcon from '@lucide/svelte/icons/package';
	import PowerIcon from '@lucide/svelte/icons/power';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import { onDestroy } from 'svelte';

	/**
	 * What this installation is running, and how it gets the next one.
	 *
	 * **A card of the general section, drawn on the shared settings group and row** (effort 846,
	 * requirement 1 and *Everything in a tab is a card*): the version this installation runs, and
	 * the one it could move to with the act that gets there. What a check does is said once, in the
	 * card's header, and the header's end says where the installation stands in words (checking,
	 * up to date, update available, downloading, restart to finish), the way Apple's software
	 * update leads with its state; before anything has been asked it says nothing rather than
	 * guess. The release's date and notes fold under the available version as *what's new*, since
	 * few readers read them before installing (*Detail that few readers need folds under its row*),
	 * and the download's progress stands at the card's foot on the shared progress bar while it
	 * runs, never folded. *The notes stood in a second box below the group, and the progress was a
	 * bar drawn by hand, until then.*
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
	/** a check has answered since this card was drawn, so *up to date* is a fact and not a guess. */
	let hasChecked = $state(false);
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
			hasChecked = true;

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
	/**
	 * where the installation stands, for the header's end: the one act under way first, then what
	 * the last check found. `null` before anything has been asked, which the header leaves blank.
	 */
	const updateState = $derived.by(() => {
		if (isCheckingForUpdate) return 'checking' as const;
		if (isInstallingUpdate) return 'downloading' as const;
		if (isInstalled) return 'restart' as const;
		if (release) return 'available' as const;
		if (hasChecked) return 'upToDate' as const;

		return null;
	});

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

<!-- where this installation stands, in words, at the end of the card's header: a badge in the
     tone the state reports, and nothing until there is something to say. -->
{#snippet stateBadge()}
	{#if updateState}
		<!-- solid where something waits on the reader, quiet where nothing does. -->
		<Badge
			variant={updateState === 'available' || updateState === 'restart' ? 'default' : 'secondary'}
			data-updates-state={updateState}
		>
			{$LL.settings.updatesState[updateState]()}
		</Badge>
	{/if}
{/snippet}

<!-- the release's date and its notes, folded under the available version: few readers want them
     before they press install, and the version and the act stay in view. -->
{#snippet whatsNew()}
	{#if release}
		<p data-release-date>{$LL.settings.releasedOn({ date: formatReleaseDate(release.date) })}</p>
		{#if release.body}
			<p class="whitespace-pre-wrap" dir="auto" data-release-notes>{release.body}</p>
		{/if}
	{/if}
{/snippet}

<!-- the download while it runs, at the card's foot: the shared progress bar, indeterminate where
     the server sent no length, which is a real answer rather than a bar stuck at zero. -->
{#snippet downloading()}
	<p class="text-xs tabular-nums" data-update-progress>
		{$LL.settings.downloadingUpdate()}{#if percent !== null}
			&nbsp;·&nbsp;{percent}%{/if}
	</p>
	<Progress
		value={percent}
		max={100}
		aria-label={$LL.settings.downloadingUpdate()}
		class={percent === null ? 'animate-pulse [&>[data-slot=progress-indicator]]:w-1/3' : undefined}
	/>
{/snippet}

<div data-updates class="contents">
	<SettingsGroup
		icon={CircleFadingArrowUpIcon}
		title={$LL.settings.updatesTitle()}
		description={$LL.settings.updatesDescription()}
		value={updateState ? stateBadge : undefined}
		footer={isInstallingUpdate ? downloading : undefined}
	>
		{#snippet rows()}
			<SettingsRow icon={PackageIcon} name={$LL.common.labels.currentVersion()}>
				{#snippet value()}
					{@render figure(version, true)}
				{/snippet}
			</SettingsRow>

			<SettingsRow
				icon={DownloadIcon}
				name={$LL.common.labels.availableVersion()}
				details={release ? whatsNew : undefined}
				detailsLabel={release ? $LL.settings.whatsNew({ version: release.version }) : undefined}
				detailsKey="settings.updates.whats-new"
			>
				{#snippet value()}
					{@render figure(availableValue, release !== null)}
				{/snippet}

				{#snippet control()}
					<div class="flex flex-wrap items-center justify-end gap-2">
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
</div>
