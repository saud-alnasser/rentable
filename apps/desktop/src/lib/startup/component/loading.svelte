<script lang="ts">
	import WayInSurface from '@rentable/design/block/way-in-surface.svelte';
	import { Progress } from '@rentable/design/primitive/progress/index.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleDate } from '$lib/platform/locale';
	import { migrationNotice } from '$lib/startup/migration-notice.svelte';
	import { startupProgressWithin, startupStage } from '$lib/startup/stage.svelte';

	/**
	 * What the application shows while it is starting.
	 *
	 * **The last step of the way in, on its surface** (effort 843, requirement 9). After a first
	 * run, a join or a sign-in, and on a launch before anybody is in, the loading keeps the way in's
	 * mark and column, with the bar in the column where a step's controls go, so arriving reads as
	 * the last step of the same sequence rather than a new screen; the rail comes with the
	 * application. It has no title: it asks nothing. *It was a mark and a bar of its own, centred
	 * in the window, until then, and before that the standalone surface's card, which gave a
	 * non-event the weight of an event.*
	 *
	 * **A bar, not a spinner.** Chosen by looking, out of seven presentations
	 * ([[efforts/capabilities-only-one-surface-got/evidence/prototypes/what-the-loading-screen-should-be]]).
	 * A spinner and a pulsing mark are both indefinite: they look the same at half a second and at
	 * forty, so watching one teaches nothing and eventually reads as a hang. A bar that has moved
	 * since the reader last looked cannot be mistaken for one.
	 *
	 * **The stages are real**, which is what makes the bar a report — see
	 * `$lib/startup/stage.svelte`. The counter beside the stage says which of the pass's steps
	 * this is, five on a launch and four on the pass that readies the first workspace, and it is the
	 * exact figure on the screen: the bar's position is an estimate eased from
	 * measured stage durations, so the two are deliberately different kinds of claim and the precise
	 * one is spelled out rather than left to a length.
	 *
	 * **No product name**, per [[efforts/the-shell-says-whose-workspace-this-is]] requirement 5:
	 * the window title, the taskbar and the installer have all said it before this screen gets a
	 * turn.
	 */

	/** often enough to read as motion, rarely enough to be nothing on a machine that is busy. */
	const TICK_MS = 120;

	const labels = $derived({
		prepare: $LL.layout.startup.stagePrepare(),
		settings: $LL.layout.startup.stageSettings(),
		account: $LL.layout.startup.stageAccount(),
		workspace: $LL.layout.startup.stageWorkspace(),
		changes: $LL.layout.startup.stageChanges(),
		records: $LL.layout.startup.stageRecords()
	});

	const position = $derived(startupStage.stages.indexOf(startupStage.current) + 1);

	/**
	 * **The bar is weighted and the counter is not**, and the difference is what each one claims.
	 * The bar claims *how much of the wait is behind you*, which only measurement can answer; the
	 * counter claims *which of the steps this is*, which is a fact about the list. Driving both
	 * off the position would put the bar at four fifths while the longest stage was still running.
	 *
	 * **It ticks inside a stage as well as at the boundaries**, because two of the five stages take
	 * almost all of a launch: left to the boundaries alone the bar moves twice in six seconds and
	 * stands still between, and a reader who looks away and back sees exactly what a spinner would
	 * have shown them. `startupProgressWithin` eases toward the next boundary without reaching it,
	 * so the motion never claims a stage is finished before the startup path says it is.
	 */
	let now = $state(Date.now());

	$effect(() => {
		const ticking = setInterval(() => (now = Date.now()), TICK_MS);

		return () => clearInterval(ticking);
	});

	const progress = $derived(
		startupProgressWithin(startupStage.current, now - startupStage.since, startupStage.stages)
	);

	/**
	 * the one moment the bar is not the whole story: a workspace being brought up to this build's
	 * schema on open, by this client or by another member whose lease this one waits on. Said
	 * under the stage, because a migration over the wire takes longer than the stage it runs in
	 * and a bar that stops moving reads as a hang.
	 */
	const upgrading = $derived.by(() => {
		const notice = migrationNotice.current;

		if (!notice || notice.phase === 'done') return null;

		return notice.phase === 'applying'
			? $LL.layout.startup.migrationApplying()
			: $LL.layout.startup.migrationWaiting({
					until: formatLocaleDate($locale, notice.until, { timeStyle: 'medium' })
				});
	});
</script>

<!-- the mark holds still, as on every step of the way in. The bar is the motion, and two moving
     things on an otherwise empty window compete for the same job. -->
<WayInSurface step="loading">
	<div class="flex w-full flex-col gap-2.5" role="status" data-startup-loading>
		<Progress value={progress} class="h-1" />

		<div class="flex items-baseline justify-between gap-3 text-xs">
			<span class="min-w-0 truncate text-foreground">{labels[startupStage.current]}</span>
			<!-- a count is not prose, and it reads left to right in every locale. -->
			<span dir="ltr" class="shrink-0 text-muted-foreground tabular-nums">
				{position}/{startupStage.stages.length}
			</span>
		</div>

		{#if upgrading}
			<p class="text-xs text-muted-foreground" data-startup-migration>{upgrading}</p>
		{/if}
	</div>
</WayInSurface>
