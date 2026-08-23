<script lang="ts">
	import SurfaceAction from '$lib/design/block/surface-action.svelte';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { toErrorDetail } from '$lib/error/message';
	import { toTauriErrorCode } from '$lib/error/tauri';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { recordDiagnosticError } from '$lib/platform/diagnostics';
	import { formatLocaleDate } from '$lib/platform/locale';
	import { type AvailableUpdate, type UpdaterDownloadEvent } from '$lib/platform/tauri';
	import { useCheckForUpdate, usePrepareUpdate, useRestartApp } from '$lib/settings/query';
	import { announceUpdateOutcome } from '$lib/settings/update-announcement';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import PowerIcon from '@lucide/svelte/icons/power';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import { onDestroy } from 'svelte';

	/**
	 * What this installation is running, and how it gets the next one.
	 *
	 * **A row like every other row on this page, and the arrangement was settled by building it.**
	 * `[[efforts/settings-and-the-workspace-finish-what-they-offer]]`, requirement 2, and the
	 * prototype under its `evidence/prototypes/`. Three presentations were put up on the real page:
	 * this one, one that consolidated everything into a single pressable tile, and one that kept a
	 * single glyph here and moved the whole conversation into a dialog. Both of the others argued
	 * the section is too large rather than badly arranged, and both lost — so the section staying a
	 * section, at roughly this height, is a tested decision rather than a default.
	 *
	 * **What it replaced was a stack that grew as a check progressed**: two solid buttons, one of
	 * four callouts, a bordered panel of four figures, a progress bar, a second callout and a
	 * fourth button. The two figures the reader is actually comparing sat in different typographic
	 * registers, and the answer to a check that found nothing stayed on screen until the page was
	 * left.
	 *
	 * **The outcome is announced rather than deposited.** A check that finds nothing, a check that
	 * fails and an install that finished each raise a toast and leave this section as it was, which
	 * is the one behaviour the version this replaces did not have. What stands here is only what is
	 * true independently of anybody having pressed anything: the version, and a release when there
	 * is one.
	 *
	 * **What each of those says is `settings/update-announcement.ts`'s** rather than written out
	 * here four times. A runes file cannot be imported by the test harness, so a decision left in
	 * one is a decision nothing can drive.
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
	 * what fills the second plate, which is a figure only once there is one.
	 *
	 * Three of its four answers are not versions, and that is deliberate: the plate is the place a
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

{#snippet plate(label: string, value: string, isFigure: boolean)}
	<div class="rounded-xl bg-muted p-3">
		<dt class="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
		<!-- a version is the machine's and reads left to right in both locales; the words that
		     stand in for one while there is no version are the reader's. -->
		<dd
			class="mt-1 text-sm break-words {isFigure
				? 'font-medium tabular-nums'
				: 'text-muted-foreground'}"
			dir={isFigure ? 'ltr' : undefined}
		>
			{value}
		</dd>
	</div>
{/snippet}

<div class="space-y-4">
	<Field.Field orientation="responsive">
		<Field.Content>
			<!-- no title of its own: the group above is already called updates, and a row title
			     repeating its own section is the label the section had already given it. -->
			<Field.Description>{$LL.settings.updatesDescription()}</Field.Description>
		</Field.Content>

		<!-- the way forward on the start, the way to look again on the end, so the control that
		     changes this installation never moves under the pointer of somebody who meant to
		     press check. -->
		<div class="flex shrink-0 items-center gap-2">
			{#if availableUpdate}
				<SurfaceAction
					label={isInstallingUpdate
						? $LL.common.actions.installingUpdate()
						: $LL.common.actions.downloadAndInstall()}
					icon={DownloadIcon}
					emphasis="primary"
					disabled={isInstallingUpdate || isCheckingForUpdate}
					onclick={() => void installUpdate()}
				/>
			{:else if isInstalled}
				<SurfaceAction
					label={$LL.common.actions.restartApp()}
					icon={PowerIcon}
					emphasis="primary"
					onclick={() => void restartApp()}
				/>
			{/if}

			<!-- the glyph turns under the pointer, which previews what pressing it does. -->
			<SurfaceAction
				label={isCheckingForUpdate
					? $LL.common.actions.checkingForUpdates()
					: $LL.common.actions.checkForUpdates()}
				icon={RefreshCwIcon}
				spins
				emphasis={availableUpdate || isInstalled ? 'secondary' : 'primary'}
				disabled={isCheckingForUpdate || isInstallingUpdate}
				onclick={() => void checkForUpdates()}
			/>
		</div>
	</Field.Field>

	<!-- the two figures the reader is comparing, in one treatment, which is the treatment
	     `layout/component/startup-recovery.svelte` gives its own pair. That screen keeps its
	     figures for the reason these are kept: a version number is a fact somebody reads off the
	     screen and repeats. -->
	<dl class="grid gap-2 sm:grid-cols-2">
		{@render plate($LL.common.labels.currentVersion(), version, true)}
		{@render plate($LL.common.labels.availableVersion(), availableValue, release !== null)}
	</dl>

	{#if release}
		<div class="space-y-3 rounded-xl border bg-muted p-3 text-start">
			<div>
				<p class="text-xs tracking-wide text-muted-foreground uppercase">
					{$LL.common.labels.releaseDate()}
				</p>
				<p class="mt-1 text-sm font-medium">{formatReleaseDate(release.date)}</p>
			</div>

			{#if release.body}
				<div class="space-y-1 border-t pt-3">
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{$LL.common.labels.releaseNotes()}
					</p>
					<p class="text-sm whitespace-pre-wrap text-muted-foreground">{release.body}</p>
				</div>
			{/if}
		</div>
	{/if}

	{#if isInstallingUpdate}
		<div class="space-y-1">
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
