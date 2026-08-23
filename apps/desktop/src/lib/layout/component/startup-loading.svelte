<script lang="ts">
	import { Progress } from '@rentable/design/primitive/progress/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import {
		STARTUP_STAGES,
		startupProgressWithin,
		startupStage
	} from '$lib/layout/startup-stage.svelte';
	import InnerShadowTopIcon from '@tabler/icons-svelte/icons/inner-shadow-top';

	/**
	 * What the application shows while it is starting.
	 *
	 * **Not the standalone surface, and it is the one screen that is not.** A card is for something
	 * you read or act on, and this asks nothing. The five other screens on that block came to it
	 * because they present the application's own state to a reader who has to take it in; this one
	 * came along for the ride, and wearing the same bordered, ring-lit panel as a failed startup
	 * gave a non-event the weight of an event.
	 *
	 * **A bar, not a spinner.** Chosen by looking, out of seven presentations
	 * ([[efforts/capabilities-only-one-surface-got/evidence/prototypes/what-the-loading-screen-should-be]]).
	 * A spinner and a pulsing mark are both indefinite: they look the same at half a second and at
	 * forty, so watching one teaches nothing and eventually reads as a hang. A bar that has moved
	 * since the reader last looked cannot be mistaken for one.
	 *
	 * **The stages are real**, which is what makes the bar a report — see
	 * `$lib/layout/startup-stage.svelte`. The counter beside the stage says which of five steps this
	 * is, and it is the exact figure on the screen: the bar's position is an estimate eased from
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
		settings: $LL.layout.startup.stageSettings(),
		account: $LL.layout.startup.stageAccount(),
		workspace: $LL.layout.startup.stageWorkspace(),
		changes: $LL.layout.startup.stageChanges(),
		records: $LL.layout.startup.stageRecords()
	});

	const position = $derived(STARTUP_STAGES.indexOf(startupStage.current) + 1);

	/**
	 * **The bar is weighted and the counter is not**, and the difference is what each one claims.
	 * The bar claims *how much of the wait is behind you*, which only measurement can answer; the
	 * counter claims *which of five steps this is*, which is a fact about the list. Driving both
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

	const progress = $derived(startupProgressWithin(startupStage.current, now - startupStage.since));
</script>

<div class="flex min-h-full flex-1 flex-col items-center justify-center gap-6 p-4">
	<!-- the mark holds still. The bar is the motion, and two moving things on an otherwise empty
	     window compete for the same job. -->
	<div
		class="flex size-14 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground"
	>
		<InnerShadowTopIcon class="size-7" />
	</div>

	<div class="flex w-full max-w-xs flex-col gap-2.5" role="status">
		<Progress value={progress} class="h-1" />

		<div class="flex items-baseline justify-between gap-3 text-xs">
			<span class="min-w-0 truncate text-foreground">{labels[startupStage.current]}</span>
			<!-- a count is not prose, and it reads left to right in every locale. -->
			<span dir="ltr" class="shrink-0 text-muted-foreground tabular-nums">
				{position}/{STARTUP_STAGES.length}
			</span>
		</div>
	</div>
</div>
