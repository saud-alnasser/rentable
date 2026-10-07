<script lang="ts">
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Progress } from '@rentable/design/primitive/progress/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { reducesMotion } from '@rentable/design/reduces-motion.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleDate } from '$lib/platform/locale';
	import CircleFadingArrowUpIcon from '@lucide/svelte/icons/circle-fading-arrow-up';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import PackageIcon from '@lucide/svelte/icons/package';
	import PackagePlusIcon from '@lucide/svelte/icons/package-plus';
	import PowerIcon from '@lucide/svelte/icons/power';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import { describeUpdate } from '../announcement';
	import { updater } from '../updater.svelte';

	/**
	 * THE UPDATE ACTION
	 *
	 * One control for updating rentable, drawn wherever a person may need to update (effort 857,
	 * requirement 11): it checks for a release, downloads it, and installs it and restarts into it,
	 * and says plainly when none is out or none can be reached. Where the update stands is the
	 * updater's (`../updater.svelte.ts`), so every place this is drawn shows the same download, and
	 * one started at launch is the one a person finds here.
	 *
	 * **Three variants, for three places.**
	 *
	 * - `screen`: the act of the workspace-held screen, a sentence above one labelled button and
	 *   the download's progress between them. The screen around it is ticket 11's.
	 * - `notice`: inside the read-only notice's callout, the sentence and a small button on one line.
	 *   The callout around it is ticket 12's.
	 * - `card`: the Settings card, as it was before effort 857 (effort 846, *Everything in a tab is a
	 *   card*): the version this installation runs and the one it could move to, the state in words
	 *   at the header's end, the release's notes folded under the available version, the download's
	 *   progress at the card's foot, and the check as an icon control named by its tooltip.
	 *
	 * **The screen and the notice say each outcome on themselves**, since the person reading them is
	 * held and looking at them, and nothing is raised over them. **The card announces** what a press
	 * produced as a toast and leaves its rows as they were, which it always has
	 * (`../announcement.ts`); a release ready to install is offered with the restart in a toast, as
	 * the launch's background download is.
	 *
	 * **One act at a time, and always the next one**: check, then download, then restart, and a
	 * failure offers the same act again as *try again*. Restart pushes what this machine holds
	 * before the installer takes the process.
	 *
	 * The card's notes, from effort 846: the way forward is a labelled button with a glyph on the
	 * start and the check an icon control on the end, so the control that changes this installation
	 * never moves under a pointer that meant to check; the available version shows a version or
	 * nothing; and the check's glyph turns while it runs and holds still for a reader who asked for
	 * less motion (`reducesMotion`, read as the check starts), with the button `aria-busy` as long.
	 */
	let {
		variant,
		version = ''
	}: {
		variant: 'screen' | 'notice' | 'card';
		/** the version this installation runs, which the card shows. */
		version?: string;
	} = $props();

	const update = updater;

	/** the reader asked for less motion, read as the check starts, so the glyph holds still. */
	let holdsStill = $state(false);

	/** where the screen and the notice say the update stands. */
	const sentence = $derived(
		describeUpdate({ phase: update.phase, release: update.release, failure: update.failure }, $LL)
	);

	/** the next act: what a press on the screen's or the notice's one button does. */
	const next = $derived.by(() => {
		switch (update.phase) {
			case 'available':
			case 'downloading':
				return 'download' as const;
			case 'ready':
			case 'installing':
				return 'restart' as const;
			default:
				return 'check' as const;
		}
	});

	const nextLabel = $derived(
		update.failure ? $LL.update.actions.tryAgain() : $LL.update.actions[next]()
	);

	/** the screen and the notice say the outcome on themselves; the card toasts it. */
	const voice = $derived(variant === 'card' ? ('toast' as const) : ('inline' as const));

	function checkForUpdates() {
		if (update.busy) {
			return;
		}

		holdsStill = reducesMotion();
		void update.check(voice);
	}

	function press() {
		switch (next) {
			case 'check':
				return checkForUpdates();
			case 'download':
				return void update.download(voice);
			case 'restart':
				return void update.install(voice);
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
	 * where the installation stands, for the card header's end. `null` before anything has been
	 * asked, which the header leaves blank.
	 */
	const cardState = $derived.by(() => {
		switch (update.phase) {
			case 'checking':
				return 'checking' as const;
			case 'downloading':
				return 'downloading' as const;
			case 'ready':
			case 'installing':
				return 'restart' as const;
			case 'available':
				return 'available' as const;
			case 'upToDate':
				return 'upToDate' as const;
			default:
				return null;
		}
	});

	/** the check's name, which says what it is doing while it does it. */
	const checkLabel = $derived(
		update.phase === 'checking' ? $LL.update.actions.checking() : $LL.update.actions.check()
	);
</script>

<!-- a version or a progress figure is the machine's and reads left to right in both locales. -->
{#snippet figure(value: string)}
	<span class="tabular-nums" dir="ltr">{value}</span>
{/snippet}

<!-- the glyph of the next act, the one a concept keeps everywhere it appears. -->
{#snippet nextGlyph()}
	{#if next === 'download'}
		<DownloadIcon class="size-4" />
	{:else if next === 'restart'}
		<PowerIcon class="size-4" />
	{:else}
		<RefreshCwIcon
			class="size-4 {update.phase === 'checking' && !holdsStill
				? 'animate-spin motion-reduce:animate-none'
				: ''}"
		/>
	{/if}
{/snippet}

{#if variant === 'screen'}
	<div data-update-action="screen" class="flex w-full flex-col items-center gap-4 text-center">
		<p class="text-sm text-muted-foreground" role="status" aria-live="polite" data-update-sentence>
			{sentence}
		</p>
		{#if update.phase === 'downloading'}
			<div class="flex w-full max-w-xs flex-col gap-2">
				<Progress
					value={update.percent}
					max={100}
					aria-label={sentence}
					class={update.percent === null
						? 'animate-pulse [&>[data-slot=progress-indicator]]:w-1/3'
						: undefined}
				/>
				{#if update.percent !== null}
					<p class="text-xs text-muted-foreground" data-update-progress>
						{@render figure(`${update.percent}%`)}
					</p>
				{/if}
			</div>
		{/if}
		<Button disabled={update.busy} aria-busy={update.busy} data-update-act onclick={press}>
			{@render nextGlyph()}
			{nextLabel}
		</Button>
	</div>
{:else if variant === 'notice'}
	<div data-update-action="notice" class="flex flex-wrap items-center gap-3">
		<p class="min-w-0 flex-1" role="status" aria-live="polite" data-update-sentence>
			{sentence}
		</p>
		{#if update.phase === 'downloading' && update.percent !== null}
			<span class="text-xs" data-update-progress>{@render figure(`${update.percent}%`)}</span>
		{/if}
		<Button
			variant="outline"
			size="sm"
			disabled={update.busy}
			aria-busy={update.busy}
			data-update-act
			onclick={press}
		>
			{@render nextGlyph()}
			{nextLabel}
		</Button>
	</div>
{:else}
	<!-- the release this installation could move to, where a check found one. -->
	{#snippet availableFigure()}
		{#if update.release}
			{@render figure(update.release.version)}
		{/if}
	{/snippet}

	<!-- where this installation stands, in words, at the end of the card's header: solid where
	     something waits on the reader, quiet where nothing does. -->
	{#snippet stateBadge()}
		{#if cardState}
			<Badge
				variant={cardState === 'available' || cardState === 'restart' ? 'default' : 'secondary'}
				data-updates-state={cardState}
			>
				{$LL.update.card.state[cardState]()}
			</Badge>
		{/if}
	{/snippet}

	<!-- the release's date and its notes, folded under the available version. -->
	{#snippet whatsNew()}
		{#if update.release}
			<p data-release-date>
				{$LL.update.card.releasedOn({ date: formatReleaseDate(update.release.date) })}
			</p>
			{#if update.release.body}
				<p class="whitespace-pre-wrap" dir="auto" data-release-notes>{update.release.body}</p>
			{/if}
		{/if}
	{/snippet}

	<!-- the download while it runs, at the card's foot: indeterminate where the server sent no
	     length, which is a real answer rather than a bar stuck at zero. -->
	{#snippet downloading()}
		<p class="text-xs tabular-nums" data-update-progress>
			{$LL.update.card.downloading()}{#if update.percent !== null}
				&nbsp;·&nbsp;{update.percent}%{/if}
		</p>
		<Progress
			value={update.percent}
			max={100}
			aria-label={$LL.update.card.downloading()}
			class={update.percent === null
				? 'animate-pulse [&>[data-slot=progress-indicator]]:w-1/3'
				: undefined}
		/>
	{/snippet}

	<div data-updates data-update-action="card" class="contents">
		<SettingsGroup
			icon={CircleFadingArrowUpIcon}
			title={$LL.update.card.title()}
			description={$LL.update.card.description()}
			value={cardState ? stateBadge : undefined}
			footer={update.phase === 'downloading' ? downloading : undefined}
		>
			{#snippet rows()}
				<SettingsRow icon={PackageIcon} name={$LL.update.card.currentVersion()}>
					{#snippet value()}
						{@render figure(version)}
					{/snippet}
				</SettingsRow>

				<SettingsRow
					icon={PackagePlusIcon}
					name={$LL.update.card.availableVersion()}
					details={update.release ? whatsNew : undefined}
					detailsLabel={update.release
						? $LL.update.card.whatsNew({ version: update.release.version })
						: undefined}
					detailsKey="update.card.whats-new"
					value={update.release ? availableFigure : undefined}
				>
					{#snippet control()}
						<div class="flex flex-wrap items-center justify-end gap-2">
							{#if next !== 'check'}
								<Button variant="outline" size="sm" disabled={update.busy} onclick={press}>
									{@render nextGlyph()}
									{$LL.update.actions[next]()}
								</Button>
							{/if}

							<!-- named by its tooltip and its accessible name alike. -->
							<Tooltip.Root>
								<Tooltip.Trigger>
									{#snippet child({ props })}
										<Button
											{...props}
											variant="outline"
											size="icon-sm"
											aria-label={checkLabel}
											aria-busy={update.phase === 'checking'}
											disabled={update.busy}
											data-check-for-updates
											onclick={checkForUpdates}
										>
											<!-- turning while the check runs; still where the reader asked for less
											     motion, and the media query holds it still as well should they ask
											     while it turns. -->
											<RefreshCwIcon
												class="size-4 {update.phase === 'checking' && !holdsStill
													? 'animate-spin motion-reduce:animate-none'
													: ''}"
												data-check-for-updates-glyph
											/>
										</Button>
									{/snippet}
								</Tooltip.Trigger>
								<Tooltip.Content side="top" sideOffset={8} data-check-for-updates-hint>
									{checkLabel}
								</Tooltip.Content>
							</Tooltip.Root>
						</div>
					{/snippet}
				</SettingsRow>
			{/snippet}
		</SettingsGroup>
	</div>
{/if}
