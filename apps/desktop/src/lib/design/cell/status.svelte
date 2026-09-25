<script lang="ts" module>
	import BadgeAlertIcon from '@lucide/svelte/icons/badge-alert';
	import BadgeCheckIcon from '@lucide/svelte/icons/badge-check';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
	import CircleUserRoundIcon from '@lucide/svelte/icons/circle-user-round';
	import ClockAlertIcon from '@lucide/svelte/icons/clock-alert';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import HourglassIcon from '@lucide/svelte/icons/hourglass';
	import LockIcon from '@lucide/svelte/icons/lock';
	import type { TranslationFunctions } from '$lib/i18n/i18n-types';
	import { tv } from 'tailwind-variants';

	export type StatusName = keyof TranslationFunctions['common']['status'];

	/**
	 * The glyph each status is read by.
	 *
	 * These are a system rather than nine pictures, and the system is what makes the set
	 * readable without its words: **being paid in full reads as a check**. So `fulfilled` and
	 * `expired` both carry one and the statuses that owe money carry a clock or an alert —
	 * which is what separates the two pairs a reader would otherwise have to memorise, since
	 * `active`/`fulfilled` and `defaulted`/`expired` differ by nothing else. The contract's own
	 * verdict is a badge, a check or an alert on the one outline, which keeps `fulfilled` apart
	 * from `expired`'s plain circle and `defaulted` apart from `overdue`'s clock. A glyph changed
	 * without that rule in mind breaks the set rather than one entry.
	 *
	 * A unit's two statuses sit outside that rule, since they turn on occupancy, not on payment:
	 * a ring holding a person against an empty dashed ring. They are **held versus empty at a
	 * distance**, because a pair distinguished by fine detail reads as one mark, and a dashed
	 * ring already means *vacant* on the complexes directory beside its count. Occupied was a
	 * solid disc until ticket 33 of effort 832, and a disc in the state colour read as a bare
	 * coloured dot: a shape that says nothing once its colour is taken away.
	 */
	export const statusGlyphs: Record<StatusName, typeof LockIcon> = {
		scheduled: HourglassIcon,
		active: ClockIcon,
		fulfilled: BadgeCheckIcon,
		defaulted: BadgeAlertIcon,
		expired: CircleCheckIcon,
		terminated: LockIcon,
		occupied: CircleUserRoundIcon,
		vacant: CircleDashedIcon,
		overdue: ClockAlertIcon
	};

	/**
	 * The colour each status is read in.
	 *
	 * Blue is the state colour, so it marks what is running and destructive marks what failed;
	 * everything settled or not yet started reads quieter than both. Carried over from the badge
	 * this replaced — within each pair the tone separates them a second time, so the glyph is not
	 * doing the work alone.
	 *
	 * Exported because a figure counting contracts in a status has to read in the same colour as
	 * the status itself: two tables would let a count and a status come to disagree about what
	 * red means, which is the one thing the shared vocabulary exists to prevent.
	 */
	export const statusTones: Record<StatusName, string> = {
		active: 'text-primary',
		occupied: 'text-primary',
		scheduled: 'text-muted-foreground',
		vacant: 'text-muted-foreground',
		expired: 'text-muted-foreground',
		defaulted: 'text-destructive',
		overdue: 'text-destructive',
		terminated: 'text-destructive',
		fulfilled: 'text-foreground'
	};

	const glyph = tv({ base: 'size-4', variants: { status: statusTones } });
</script>

<script lang="ts">
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';

	/**
	 * A status, as every surface renders one: an icon carrying no visible word, naming itself
	 * and saying what it means on hover.
	 */
	let { status }: { status: StatusName } = $props();

	const Glyph = $derived(statusGlyphs[status]);
	const name = $derived($LL.common.status[status]());
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<!-- pointer-events-auto because a surface may lay a click target over its content and
			     disable pointer events beneath it — the work queue's rows do — and a status whose
			     meaning is only reachable by hovering is unreadable there without this. -->
			<span {...props} class="pointer-events-auto inline-flex shrink-0">
				<Glyph class={glyph({ status })} aria-hidden="true" />
				<span class="sr-only">{name}</span>
			</span>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content class="max-w-60" side="top" sideOffset={6}>
		<span class="font-medium capitalize">{name}</span>
		<span class="block text-muted-foreground">{$LL.common.statusDescriptions[status]()}</span>
	</Tooltip.Content>
</Tooltip.Root>
