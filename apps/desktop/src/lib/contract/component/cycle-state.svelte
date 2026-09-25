<script lang="ts" module>
	import CalendarClockIcon from '@lucide/svelte/icons/calendar-clock';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleDotDashedIcon from '@lucide/svelte/icons/circle-dot-dashed';
	import ClockAlertIcon from '@lucide/svelte/icons/clock-alert';
	import HourglassIcon from '@lucide/svelte/icons/hourglass';
	import type { ScheduleCycleState } from '$lib/contract/schedule';
	import type { TranslationFunctions } from '$lib/i18n/i18n-types';
	import { tv } from 'tailwind-variants';

	type StateKey = keyof TranslationFunctions['contracts']['schedule']['states'];

	/**
	 * where each state's name and description sit in the string contract, read by the printed
	 * schedule too, so a state is named the same on paper as on screen.
	 */
	export const stateKeys: Record<ScheduleCycleState, StateKey> = {
		paid: 'paid',
		late: 'late',
		due: 'due',
		'partly-paid': 'partlyPaid',
		upcoming: 'upcoming'
	};

	/**
	 * The glyph each state is read by, drawn from the status system's own (`design/cell/status`):
	 * **paid in full reads as a check**, what is owing and past its day carries the alert on the
	 * clock that `overdue` does, and what has not started yet waits under the hourglass
	 * `scheduled` does. Due today is the calendar's clock, and a cycle part paid ahead of its day
	 * is a ring partly drawn, a cover under way.
	 */
	const stateGlyphs: Record<ScheduleCycleState, typeof HourglassIcon> = {
		paid: CircleCheckIcon,
		late: ClockAlertIcon,
		due: CalendarClockIcon,
		'partly-paid': CircleDotDashedIcon,
		upcoming: HourglassIcon
	};

	/**
	 * The colour each state is read in, by the status system's rule: blue for what is running,
	 * destructive for what failed, quieter than both for what is settled or not yet started.
	 */
	const stateTones: Record<ScheduleCycleState, string> = {
		paid: 'text-foreground',
		late: 'text-destructive',
		due: 'text-primary',
		'partly-paid': 'text-primary',
		upcoming: 'text-muted-foreground'
	};

	const glyph = tv({ base: 'size-4', variants: { state: stateTones } });
</script>

<script lang="ts">
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleMoney } from '$lib/platform/locale';

	/**
	 * A cycle's state, as a status is presented ([[rules/interface]], *Status presentation*): an
	 * icon carrying no visible word, naming itself to a screen reader and saying what it means on
	 * hover. A late cycle with part of it paid names the part, so the lateness is never heard as
	 * nothing having been paid.
	 */
	let { state, covered, amount }: { state: ScheduleCycleState; covered: number; amount: number } =
		$props();

	const Glyph = $derived(stateGlyphs[state]);
	const name = $derived(
		state === 'late' && covered > 0
			? $LL.contracts.schedule.latePart({
					covered: formatLocaleMoney($locale, covered),
					amount: formatLocaleMoney($locale, amount)
				})
			: $LL.contracts.schedule.states[stateKeys[state]]()
	);
	const description = $derived($LL.contracts.schedule.stateDescriptions[stateKeys[state]]());
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<span {...props} class="pointer-events-auto inline-flex shrink-0" data-cycle-state={state}>
				<Glyph class={glyph({ state })} aria-hidden="true" />
				<span class="sr-only">{name}</span>
			</span>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content class="max-w-60" side="top" sideOffset={6}>
		<span class="block font-medium first-letter:uppercase">{name}</span>
		<span class="block text-muted-foreground">{description}</span>
	</Tooltip.Content>
</Tooltip.Root>
